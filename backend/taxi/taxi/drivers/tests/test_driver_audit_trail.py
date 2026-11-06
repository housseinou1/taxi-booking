"""Regression tests: driver lifecycle audit trail.

Verifies that driver approve / reject / reintegrate and blocked approval attempts
are recorded in security.AuditLog with entity_type="driver" (so they appear in
the unified admin audit feed and in the driver drawer), and that no sensitive
document or signature data is stored.

Runs only on the throwaway test DB.
"""

import itertools

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from authapp.models import User
from security.models import AuditLog
from taxi.drivers.models import DriverProfile

_counter = itertools.count(1)


class DriverAuditTrailTests(APITestCase):
    def _user(self, kind="driver", **extra):
        n = next(_counter)
        return User.objects.create_user(
            email=f"driver-audit-{kind}{n}@example.com",
            password="x-Strong-Pass-1",
            first_name="Audit",
            last_name=f"{kind.title()}{n}",
            phone_number=f"+22244{n:06d}",
            national_id_number=f"55{n:08d}",
            **extra,
        )

    def _admin(self):
        user = self._user("admin")
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])
        Group.objects.get_or_create(name="CEO")[0].user_set.add(user)
        return user

    def _profile(self, status="pending", signed=False):
        n = next(_counter)
        user = self._user("driver", user_type="driver")
        profile = DriverProfile.objects.create(
            user=user,
            status=status,
            phone_number=user.phone_number,
            vehicle_plate=f"AU-{n:04d}",
            plate_number=f"AU-{n:04d}",
            driver_code=f"A{n:05d}",
            qr_code_uuid=f"00000000-0000-4000-8000-{n:012d}",
        )
        if signed:
            profile.driver_terms_accepted = True
            profile.driver_signed_full_name = "Audit Driver"
            profile.driver_legal_declaration_accepted = True
            profile.driver_signature_image = "legal/driver_signatures/audit-fixture.png"
            profile.save()
        profile.refresh_from_db()
        return profile

    def _rows(self, profile, action=None):
        queryset = AuditLog.objects.filter(entity_type="driver", entity_id=str(profile.pk))
        if action:
            queryset = queryset.filter(action=action)
        return queryset

    def setUp(self):
        self.admin = self._admin()
        self.client.force_authenticate(self.admin)

    # ---- entity type exists ---------------------------------------------
    def test_driver_is_a_valid_audit_entity_type(self):
        values = [value for value, _label in AuditLog.ENTITY_CHOICES]
        self.assertIn("driver", values)

    def test_driver_lifecycle_actions_are_valid_choices(self):
        values = [value for value, _label in AuditLog.ACTION_CHOICES]
        for action in ("approve", "reject", "suspend", "reactivate",
                       "reintegrate", "approval_blocked"):
            self.assertIn(action, values)

    # ---- approve ---------------------------------------------------------
    def test_approve_writes_audit_row_with_status_transition(self):
        p = self._profile(signed=True)
        res = self.client.post(f"/drivers/approve/{p.id}/")
        self.assertEqual(res.status_code, 200)

        row = self._rows(p, "approve").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.actor, self.admin)
        self.assertEqual(row.details.get("previous_status"), "pending")
        self.assertEqual(row.details.get("new_status"), "approved")

    def test_blocked_approval_is_recorded(self):
        p = self._profile(signed=False)
        res = self.client.post(f"/drivers/approve/{p.id}/")
        self.assertEqual(res.status_code, 400)

        row = self._rows(p, "approval_blocked").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("reason"), "driver_signature_required")
        self.assertEqual(self._rows(p, "approve").count(), 0)

    def test_blocked_approval_does_not_change_status(self):
        p = self._profile(signed=False)
        self.client.post(f"/drivers/approve/{p.id}/")
        p.refresh_from_db()
        self.assertEqual(p.status, "pending")

    # ---- reject ----------------------------------------------------------
    def test_reject_writes_audit_row_with_reason(self):
        p = self._profile()
        res = self.client.post(
            f"/drivers/reject/{p.id}/", {"reason": "Documents unreadable"}, format="json"
        )
        self.assertEqual(res.status_code, 200)

        row = self._rows(p, "reject").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("reason"), "Documents unreadable")
        self.assertEqual(row.details.get("new_status"), "rejected")

    def test_reject_without_reason_writes_no_audit_row(self):
        p = self._profile()
        res = self.client.post(f"/drivers/reject/{p.id}/", {"reason": "no"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._rows(p).count(), 0)

    # ---- reintegrate -----------------------------------------------------
    def test_reintegrate_writes_audit_row(self):
        p = self._profile(status="rejected", signed=True)
        res = self.client.post(f"/drivers/reintegrate/{p.id}/")
        self.assertEqual(res.status_code, 200)

        row = self._rows(p, "reintegrate").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("previous_status"), "rejected")
        self.assertEqual(row.details.get("new_status"), "approved")

    def test_blocked_reintegration_is_recorded(self):
        p = self._profile(status="rejected", signed=False)
        res = self.client.post(
            f"/drivers/reintegrate/{p.id}/", {"status": "approved"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIsNotNone(self._rows(p, "approval_blocked").first())

    def test_invalid_status_writes_no_audit_row(self):
        p = self._profile(status="rejected", signed=True)
        res = self.client.post(
            f"/drivers/reintegrate/{p.id}/", {"status": "banana"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._rows(p).count(), 0)


    # ---- approval center -------------------------------------------------
    def test_approval_center_approve_writes_audit_row(self):
        p = self._profile(signed=True)
        res = self.client.post(
            f"/admin/approvals/drivers/{p.user_id}/approve/", {}, format="json"
        )
        self.assertEqual(res.status_code, 200)

        row = self._rows(p, "approve").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.details.get("source"), "approval_center")

    def test_approval_center_reject_writes_audit_row(self):
        p = self._profile()
        res = self.client.post(
            f"/admin/approvals/drivers/{p.user_id}/reject/",
            {"reason": "Incomplete documents"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(self._rows(p, "reject").first())

    def test_approval_center_suspend_writes_audit_row(self):
        p = self._profile(status="approved", signed=True)
        res = self.client.post(
            f"/admin/approvals/drivers/{p.user_id}/suspend/",
            {"reason": "Safety review"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(self._rows(p, "suspend").first())

    # ---- privacy ---------------------------------------------------------
    def test_audit_rows_never_store_documents_or_signatures(self):
        p = self._profile(signed=True)
        self.client.post(f"/drivers/approve/{p.id}/")
        row = self._rows(p, "approve").first()
        blob = str(row.details).lower()
        for forbidden in ("signature_image", "driver_signature_image", "license_file",
                          "national_id", "insurance_document", "photo"):
            self.assertNotIn(forbidden, blob)

    def test_audit_row_can_be_filtered_for_a_single_driver(self):
        first = self._profile(signed=True)
        second = self._profile(signed=True)
        self.client.post(f"/drivers/approve/{first.id}/")
        self.client.post(f"/drivers/approve/{second.id}/")

        res = self.client.get(
            "/security/admin/audit-logs/",
            {"entity_type": "driver", "entity_id": str(first.pk)},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["entity_id"], str(first.pk))

