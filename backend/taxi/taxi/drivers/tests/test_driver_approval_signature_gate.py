"""Regression tests: no route may move a driver/courier to "approved" without a
complete electronic signature.

Covers every route that can write DriverProfile.status = "approved":
  - POST /drivers/approve/<id>/
  - POST /drivers/reintegrate/<id>/
  - POST /admin/approvals/drivers/<user_id>/approve|reactivate/
  - POST /admin/approvals/drivers/bulk/
  - POST /admin/approvals/couriers/<user_id>/approve|reactivate/ and /bulk/
  - POST /operations/ceo-master/actions/approve-onboarding/

Drivers and couriers sign DIFFERENT agreements (driver_* vs courier fields), so
each gate is asserted independently. Runs only against the throwaway test DB;
uploaded signature images go to a temporary MEDIA_ROOT that is removed after.
"""

import itertools
import shutil
import tempfile

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverDocument, DriverProfile

_TMP_MEDIA = tempfile.mkdtemp(prefix="yala-approval-tests-")
_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
_counter = itertools.count(1)


def _png(name):
    return SimpleUploadedFile(name, _PNG, content_type="image/png")


class ApprovalGateBase(APITestCase):
    """Shared helpers. Unique emails/phones/national IDs per call (no collisions)."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_TMP_MEDIA, ignore_errors=True)

    def _make_user(self, kind="rider", **extra):
        n = next(_counter)
        return User.objects.create_user(
            email=f"sig-gate-{kind}{n}@example.com",
            password="x-Strong-Pass-1",
            first_name="Sig",
            last_name=f"{kind.title()}{n}",
            phone_number=f"+22277{n:06d}",
            national_id_number=f"88{n:08d}",
            **extra,
        )

    def _staff(self, superuser=True, group="CEO"):
        user = self._make_user("admin")
        user.is_staff = True
        user.is_superuser = superuser
        user.save(update_fields=["is_staff", "is_superuser"])
        if group:
            Group.objects.get_or_create(name=group)[0].user_set.add(user)
        return user

    def _profile(self, status="pending", driver_signed=False, courier_signed=False):
        n = next(_counter)
        user = self._make_user("driver", user_type="driver")
        profile = DriverProfile.objects.create(
            user=user,
            status=status,
            phone_number=user.phone_number,
            vehicle_plate=f"SG-{n:04d}",
            plate_number=f"SG-{n:04d}",
            driver_code=f"S{n:05d}",
            qr_code_uuid=f"00000000-0000-4000-9000-{n:012d}",
        )
        if driver_signed:
            profile.driver_terms_accepted = True
            profile.driver_signed_full_name = "Signed Driver"
            profile.driver_legal_declaration_accepted = True
            profile.driver_signature_image = _png("driver-sig.png")
        if courier_signed:
            profile.terms_accepted = True
            profile.signed_full_name = "Signed Courier"
            profile.legal_declaration_accepted = True
            profile.signature_image = _png("courier-sig.png")
        if driver_signed or courier_signed:
            profile.save()
        profile.refresh_from_db()
        return profile

    def _status(self, profile):
        profile.refresh_from_db()
        return profile.status

    def _complete_courier_documents(self, profile):
        """Satisfy the Phase 12 courier document gate.

        A courier cannot reach "approved" until the documents required for their
        vehicle type are uploaded, and the vehicle type must be chosen. This gate is
        intentional (document approval is a hard requirement), so the fixture supplies
        the documents rather than the gate being relaxed. The default vehicle type is
        a motorcycle, whose required set is national_id/license/carte_grise/insurance.
        """
        from deliveries.models import DriverDeliverySettings

        settings_obj, _ = DriverDeliverySettings.objects.get_or_create(driver=profile.user)
        settings_obj.delivery_vehicle_type = "motorcycle"
        settings_obj.save(update_fields=["delivery_vehicle_type"])

        for document_type in ("national_id", "license", "carte_grise", "insurance"):
            DriverDocument.objects.create(
                driver=profile,
                document_type=document_type,
                file=_png(f"{document_type}.png"),
                status="pending",
            )
        profile.refresh_from_db()
        return profile

    def _ceo_approve(self, entity_type, profile):
        return self.client.post(
            "/operations/ceo-master/actions/approve-onboarding/",
            {"entity_type": entity_type, "entity_id": profile.user_id},
            format="json",
        )

    def setUp(self):
        self.admin = self._staff()
        self.client.force_authenticate(self.admin)


@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class DriverApprovalRouteTests(ApprovalGateBase):
    # ---- POST /drivers/approve/<id>/ -----------------------------------
    def test_standard_approve_unsigned_is_rejected(self):
        p = self._profile()
        res = self.client.post(f"/drivers/approve/{p.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "driver_signature_required")
        self.assertEqual(self._status(p), "pending")

    def test_standard_approve_signed_succeeds(self):
        p = self._profile(driver_signed=True)
        res = self.client.post(f"/drivers/approve/{p.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "approved")

    def test_courier_only_signature_does_not_satisfy_driver_gate(self):
        p = self._profile(courier_signed=True)
        res = self.client.post(f"/drivers/approve/{p.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._status(p), "pending")

    # ---- admin approval center: single ---------------------------------
    def test_center_approve_unsigned_is_rejected(self):
        p = self._profile()
        res = self.client.post(f"/admin/approvals/drivers/{p.user_id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "driver_signature_required")
        self.assertEqual(self._status(p), "pending")

    def test_center_approve_signed_succeeds(self):
        p = self._profile(driver_signed=True)
        res = self.client.post(f"/admin/approvals/drivers/{p.user_id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "approved")

    # ---- admin approval center: reactivate -----------------------------
    def test_center_reactivate_rejected_unsigned_is_rejected(self):
        p = self._profile(status="rejected")
        res = self.client.post(f"/admin/approvals/drivers/{p.user_id}/reactivate/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._status(p), "rejected")

    def test_center_reactivate_rejected_with_existing_signature_needs_no_resign(self):
        p = self._profile(status="rejected", driver_signed=True)
        res = self.client.post(f"/admin/approvals/drivers/{p.user_id}/reactivate/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "approved")

    def test_center_reactivate_non_rejected_unsigned_driver_keeps_status(self):
        # Un-suspending does not change status, so it is not an approval.
        p = self._profile(status="pending")
        res = self.client.post(f"/admin/approvals/drivers/{p.user_id}/reactivate/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "pending")

    # ---- admin approval center: bulk -----------------------------------
    def test_bulk_approve_only_approves_signed_drivers(self):
        signed = self._profile(driver_signed=True)
        unsigned = self._profile()
        res = self.client.post(
            "/admin/approvals/drivers/bulk/",
            {"ids": [signed.user_id, unsigned.user_id], "action": "approve"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["success_count"], 1)
        self.assertEqual(res.data["unsigned_count"], 1)
        self.assertEqual(self._status(signed), "approved")
        self.assertEqual(self._status(unsigned), "pending")

    def test_bulk_approve_all_unsigned_returns_400(self):
        a, b = self._profile(), self._profile()
        res = self.client.post(
            "/admin/approvals/drivers/bulk/",
            {"ids": [a.user_id, b.user_id], "action": "approve"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["unsigned_count"], 2)
        self.assertEqual(self._status(a), "pending")
        self.assertEqual(self._status(b), "pending")

    def test_bulk_reject_does_not_require_signature(self):
        p = self._profile()
        res = self.client.post(
            "/admin/approvals/drivers/bulk/",
            {"ids": [p.user_id], "action": "reject", "reason": "Incomplete file"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "rejected")

    # ---- CEO onboarding approval ---------------------------------------
    def test_ceo_onboarding_driver_unsigned_is_rejected(self):
        p = self._profile()
        res = self._ceo_approve("driver", p)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "driver_signature_required")
        self.assertEqual(self._status(p), "pending")

    def test_ceo_onboarding_driver_signed_succeeds(self):
        p = self._profile(driver_signed=True)
        self.assertEqual(self._ceo_approve("driver", p).status_code, 200)
        self.assertEqual(self._status(p), "approved")



@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class DriverReintegrationTests(ApprovalGateBase):
    def test_reintegrate_unsigned_is_rejected(self):
        p = self._profile(status="rejected")
        res = self.client.post(f"/drivers/reintegrate/{p.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "driver_signature_required")
        self.assertEqual(self._status(p), "rejected")

    def test_reintegrate_cannot_bypass_gate_with_explicit_approved_status(self):
        p = self._profile(status="rejected")
        res = self.client.post(f"/drivers/reintegrate/{p.id}/", {"status": "approved"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._status(p), "rejected")

    def test_reintegrate_signed_succeeds_without_resigning(self):
        p = self._profile(status="rejected", driver_signed=True)
        res = self.client.post(f"/drivers/reintegrate/{p.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "approved")

    def test_reintegrate_to_non_approved_status_is_not_gated(self):
        p = self._profile(status="rejected")
        res = self.client.post(f"/drivers/reintegrate/{p.id}/", {"status": "pending"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "pending")


@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class CourierApprovalRouteTests(ApprovalGateBase):
    """Couriers sign a separate agreement; never assume it equals the driver one."""

    def test_courier_center_approve_unsigned_is_rejected(self):
        p = self._profile()
        res = self.client.post(f"/admin/approvals/couriers/{p.user_id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "courier_signature_required")
        self.assertEqual(self._status(p), "pending")

    def test_courier_center_approve_needs_courier_signature_not_driver_signature(self):
        p = self._profile(driver_signed=True)
        res = self.client.post(f"/admin/approvals/couriers/{p.user_id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._status(p), "pending")

    def test_courier_center_approve_with_courier_signature_succeeds(self):
        p = self._profile(courier_signed=True)
        # The signature gate is the subject of this test, so the courier must also satisfy
        # the separate Phase 12 document/vehicle-type gate to reach approval.
        self._complete_courier_documents(p)
        res = self.client.post(f"/admin/approvals/couriers/{p.user_id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(p), "approved")

    def test_courier_center_reactivate_rejected_unsigned_is_rejected(self):
        p = self._profile(status="rejected")
        res = self.client.post(f"/admin/approvals/couriers/{p.user_id}/reactivate/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._status(p), "rejected")

    def test_courier_bulk_approve_only_approves_courier_signed(self):
        ok = self._profile(courier_signed=True)
        driver_only = self._profile(driver_signed=True)
        res = self.client.post(
            "/admin/approvals/couriers/bulk/",
            {"ids": [ok.user_id, driver_only.user_id], "action": "approve"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._status(ok), "approved")
        self.assertEqual(self._status(driver_only), "pending")

    def test_ceo_onboarding_courier_uses_courier_agreement(self):
        driver_only = self._profile(driver_signed=True)
        res = self._ceo_approve("courier", driver_only)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "courier_signature_required")
        self.assertEqual(self._status(driver_only), "pending")

        courier = self._profile(courier_signed=True)
        self.assertEqual(self._ceo_approve("courier", courier).status_code, 200)
        self.assertEqual(self._status(courier), "approved")


@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class ApprovalAuthorizationTests(ApprovalGateBase):
    """The signature gate must not weaken existing role-based authorization."""

    def test_non_staff_cannot_use_approval_routes(self):
        p = self._profile(driver_signed=True)
        self.client.force_authenticate(self._make_user("plain"))
        self.assertEqual(self.client.post(f"/drivers/approve/{p.id}/").status_code, 403)
        self.assertEqual(
            self.client.post(f"/admin/approvals/drivers/{p.user_id}/approve/", {}, format="json").status_code,
            403,
        )
        self.assertEqual(self._ceo_approve("driver", p).status_code, 403)
        self.assertEqual(self._status(p), "pending")

    def test_non_ceo_staff_cannot_use_ceo_onboarding_route(self):
        p = self._profile(driver_signed=True)
        self.client.force_authenticate(self._staff(superuser=False, group="Support"))
        self.assertEqual(self._ceo_approve("driver", p).status_code, 403)
        self.assertEqual(self._status(p), "pending")



@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class ReintegrationStatusValidationTests(ApprovalGateBase):
    """reintegrate_driver must accept only DriverProfile.STATUS_CHOICES values."""

    def _reintegrate(self, profile, payload):
        return self.client.post(f"/drivers/reintegrate/{profile.id}/", payload, format="json")

    def test_invalid_status_strings_return_400_and_change_nothing(self):
        for bad in ("Approved", "APPROVED", "suspended", "banana", "", " approved"):
            with self.subTest(status=bad):
                p = self._profile(status="rejected", driver_signed=True)
                res = self._reintegrate(p, {"status": bad})
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.data["code"], "invalid_status")
                self.assertEqual(self._status(p), "rejected")

    def test_non_string_status_values_return_400(self):
        for bad in (None, 5, ["approved"], {"a": 1}, True):
            with self.subTest(status=bad):
                p = self._profile(status="rejected", driver_signed=True)
                res = self._reintegrate(p, {"status": bad})
                self.assertEqual(res.status_code, 400)
                self.assertEqual(self._status(p), "rejected")

    def test_invalid_status_does_not_reactivate_the_user_account(self):
        p = self._profile(status="rejected", driver_signed=True)
        p.user.is_active = False
        p.user.save(update_fields=["is_active"])
        self.assertEqual(self._reintegrate(p, {"status": "banana"}).status_code, 400)
        p.user.refresh_from_db()
        self.assertFalse(p.user.is_active)

    def test_every_valid_status_choice_is_accepted(self):
        for value in ("pending", "pending_review", "rejected"):
            with self.subTest(status=value):
                p = self._profile(status="rejected")
                res = self._reintegrate(p, {"status": value})
                self.assertEqual(res.status_code, 200)
                self.assertEqual(self._status(p), value)

    def test_approved_status_still_requires_signature(self):
        unsigned = self._profile(status="rejected")
        res = self._reintegrate(unsigned, {"status": "approved"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "driver_signature_required")
        self.assertEqual(self._status(unsigned), "rejected")

        signed = self._profile(status="rejected", driver_signed=True)
        self.assertEqual(self._reintegrate(signed, {"status": "approved"}).status_code, 200)
        self.assertEqual(self._status(signed), "approved")

    def test_non_staff_cannot_reintegrate(self):
        p = self._profile(status="rejected", driver_signed=True)
        self.client.force_authenticate(self._make_user("plain"))
        self.assertEqual(self._reintegrate(p, {"status": "approved"}).status_code, 403)
        self.assertEqual(self._status(p), "rejected")

    def test_anonymous_cannot_reintegrate(self):
        p = self._profile(status="rejected", driver_signed=True)
        self.client.force_authenticate(None)
        self.assertIn(self._reintegrate(p, {"status": "approved"}).status_code, (401, 403))
        self.assertEqual(self._status(p), "rejected")



@override_settings(MEDIA_ROOT=_TMP_MEDIA)
class DjangoAdminApprovalGateTests(ApprovalGateBase):
    """The Django admin site must not be a way around the e-signature rule."""

    _FILE_FIELDS = (
        "driver_photo", "vehicle_photo", "license_file", "vehicle_registration",
        "insurance_document", "vignette_document", "signature_image",
        "driver_signature_image", "qr_code_image",
    )

    def _form(self, profile, status):
        from django.forms.models import model_to_dict

        from taxi.drivers.admin import DriverProfileAdminForm

        data = {
            k: ("" if v is None else v)
            for k, v in model_to_dict(profile, exclude=self._FILE_FIELDS).items()
        }
        data["status"] = status
        return DriverProfileAdminForm(data=data, instance=profile)

    def _admin_post(self, profile, status):
        from django.forms.models import model_to_dict
        from django.urls import reverse

        data = {
            k: ("" if v is None else v)
            for k, v in model_to_dict(profile, exclude=self._FILE_FIELDS).items()
        }
        data["status"] = status
        url = reverse("admin:drivers_driverprofile_change", args=[profile.pk])
        return self.client.post(url, data)

    # ---- form level -----------------------------------------------------
    def test_form_rejects_approval_of_unsigned_driver_with_clear_message(self):
        p = self._profile(status="pending")
        form = self._form(p, "approved")
        form.is_valid()
        self.assertIn("status", form.errors)
        self.assertIn("electronic signature is incomplete", form.errors["status"][0])

    def test_form_allows_approval_of_signed_driver(self):
        p = self._profile(status="pending", driver_signed=True)
        form = self._form(p, "approved")
        form.is_valid()
        self.assertNotIn("status", form.errors)

    def test_form_courier_signature_does_not_satisfy_driver_gate(self):
        p = self._profile(status="pending", courier_signed=True)
        form = self._form(p, "approved")
        form.is_valid()
        self.assertIn("status", form.errors)

    def test_form_keeps_pending_and_rejected_available_for_unsigned_driver(self):
        for target in ("pending", "pending_review", "rejected"):
            with self.subTest(status=target):
                p = self._profile(status="approved")
                form = self._form(p, target)
                form.is_valid()
                self.assertNotIn("status", form.errors)

    def test_form_does_not_block_editing_an_already_approved_unsigned_driver(self):
        # Existing approved records must stay editable; nothing is re-approved.
        p = self._profile(status="approved")
        form = self._form(p, "approved")
        form.is_valid()
        self.assertNotIn("status", form.errors)

    # ---- admin change view (real request) -------------------------------
    def test_admin_change_view_cannot_approve_unsigned_driver(self):
        p = self._profile(status="pending")
        self.client.force_login(self.admin)
        res = self._admin_post(p, "approved")
        self.assertEqual(res.status_code, 200)  # form re-rendered with an error
        self.assertContains(res, "electronic signature is incomplete")
        self.assertEqual(self._status(p), "pending")

    def test_admin_change_view_can_still_reject_unsigned_driver(self):
        p = self._profile(status="pending")
        self.client.force_login(self.admin)
        res = self._admin_post(p, "rejected")
        if res.status_code == 200:
            # Another unrelated required field blocked the save; the signature
            # gate itself must not be the reason.
            self.assertNotContains(res, "electronic signature is incomplete")
        else:
            self.assertEqual(res.status_code, 302)
            self.assertEqual(self._status(p), "rejected")

    def test_non_staff_cannot_use_admin_change_view_to_approve(self):
        p = self._profile(status="pending", driver_signed=True)
        self.client.force_login(self._make_user("plain"))
        res = self._admin_post(p, "approved")
        self.assertIn(res.status_code, (302, 403))
        self.assertEqual(self._status(p), "pending")

    def test_staff_without_driver_change_permission_cannot_approve(self):
        p = self._profile(status="pending", driver_signed=True)
        staff = self._staff(superuser=False, group=None)
        self.client.force_login(staff)
        res = self._admin_post(p, "approved")
        self.assertIn(res.status_code, (302, 403))
        self.assertEqual(self._status(p), "pending")

