"""Phase 4 tests: secure employee-photograph storage, upload, retrieval, replace.

Isolated pytest-django test DB. PROTECTED_MEDIA_ROOT is redirected to a
per-test temporary directory so no files are written into the repo.
"""

import io
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from employees.permissions import (
    ADMINISTRATOR_GROUP,
    HR_MANAGER_GROUP,
    HR_STAFF_GROUP,
    ensure_employee_groups,
)
from employees.services import photo_storage
from employees.services.number_service import create_staff_employee
from security.models import AuditLog

User = get_user_model()

_TMP = tempfile.mkdtemp(prefix="yala_emp_photos_test_")


def _png_bytes(size=(300, 400), color=(0, 128, 0)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(size=(300, 400), color=(10, 60, 120)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _user(email, group=None, is_staff=True):
    u = User.objects.create_user(email=email, password="pw", is_staff=is_staff)
    if group:
        g, _ = Group.objects.get_or_create(name=group)
        u.groups.add(g)
    return u


@override_settings(PROTECTED_MEDIA_ROOT=_TMP)
class PhotoStorageServiceTests(TestCase):
    def test_validate_and_normalize_png_to_jpeg(self):
        out = photo_storage.validate_and_normalize(_png_bytes())
        # Normalized output must decode as JPEG (metadata stripped).
        img = Image.open(io.BytesIO(out))
        self.assertEqual(img.format, "JPEG")

    def test_rejects_non_image(self):
        with self.assertRaises(photo_storage.PhotoValidationError):
            photo_storage.validate_and_normalize(b"this is not an image")

    def test_rejects_empty(self):
        with self.assertRaises(photo_storage.PhotoValidationError):
            photo_storage.validate_and_normalize(b"")

    @override_settings(EMPLOYEE_PHOTO_MAX_BYTES=100)
    def test_rejects_oversized_bytes(self):
        with self.assertRaises(photo_storage.PhotoValidationError):
            photo_storage.validate_and_normalize(_png_bytes())

    @override_settings(EMPLOYEE_PHOTO_MAX_DIMENSION=50)
    def test_rejects_oversized_dimensions(self):
        with self.assertRaises(photo_storage.PhotoValidationError):
            photo_storage.validate_and_normalize(_png_bytes(size=(300, 400)))

    def test_save_uses_uuid_filename_no_names(self):
        key = photo_storage.save_photo(_jpeg_bytes())
        self.assertTrue(key.endswith(".jpg"))
        self.assertNotIn("/", key)
        self.assertNotIn("\\", key)
        # UUID hex (32) + .jpg
        self.assertEqual(len(key), 36)

    def test_stored_file_is_private_location(self):
        key = photo_storage.save_photo(_jpeg_bytes())
        stored = Path(_TMP) / "employee_photos" / key
        self.assertTrue(stored.exists())
        # Must live under the protected root, not MEDIA_ROOT.
        from django.conf import settings as dj

        self.assertNotIn(str(dj.MEDIA_ROOT), str(stored))

    def test_path_traversal_key_is_contained(self):
        # A malicious key resolves to a bare filename inside the root; opening a
        # traversal key must not escape (and the file won't exist).
        with self.assertRaises(FileNotFoundError):
            photo_storage.open_photo("../../../../etc/passwd")

    def test_replace_is_fail_safe_on_invalid_new_photo(self):
        key = photo_storage.save_photo(_jpeg_bytes())
        # Replacing with an invalid image must raise and NOT delete the old file.
        with self.assertRaises(photo_storage.PhotoValidationError):
            photo_storage.replace_photo(key, b"garbage")
        self.assertTrue((Path(_TMP) / "employee_photos" / key).exists())

    def test_replace_removes_old_file(self):
        old = photo_storage.save_photo(_jpeg_bytes())
        new = photo_storage.replace_photo(old, _png_bytes())
        self.assertFalse((Path(_TMP) / "employee_photos" / old).exists())
        self.assertTrue((Path(_TMP) / "employee_photos" / new).exists())


@override_settings(PROTECTED_MEDIA_ROOT=_TMP)
class PhotoEndpointTests(TestCase):
    def setUp(self):
        ensure_employee_groups()
        self.client = APIClient()
        self.hr_staff = _user("photostaff@test.local", HR_STAFF_GROUP)
        self.outsider = _user("photomk@test.local", "Marketing")
        self.emp = create_staff_employee(full_name="Photo Subject", department="Ops")
        self.url = f"/employees/{self.emp.employee_number}/photo/"

    def _upload(self, data_bytes, name="x.png", ctype="image/png"):
        f = SimpleUploadedFile(name, data_bytes, content_type=ctype)
        return self.client.post(self.url, {"photo": f}, format="multipart")

    def test_authorized_hr_upload(self):
        self.client.force_authenticate(user=self.hr_staff)
        r = self._upload(_png_bytes())
        self.assertEqual(r.status_code, 200, r.content)
        self.emp.refresh_from_db()
        self.assertTrue(self.emp.photo_key)
        self.assertTrue(
            AuditLog.objects.filter(details__event="employee.photo_upload").exists()
        )

    def test_unauthorized_upload_rejected(self):
        self.client.force_authenticate(user=self.outsider)
        r = self._upload(_png_bytes())
        self.assertEqual(r.status_code, 403)

    def test_anonymous_retrieval_rejected(self):
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_non_hr_retrieval_rejected(self):
        self.client.force_authenticate(user=self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_authorized_retrieval_after_upload(self):
        self.client.force_authenticate(user=self.hr_staff)
        self._upload(_jpeg_bytes(), name="x.jpg", ctype="image/jpeg")
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "image/jpeg")
        self.assertIn("private", r["Cache-Control"])
        body = b"".join(r.streaming_content)
        self.assertEqual(Image.open(io.BytesIO(body)).format, "JPEG")
        self.assertTrue(
            AuditLog.objects.filter(details__event="employee.photo_access").exists()
        )

    def test_invalid_file_rejected(self):
        self.client.force_authenticate(user=self.hr_staff)
        r = self._upload(b"not-an-image", name="x.png")
        self.assertEqual(r.status_code, 400)

    @override_settings(EMPLOYEE_PHOTO_MAX_BYTES=100)
    def test_oversized_upload_rejected(self):
        self.client.force_authenticate(user=self.hr_staff)
        r = self._upload(_png_bytes())
        self.assertEqual(r.status_code, 400)

    def test_replacement_preserves_employee_number(self):
        self.client.force_authenticate(user=self.hr_staff)
        original_number = self.emp.employee_number
        self._upload(_png_bytes())
        self.emp.refresh_from_db()
        first_key = self.emp.photo_key
        self._upload(_jpeg_bytes(), name="y.jpg", ctype="image/jpeg")
        self.emp.refresh_from_db()
        self.assertNotEqual(self.emp.photo_key, first_key)  # new file
        self.assertEqual(self.emp.employee_number, original_number)  # permanent
        self.assertTrue(
            AuditLog.objects.filter(details__event="employee.photo_replace").exists()
        )

    def test_retrieval_without_photo_returns_404(self):
        self.client.force_authenticate(user=self.hr_staff)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_no_image_bytes_in_audit_details(self):
        self.client.force_authenticate(user=self.hr_staff)
        self._upload(_png_bytes())
        entry = AuditLog.objects.filter(details__event="employee.photo_upload").first()
        self.assertIsNotNone(entry)
        # details carry only non-sensitive descriptors.
        self.assertEqual(set(entry.details.keys()), {"event", "has_photo"})
