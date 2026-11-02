"""Yala Delivery — courier management tests (profile, vehicle-type documents,
requirement-gated approval, requirement audit).

Verifies the courier management experience matches driver management standards
without merging the modules: bicycle / motorcycle / vehicle couriers are onboarded
separately, automobile documents are never demanded from bicycle couriers, approval
is refused while mandatory requirements are incomplete (on **both** approval paths),
the discrepancy investigation is read-only, and the new endpoints stay admin-only.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from deliveries.courier_onboarding import (
    get_courier_approval_blockers,
    get_required_courier_document_types,
)
from deliveries.models import DriverDeliverySettings
from security.models import AuditLog
from taxi.drivers.models import DriverDocument, DriverProfile

User = get_user_model()


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _courier(email, vehicle_type="motorcycle", status="pending_review", signed=True):
    user = _user(email)
    profile = DriverProfile.objects.create(
        user=user,
        status=status,
        phone_number="+22222123456",
        terms_accepted=signed,
        legal_declaration_accepted=signed,
        signed_full_name="Courier Test" if signed else "",
        signature_image="couriers/signatures/test.png" if signed else "",
    )
    DriverDeliverySettings.objects.create(
        driver=user,
        delivery_mode_enabled=True,
        delivery_vehicle_type=vehicle_type,
    )
    return profile


def _add_document(profile, doc_type, status="pending_review", expires_at=None):
    return DriverDocument.objects.create(
        driver=profile,
        document_type=doc_type,
        file=f"driver/documents/{doc_type}.jpg",
        status=status,
        expires_at=expires_at,
    )


def _complete_documents(profile, vehicle_type, status="pending_review", expires_at=None):
    for doc_type in get_required_courier_document_types(vehicle_type):
        _add_document(profile, doc_type, status=status, expires_at=expires_at)


class VehicleTypeRequirementTests(TestCase):
    """§3 — document requirements differ per courier vehicle type."""

    def test_bicycle_requires_only_the_national_id(self):
        required = get_required_courier_document_types("bicycle")
        self.assertEqual(required, ["national_id"])
        for automobile_doc in ("license", "carte_grise", "insurance", "vignette"):
            self.assertNotIn(automobile_doc, required)

    def test_motorcycle_and_vehicle_require_automobile_documents(self):
        for vehicle_type in ("motorcycle", "car"):
            required = set(get_required_courier_document_types(vehicle_type))
            self.assertTrue({"national_id", "license", "carte_grise", "insurance"} <= required)

    def test_unknown_vehicle_type_defaults_safely(self):
        self.assertEqual(
            set(get_required_courier_document_types("spaceship")),
            set(get_required_courier_document_types("motorcycle")),
        )

    def test_bicycle_courier_blockers_ignore_automobile_documents(self):
        profile = _courier("bike-blockers@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id")

        blockers = get_courier_approval_blockers(profile)
        self.assertFalse(blockers["blocked"])
        self.assertEqual(blockers["vehicle_type"], "bicycle")
        self.assertEqual(blockers["missing_document_types"], [])

    def test_motorcycle_courier_blockers_list_automobile_documents(self):
        profile = _courier("moto-blockers@yala.test", vehicle_type="motorcycle")
        _add_document(profile, "national_id")

        blockers = get_courier_approval_blockers(profile)
        self.assertTrue(blockers["blocked"])
        self.assertIn("license", blockers["missing_document_types"])
        self.assertIn("carte_grise", blockers["missing_document_types"])
        self.assertIn("insurance", blockers["missing_document_types"])


class DocumentChecklistTests(TestCase):
    """§3 — the admin sees missing/pending/approved/rejected/expired clearly."""

    def setUp(self):
        self.admin = _user("ops-courier@yala.test", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _requirements(self, profile):
        return self.client.get(f"/deliveries/admin/couriers/{profile.id}/requirements/")

    def test_checklist_reports_every_state(self):
        profile = _courier("states@yala.test", vehicle_type="motorcycle")
        _add_document(profile, "national_id", status="approved")
        _add_document(profile, "license", status="pending_review")
        _add_document(profile, "carte_grise", status="rejected")
        _add_document(
            profile,
            "insurance",
            status="approved",
            expires_at=timezone.now().date() - timezone.timedelta(days=1),
        )

        res = self._requirements(profile)
        self.assertEqual(res.status_code, 200)
        states = {
            row["document_type"]: row["state"]
            for row in res.data["documents"]["requirements"]
        }
        self.assertEqual(states["national_id"], "approved")
        self.assertEqual(states["license"], "pending_review")
        self.assertEqual(states["carte_grise"], "rejected")
        self.assertEqual(states["insurance"], "expired")
        self.assertTrue(res.data["approval_blockers"]["blocked"])

    def test_missing_documents_are_reported_as_missing(self):
        profile = _courier("missing@yala.test", vehicle_type="car")
        res = self._requirements(profile)
        states = {
            row["document_type"]: row["state"]
            for row in res.data["documents"]["requirements"]
        }
        self.assertEqual(states["national_id"], "missing")
        self.assertEqual(res.data["documents"]["states"]["missing"], 4)

    def test_extra_documents_are_not_treated_as_blockers_for_bicycle(self):
        profile = _courier("bike-extra@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id")
        _add_document(profile, "license")  # uploaded voluntarily

        res = self._requirements(profile)
        not_required = [row["document_type"] for row in res.data["documents"]["not_required"]]
        self.assertIn("license", not_required)
        self.assertFalse(res.data["approval_blockers"]["blocked"])

    def test_profile_endpoint_exposes_the_professional_fields(self):
        profile = _courier("profile@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id")

        res = self.client.get(f"/deliveries/admin/couriers/{profile.id}/profile/")
        self.assertEqual(res.status_code, 200)
        for key in (
            "full_name",
            "email",
            "phone_number",
            "account_status",
            "is_online",
            "vehicle_type",
            "vehicle_label",
            "documents",
            "signature_complete",
            "registration_date",
            "deliveries",
            "earnings",
            "can_approve",
        ):
            self.assertIn(key, res.data, key)
        self.assertEqual(res.data["vehicle_type"], "bicycle")
        self.assertTrue(res.data["signature_complete"])
        self.assertTrue(res.data["can_approve"])



class CourierApprovalGateTests(TestCase):
    """§4 — approval is refused while mandatory requirements are incomplete."""

    def setUp(self):
        self.admin = _user("approver@yala.test", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _approve(self, profile):
        return self.client.post(
            f"/security/admin/couriers/{profile.id}/action/",
            {"action": "approve"},
            format="json",
        )

    def test_approval_is_blocked_when_required_documents_are_missing(self):
        profile = _courier("gate-missing@yala.test", vehicle_type="motorcycle")
        res = self._approve(profile)

        self.assertEqual(res.status_code, 400)
        self.assertIn("incomplete", res.data["error"])
        self.assertIn("license", res.data["missing_document_types"])
        profile.refresh_from_db()
        self.assertEqual(profile.status, "pending_review")

    def test_bicycle_courier_is_approved_without_automobile_documents(self):
        profile = _courier("gate-bike@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id")

        res = self._approve(profile)
        self.assertEqual(res.status_code, 200)
        profile.refresh_from_db()
        self.assertEqual(profile.status, "approved")

    def test_motorcycle_courier_needs_the_full_document_set(self):
        profile = _courier("gate-moto@yala.test", vehicle_type="motorcycle")
        _add_document(profile, "national_id")
        _add_document(profile, "license")
        self.assertEqual(self._approve(profile).status_code, 400)

        _add_document(profile, "carte_grise")
        _add_document(profile, "insurance")
        self.assertEqual(self._approve(profile).status_code, 200)

    def test_expired_document_blocks_approval(self):
        profile = _courier("gate-expired@yala.test", vehicle_type="bicycle")
        _add_document(
            profile,
            "national_id",
            expires_at=timezone.now().date() - timezone.timedelta(days=5),
        )

        res = self._approve(profile)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["expired_document_types"], ["national_id"])

    def test_rejected_document_blocks_approval(self):
        profile = _courier("gate-rejected@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id", status="rejected")

        res = self._approve(profile)
        self.assertEqual(res.status_code, 400)
        self.assertIn("national_id", res.data["missing_document_types"])

    def test_missing_signature_still_blocks_approval(self):
        profile = _courier("gate-unsigned@yala.test", vehicle_type="bicycle", signed=False)
        _add_document(profile, "national_id")

        res = self._approve(profile)
        self.assertEqual(res.status_code, 400)
        # The e-signature gate fires first and reports the legal signature block.
        self.assertIn("signature", res.data["error"].lower())
        profile.refresh_from_db()
        self.assertEqual(profile.status, "pending_review")

    def test_approval_is_audited(self):
        profile = _courier("gate-audit@yala.test", vehicle_type="bicycle")
        _add_document(profile, "national_id")
        self._approve(profile)

        log = (
            AuditLog.objects.filter(entity_id=profile.user_id, entity_type="courier")
            .order_by("-created_at")
            .first()
        )
        self.assertIsNotNone(log)
        self.assertIn("approved", log.summary.lower())

class CourierRequirementAuditTests(TestCase):
    """§4 — investigate approved-but-incomplete records without auto-suspension."""

    def setUp(self):
        self.admin = _user("audit-courier@yala.test", is_staff=True)
        self.plain = _user("plain-courier@yala.test")
        self.client = APIClient()

    def test_audit_lists_approved_couriers_with_incomplete_requirements(self):
        offender = _courier("legacy-approved@yala.test", vehicle_type="motorcycle", status="approved")
        clean = _courier("clean-approved@yala.test", vehicle_type="bicycle", status="approved")
        _add_document(clean, "national_id")

        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/deliveries/admin/couriers/requirements-audit/")

        self.assertEqual(res.status_code, 200)
        emails = [row["email"] for row in res.data["results"]]
        self.assertIn("legacy-approved@yala.test", emails)
        self.assertNotIn("clean-approved@yala.test", emails)
        row = next(r for r in res.data["results"] if r["email"] == offender.user.email)
        self.assertIn("license", row["missing_document_types"])
        self.assertTrue(res.data["read_only"])

    def test_audit_never_mutates_historical_accounts(self):
        offender = _courier("no-mutate@yala.test", vehicle_type="car", status="approved")
        self.client.force_authenticate(user=self.admin)
        self.client.get("/deliveries/admin/couriers/requirements-audit/")

        offender.refresh_from_db()
        settings = DriverDeliverySettings.objects.get(driver=offender.user)
        self.assertEqual(offender.status, "approved")
        self.assertFalse(settings.is_suspended)
        self.assertTrue(settings.delivery_mode_enabled)

    def test_audit_is_admin_only(self):
        self.client.force_authenticate(user=self.plain)
        self.assertEqual(
            self.client.get("/deliveries/admin/couriers/requirements-audit/").status_code, 403
        )

    def test_courier_endpoints_are_admin_only(self):
        profile = _courier("perm-check@yala.test", vehicle_type="bicycle")
        self.client.force_authenticate(user=self.plain)
        for url in (
            f"/deliveries/admin/couriers/{profile.id}/profile/",
            f"/deliveries/admin/couriers/{profile.id}/requirements/",
        ):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_courier_endpoints_are_read_only(self):
        profile = _courier("ro-check@yala.test", vehicle_type="bicycle")
        self.client.force_authenticate(user=self.admin)
        for url in (
            f"/deliveries/admin/couriers/{profile.id}/profile/",
            f"/deliveries/admin/couriers/{profile.id}/requirements/",
            "/deliveries/admin/couriers/requirements-audit/",
        ):
            self.assertEqual(self.client.post(url, {}, format="json").status_code, 405, url)

