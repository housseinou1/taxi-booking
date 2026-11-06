"""Electronic employee signature — storage, API, permissions, audit and card rendering.

Guards the Founder/CEO requirements: capture and upload work, preview works, the signature
appears on the card/PDF/print, a missing signature prints the literal placeholder, only
authorized tiers can modify it, every change is audited, and the card stays exact CR80.
"""

import io
import re
import tempfile

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from employees.models import StaffEmployee
from employees.services import card_service, signature_storage
from security.models import AuditLog

User = get_user_model()


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _employee(employee_number="YAM110001LAR", **overrides):
    data = {
        "employee_number": employee_number,
        "full_name": "Aicha Mint Ahmed",
        "department": "Operations",
        "job_title": "Dispatcher",
    }
    data.update(overrides)
    return StaffEmployee.objects.create(**data)


def _png_bytes(size=(240, 80), mode="RGBA", colour=(0, 0, 0, 0)):
    from PIL import Image

    image = Image.new(mode, size, colour)
    # A visible stroke on a transparent background, like a real signature capture. The stroke
    # is clamped to the image so small test images (dimension-cap tests) stay valid.
    if mode == "RGBA" and size[0] > 24 and size[1] > 2:
        for x in range(20, min(size[0] - 4, 200)):
            image.putpixel((x, size[1] // 2), (15, 23, 42, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _jpeg_bytes(size=(240, 80)):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (255, 255, 255)).save(buffer, format="JPEG")
    return buffer.getvalue()


class SignatureStorageTests(TestCase):
    """File validation, normalization and fail-safe replacement."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)

    def _stored_bytes(self, key):
        with signature_storage.open_signature(key) as handle:
            return handle.read()

    def test_png_is_accepted_and_transparency_and_geometry_survive(self):
        from PIL import Image

        key = signature_storage.save_signature(_png_bytes(size=(240, 80)))
        self.assertTrue(key.endswith(".png"))
        with Image.open(io.BytesIO(self._stored_bytes(key))) as stored:
            self.assertEqual(stored.format, "PNG")
            self.assertEqual(stored.mode, "RGBA")
            # Original proportions are never rescaled or cropped by storage.
            self.assertEqual(stored.size, (240, 80))
            # Corner alpha is preserved (transparent background).
            self.assertEqual(stored.getpixel((0, 0))[3], 0)

    def test_jpeg_is_accepted_and_normalized_to_png(self):
        from PIL import Image

        key = signature_storage.save_signature(_jpeg_bytes())
        with Image.open(io.BytesIO(self._stored_bytes(key))) as stored:
            self.assertEqual(stored.format, "PNG")

    def test_non_image_payload_is_rejected(self):
        with self.assertRaises(signature_storage.SignatureValidationError):
            signature_storage.save_signature(b"this is not an image")

    def test_empty_payload_is_rejected(self):
        with self.assertRaises(signature_storage.SignatureValidationError):
            signature_storage.save_signature(b"")

    @override_settings(EMPLOYEE_SIGNATURE_MAX_BYTES=10)
    def test_oversized_payload_is_rejected(self):
        with self.assertRaises(signature_storage.SignatureValidationError):
            signature_storage.save_signature(_png_bytes())

    @override_settings(EMPLOYEE_SIGNATURE_MAX_DIMENSION=10)
    def test_oversized_dimensions_are_rejected(self):
        with self.assertRaises(signature_storage.SignatureValidationError):
            signature_storage.save_signature(_png_bytes(size=(40, 40)))

    def test_delete_removes_the_stored_file(self):
        key = signature_storage.save_signature(_png_bytes())
        self.assertTrue(signature_storage.delete_signature(key))
        with self.assertRaises(FileNotFoundError):
            signature_storage.open_signature(key)


class SignatureApiTests(TestCase):
    """Endpoint behaviour and the authorization tiers that protect it."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.employee = _employee()
        self.url = f"/employees/{self.employee.employee_number}/signature/"

        self.staff = _in_group(_user("sig-staff@test.local", is_staff=True), "HR Staff")
        self.manager = _in_group(_user("sig-manager@test.local", is_staff=True), "HR Manager")
        self.admin = _in_group(_user("sig-admin@test.local", is_staff=True), "Administrator")

        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)

    def _post(self, *, user, consent="true", source="pad", payload=None):
        self.client.force_authenticate(user=user)
        return self.client.post(
            self.url,
            {
                "signature": io.BytesIO(payload if payload is not None else _png_bytes()),
                "consent": consent,
                "source": source,
            },
            format="multipart",
        )

    def _events(self):
        return [
            row.details.get("event")
            for row in AuditLog.objects.all()
            if isinstance(row.details, dict)
        ]

    def test_anonymous_access_is_denied(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_get_returns_404_when_no_signature_exists(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 404)
        self.assertIn("No signature", response.json()["detail"])

    def test_capture_requires_employee_consent(self):
        response = self._post(user=self.manager, consent="false")
        self.assertEqual(response.status_code, 400)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_key, "")
        self.assertFalse(self.employee.signature_consent_confirmed)

    def test_hr_staff_cannot_record_a_signature(self):
        response = self._post(user=self.staff)
        self.assertEqual(response.status_code, 403)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_key, "")

    def test_hr_manager_captures_a_pad_signature(self):
        response = self._post(user=self.manager, source="pad")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["has_signature"])
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.signature_key)
        self.assertEqual(self.employee.signature_source, "pad")
        self.assertTrue(self.employee.signature_consent_confirmed)
        self.assertIsNotNone(self.employee.signature_provided_at)
        self.assertEqual(self.employee.signature_provided_by, self.manager)
        self.assertIn("employee.signature_capture", self._events())

    def test_uploaded_signature_is_recorded_as_upload(self):
        response = self._post(user=self.manager, source="upload")
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_source, "upload")
        self.assertIn("employee.signature_upload", self._events())

    def test_hr_staff_can_preview_the_signature_privately(self):
        self._post(user=self.manager)
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertTrue(b"".join(response.streaming_content).startswith(b"\x89PNG"))
        response.close()  # release the private file handle (Windows teardown)
        self.assertIn("employee.signature_access", self._events())

    def test_replacing_keeps_one_signature_and_audits_the_change(self):
        self._post(user=self.manager)
        self.employee.refresh_from_db()
        first_key = self.employee.signature_key

        response = self._post(user=self.manager, payload=_jpeg_bytes(size=(300, 100)))
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertNotEqual(self.employee.signature_key, first_key)
        self.assertIn("employee.signature_replace", self._events())
        with self.assertRaises(FileNotFoundError):
            signature_storage.open_signature(first_key)

    def test_hr_manager_cannot_remove_a_signature(self):
        self._post(user=self.manager)
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f"{self.url}remove/")
        self.assertEqual(response.status_code, 403)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.signature_key)

    def test_administrator_removal_clears_the_record_and_audits_it(self):
        self._post(user=self.manager)
        self.employee.refresh_from_db()
        key = self.employee.signature_key

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"{self.url}remove/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["file_removed"])

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_key, "")
        self.assertEqual(self.employee.signature_source, "")
        self.assertFalse(self.employee.signature_consent_confirmed)
        self.assertIsNone(self.employee.signature_provided_at)
        self.assertIsNone(self.employee.signature_provided_by)
        self.assertIn("employee.signature_remove", self._events())
        with self.assertRaises(FileNotFoundError):
            signature_storage.open_signature(key)



class CardSignaturePdfTests(TestCase):
    """The signature must reach the PDF (and therefore Print), and CR80 must not move."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.client = APIClient()
        self.manager = _in_group(_user("sig-pdf-manager@test.local", is_staff=True), "HR Manager")
        self.employee = _employee()
        self.card = card_service.issue_card(self.employee)
        self.url = f"/employees/{self.employee.employee_number}/cards/{self.card.pk}/pdf/"
        self.signature_url = f"/employees/{self.employee.employee_number}/signature/"

    def _pdf(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return b"".join(response.streaming_content)

    def _record_signature(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            self.signature_url,
            {
                "signature": io.BytesIO(_png_bytes()),
                "consent": "true",
                "source": "pad",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)

    def test_front_labels_the_signature_block(self):
        from employees.tests.test_card_pdf_endpoint import _pdf_text

        text = _pdf_text(self._pdf())
        self.assertIn("EMPLOYEE SIGNATURE", text)

    def test_missing_signature_prints_the_placeholder_and_never_a_signature(self):
        from employees.tests.test_card_pdf_endpoint import _pdf_text

        text = _pdf_text(self._pdf())
        self.assertIn("Signature not provided", text)

    def test_stored_signature_is_embedded_and_replaces_the_placeholder(self):
        from employees.tests.test_card_pdf_endpoint import _pdf_text

        without = self._pdf()
        self._record_signature()
        with_signature = self._pdf()

        self.assertIn("Signature not provided", _pdf_text(without))
        text = _pdf_text(with_signature)
        self.assertNotIn("Signature not provided", text)
        self.assertIn("EMPLOYEE SIGNATURE", text)
        # One extra embedded image (the signature) must now be present.
        self.assertGreater(
            with_signature.count(b"/Subtype /Image"), without.count(b"/Subtype /Image")
        )

    def test_card_dimensions_remain_exact_cr80(self):
        payload = self._pdf()
        boxes = re.findall(rb"/MediaBox\s*\[([^\]]*)\]", payload)
        self.assertGreaterEqual(len(boxes), 2)
        for box in boxes:
            x0, y0, x1, y1 = (float(part) for part in box.split())
            # 85.60 mm x 53.98 mm in PostScript points (1 mm = 2.834645669 pt).
            self.assertAlmostEqual(x1 - x0, 242.65, delta=0.05)
            self.assertAlmostEqual(y1 - y0, 153.01, delta=0.05)

class SignatureApiValidationTests(TestCase):
    """An invalid upload must be rejected without storing anything."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)
        self.employee = _employee()
        self.manager = _in_group(_user("sig-invalid@test.local", is_staff=True), "HR Manager")
        self.client = APIClient()

    def test_invalid_image_is_rejected_without_storing_anything(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            f"/employees/{self.employee.employee_number}/signature/",
            {"signature": io.BytesIO(b"not an image"), "consent": "true", "source": "pad"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.signature_key, "")


class SignatureAuditPrivacyTests(TestCase):
    """The audit trail must never carry signature payloads or storage keys."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)
        self.employee = _employee()
        self.manager = _in_group(_user("sig-audit@test.local", is_staff=True), "HR Manager")
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

    def test_audit_details_never_contain_signature_payload_or_key(self):
        self.client.post(
            f"/employees/{self.employee.employee_number}/signature/",
            {"signature": io.BytesIO(_png_bytes()), "consent": "true", "source": "pad"},
            format="multipart",
        )
        for row in AuditLog.objects.all():
            blob = str(row.details)
            self.assertNotIn("signature_key", blob)
            self.assertNotIn("signature_bytes", blob)
            self.assertNotIn("base64", blob)


class SignatureStorageReplacementTests(TestCase):
    """Fail-safe replacement and opaque keys at the storage layer."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        override = override_settings(PROTECTED_MEDIA_ROOT=self._tmp.name)
        override.enable()
        self.addCleanup(override.disable)

    def _stored_bytes(self, key):
        with signature_storage.open_signature(key) as handle:
            return handle.read()

    def test_replace_fails_safe_and_keeps_the_existing_signature(self):
        key = signature_storage.save_signature(_png_bytes())
        before = self._stored_bytes(key)
        with self.assertRaises(signature_storage.SignatureValidationError):
            signature_storage.replace_signature(key, b"garbage")
        # The rejected upload must not have destroyed the existing file.
        self.assertEqual(self._stored_bytes(key), before)

    def test_replace_swaps_the_file_and_removes_the_old_one(self):
        key = signature_storage.save_signature(_png_bytes())
        new_key = signature_storage.replace_signature(key, _jpeg_bytes(size=(300, 100)))
        self.assertNotEqual(key, new_key)
        with self.assertRaises(FileNotFoundError):
            signature_storage.open_signature(key)

    def test_stored_path_is_an_opaque_uuid_not_employee_identifiable(self):
        key = signature_storage.save_signature(_png_bytes())
        self.assertRegex(key, r"^[0-9a-f]{32}\.png$")
        self.assertNotIn("YAM", key)
