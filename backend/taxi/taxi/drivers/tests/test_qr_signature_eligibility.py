"""Regression tests: verification QR codes require approved status AND a complete
driver e-signature (generation, regeneration via API + Django admin, scanning).

Existing QR codes are never deleted or modified by these rules. An approved but
unsigned driver who already holds a QR code simply stops being reported as
"verified" and is shown to riders as an ineligible code with no driver details.

Runs only on the throwaway test DB. QR images and signature images go to a
temporary MEDIA_ROOT that is removed afterwards. Celery runs eagerly in-process.
"""

import itertools
import shutil
import tempfile
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile, QRCodeAuditLog, VerificationRecord
from taxi.drivers.services.qr_service import QRCodeService, QRIneligibleDriverError

_TMP_MEDIA = tempfile.mkdtemp(prefix="yala-qr-tests-")
_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
_counter = itertools.count(1)
_INELIGIBLE_FIELDS = ("driver_name", "driver_code", "driver_photo", "vehicle_make",
                      "vehicle_model", "vehicle_color", "plate_number")


class QRBase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_TMP_MEDIA, ignore_errors=True)

    def _user(self, kind="rider", **extra):
        n = next(_counter)
        return User.objects.create_user(
            email=f"qr-sig-{kind}{n}@example.com", password="x-Strong-Pass-1",
            first_name="Qr", last_name=f"{kind.title()}{n}",
            phone_number=f"+22266{n:06d}", national_id_number=f"77{n:08d}", **extra,
        )

    def _staff(self):
        user = self._user("admin")
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])
        Group.objects.get_or_create(name="CEO")[0].user_set.add(user)
        return user

    def _profile(self, status="approved", signed=True):
        """Create a profile directly. The post_save signal runs, so eligible
        approved drivers get a QR automatically (Celery is eager in tests)."""
        n = next(_counter)
        user = self._user("driver", user_type="driver")
        profile = DriverProfile(
            user=user, status="pending", phone_number=user.phone_number,
            vehicle_plate=f"QR-{n:04d}", plate_number=f"QR-{n:04d}",
            driver_code=f"{n:06d}"[-6:], vehicle_make="Toyota", vehicle_model="Corolla",
            vehicle_color="White",
        )
        if signed:
            profile.driver_terms_accepted = True
            profile.driver_signed_full_name = "Signed Driver"
            profile.driver_legal_declaration_accepted = True
            profile.driver_signature_image = SimpleUploadedFile(
                "sig.png", _PNG, content_type="image/png")
        profile.save()
        if status != "pending":
            profile.status = status
            profile.save()
        profile.refresh_from_db()
        return profile

    def _force_qr(self, profile):
        """Give a profile a QR the way legacy data has one: bypassing eligibility."""
        service = QRCodeService()
        with mock.patch.object(QRCodeService, "ensure_eligible", lambda *a, **k: None):
            uuid_, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()
        return uuid_

    def _token(self, profile):
        return QRCodeService().create_signed_token(profile.qr_code_uuid, profile.driver_code or "")

    def _scan(self, profile, rider=None):
        self.client.force_authenticate(rider or self._user("rider"))
        return self.client.post("/api/v1/verify-driver/", {"token": self._token(profile)}, format="json")

    def _regen(self, profile, user=None):
        self.client.force_authenticate(user or self._staff())
        return self.client.post(f"/api/v1/admin/drivers/{profile.pk}/regenerate-qr/")


@override_settings(MEDIA_ROOT=_TMP_MEDIA, CELERY_TASK_ALWAYS_EAGER=True,
                   CELERY_TASK_EAGER_PROPAGATES=True)
class QRGenerationEligibilityTests(QRBase):
    def test_approved_and_signed_driver_receives_qr(self):
        p = self._profile(status="approved", signed=True)
        self.assertTrue(p.qr_code_uuid)
        self.assertTrue(p.qr_code_image)

    def test_approved_but_unsigned_driver_gets_no_qr(self):
        p = self._profile(status="approved", signed=False)
        self.assertFalse(p.qr_code_uuid)
        self.assertFalse(p.qr_code_image)
        self.assertEqual(p.status, "approved")  # status is NOT reverted or changed

    def test_pending_and_rejected_signed_drivers_get_no_qr(self):
        for status in ("pending", "pending_review", "rejected"):
            with self.subTest(status=status):
                p = self._profile(status=status, signed=True)
                self.assertFalse(p.qr_code_uuid)

    def test_service_refuses_unsigned_and_stores_nothing(self):
        p = self._profile(status="approved", signed=False)
        with self.assertRaises(QRIneligibleDriverError) as ctx:
            QRCodeService().generate_qr_code(p)
        self.assertEqual(ctx.exception.code, "driver_signature_required")
        p.refresh_from_db()
        self.assertFalse(p.qr_code_uuid)

    def test_service_refuses_non_approved_with_distinct_reason(self):
        p = self._profile(status="rejected", signed=True)
        with self.assertRaises(QRIneligibleDriverError) as ctx:
            QRCodeService().generate_qr_code(p)
        self.assertEqual(ctx.exception.code, "driver_not_approved")

    def test_courier_only_signature_does_not_make_driver_eligible(self):
        p = self._profile(status="pending", signed=False)
        p.terms_accepted = True
        p.signed_full_name = "Courier Only"
        p.legal_declaration_accepted = True
        p.signature_image = SimpleUploadedFile("c.png", _PNG, content_type="image/png")
        p.status = "approved"
        p.save()
        p.refresh_from_db()
        self.assertFalse(p.qr_code_uuid)

    def test_driver_gets_qr_once_signed_after_approval(self):
        p = self._profile(status="approved", signed=False)
        self.assertFalse(p.qr_code_uuid)
        p.driver_terms_accepted = True
        p.driver_signed_full_name = "Now Signed"
        p.driver_legal_declaration_accepted = True
        p.driver_signature_image = SimpleUploadedFile("s.png", _PNG, content_type="image/png")
        p.save()  # a full save re-runs the approval signal
        p.refresh_from_db()
        self.assertTrue(p.qr_code_uuid)

    def test_existing_qr_is_preserved_when_driver_is_unsigned_approved(self):
        p = self._profile(status="approved", signed=False)
        legacy = self._force_qr(p)
        p.save()  # re-approval signal must not touch or delete the existing QR
        p.refresh_from_db()
        self.assertEqual(p.qr_code_uuid, legacy)



@override_settings(MEDIA_ROOT=_TMP_MEDIA, CELERY_TASK_ALWAYS_EAGER=True,
                   CELERY_TASK_EAGER_PROPAGATES=True)
class QRRegenerationEligibilityTests(QRBase):
    # ---- API ------------------------------------------------------------
    def test_api_regenerates_for_approved_signed_driver(self):
        p = self._profile(status="approved", signed=True)
        old = p.qr_code_uuid
        res = self._regen(p)
        self.assertEqual(res.status_code, 200)
        p.refresh_from_db()
        self.assertNotEqual(p.qr_code_uuid, old)
        self.assertEqual(QRCodeAuditLog.objects.filter(driver=p).count(), 1)

    def test_api_refuses_approved_unsigned_driver_and_keeps_existing_qr(self):
        p = self._profile(status="approved", signed=False)
        legacy = self._force_qr(p)
        res = self._regen(p)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "driver_signature_required")
        self.assertIn("signature", res.data["error"].lower())
        p.refresh_from_db()
        self.assertEqual(p.qr_code_uuid, legacy)
        self.assertEqual(QRCodeAuditLog.objects.filter(driver=p).count(), 0)

    def test_api_refuses_rejected_and_pending_drivers(self):
        for status in ("rejected", "pending"):
            with self.subTest(status=status):
                p = self._profile(status="approved", signed=True)
                legacy = p.qr_code_uuid
                DriverProfile.objects.filter(pk=p.pk).update(status=status)
                res = self._regen(p)
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.data["error_code"], "driver_not_approved")
                p.refresh_from_db()
                self.assertEqual(p.qr_code_uuid, legacy)

    def test_api_still_returns_400_when_driver_has_no_qr(self):
        p = self._profile(status="approved", signed=False)
        res = self._regen(p)
        self.assertEqual(res.status_code, 400)

    def test_api_requires_admin(self):
        p = self._profile(status="approved", signed=True)
        res = self._regen(p, user=self._user("plain"))
        self.assertEqual(res.status_code, 403)
        self.client.force_authenticate(None)
        res = self.client.post(f"/api/v1/admin/drivers/{p.pk}/regenerate-qr/")
        self.assertIn(res.status_code, (401, 403))


    # ---- Django admin action --------------------------------------------
    def _admin_action(self, profiles, user=None):
        from django.urls import reverse

        self.client.force_login(user or self._staff())
        return self.client.post(
            reverse("admin:drivers_driverprofile_changelist"),
            {"action": "regenerate_qr_code", "_selected_action": [p.pk for p in profiles]},
            follow=True,
        )

    def test_admin_action_regenerates_only_eligible_drivers(self):
        ok = self._profile(status="approved", signed=True)
        ok_old = ok.qr_code_uuid
        unsigned = self._profile(status="approved", signed=False)
        legacy = self._force_qr(unsigned)
        res = self._admin_action([ok, unsigned])
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "requires an approved driver with a complete electronic")
        ok.refresh_from_db()
        unsigned.refresh_from_db()
        self.assertNotEqual(ok.qr_code_uuid, ok_old)
        self.assertEqual(unsigned.qr_code_uuid, legacy)

    def test_admin_action_does_not_regenerate_rejected_driver(self):
        p = self._profile(status="approved", signed=True)
        legacy = p.qr_code_uuid
        DriverProfile.objects.filter(pk=p.pk).update(status="rejected")
        self._admin_action([p])
        p.refresh_from_db()
        self.assertEqual(p.qr_code_uuid, legacy)

    def test_admin_action_unavailable_to_non_staff(self):
        p = self._profile(status="approved", signed=True)
        old = p.qr_code_uuid
        self._admin_action([p], user=self._user("plain"))
        p.refresh_from_db()
        self.assertEqual(p.qr_code_uuid, old)



@override_settings(MEDIA_ROOT=_TMP_MEDIA, CELERY_TASK_ALWAYS_EAGER=True,
                   CELERY_TASK_EAGER_PROPAGATES=True)
class QRScanEligibilityTests(QRBase):
    def _assert_no_driver_details(self, data):
        for field in _INELIGIBLE_FIELDS:
            self.assertIsNone(data[field], f"{field} must not be disclosed")

    def test_approved_signed_driver_is_verified_with_full_info(self):
        p = self._profile(status="approved", signed=True)
        res = self._scan(p)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "verified")
        self.assertEqual(res.data["vehicle_make"], "Toyota")
        self.assertEqual(res.data["plate_number"], p.plate_number)
        self.assertEqual(VerificationRecord.objects.get(driver=p).scan_result, "verified")

    def test_approved_unsigned_driver_is_not_verified_and_leaks_nothing(self):
        p = self._profile(status="approved", signed=False)
        self._force_qr(p)
        res = self._scan(p)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "inactive_driver")
        self._assert_no_driver_details(res.data)
        self.assertEqual(VerificationRecord.objects.get(driver=p).scan_result, "inactive_driver")

    def test_rejected_and_pending_drivers_are_not_verified_and_leak_nothing(self):
        for status in ("rejected", "pending"):
            with self.subTest(status=status):
                p = self._profile(status="approved", signed=True)
                DriverProfile.objects.filter(pk=p.pk).update(status=status)
                res = self._scan(p)
                self.assertEqual(res.data["status"], "inactive_driver")
                self._assert_no_driver_details(res.data)

    def test_ineligible_response_contains_no_personal_text_anywhere(self):
        p = self._profile(status="approved", signed=False)
        self._force_qr(p)
        body = str(self._scan(p).data)
        for secret in (p.user.email, p.user.last_name, p.phone_number or "~", p.plate_number or "~"):
            self.assertNotIn(secret, body)

    def test_signing_later_makes_the_existing_qr_verify(self):
        p = self._profile(status="approved", signed=False)
        self._force_qr(p)
        self.assertEqual(self._scan(p).data["status"], "inactive_driver")
        p.driver_terms_accepted = True
        p.driver_signed_full_name = "Now Signed"
        p.driver_legal_declaration_accepted = True
        p.driver_signature_image = SimpleUploadedFile("s.png", _PNG, content_type="image/png")
        p.save()
        p.refresh_from_db()
        self.assertEqual(self._scan(p).data["status"], "verified")

    def test_existing_qr_codes_are_never_deleted_by_scanning(self):
        p = self._profile(status="approved", signed=False)
        legacy = self._force_qr(p)
        self._scan(p)
        p.refresh_from_db()
        self.assertEqual(p.qr_code_uuid, legacy)
        self.assertEqual(p.status, "approved")

    def test_invalid_and_forged_tokens_are_unchanged_and_reveal_nothing(self):
        rider = self._user("rider")
        self.client.force_authenticate(rider)
        for token, expected in (("not-a-token", "invalid_code"), ("a.b", "invalid_code")):
            with self.subTest(token=token):
                res = self.client.post("/api/v1/verify-driver/", {"token": token}, format="json")
                self.assertEqual(res.data["status"], expected)
                self._assert_no_driver_details(res.data)

    def test_scan_requires_authentication(self):
        p = self._profile(status="approved", signed=True)
        self.client.force_authenticate(None)
        res = self.client.post("/api/v1/verify-driver/", {"token": self._token(p)}, format="json")
        self.assertIn(res.status_code, (401, 403))

