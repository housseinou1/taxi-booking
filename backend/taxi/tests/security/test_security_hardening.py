from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from taxi.security.upload_validation import validate_document_upload, validate_image_upload


User = get_user_model()


class UploadValidationTests(TestCase):
    def test_rejects_executable_extension(self):
        upload = SimpleUploadedFile("proof.exe", b"MZ", content_type="application/octet-stream")
        result = validate_image_upload(upload)
        self.assertFalse(result.valid)

    def test_accepts_png_image(self):
        upload = SimpleUploadedFile("proof.png", b"\x89PNG\r\n", content_type="image/png")
        result = validate_image_upload(upload)
        self.assertTrue(result.valid)

    def test_rejects_oversized_image(self):
        upload = SimpleUploadedFile(
            "large.jpg",
            b"x" * (6 * 1024 * 1024),
            content_type="image/jpeg",
        )
        result = validate_image_upload(upload)
        self.assertFalse(result.valid)

    def test_accepts_pdf_document(self):
        upload = SimpleUploadedFile("license.pdf", b"%PDF-1.4", content_type="application/pdf")
        result = validate_document_upload(upload)
        self.assertTrue(result.valid)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "security-hardening-tests",
        }
    }
)
class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        User.objects.create_user(
            email="login@test.local",
            password="CorrectPass!123",
            user_type="rider",
        )

    def test_login_rate_limited(self):
        for _ in range(10):
            response = self.client.post(
                "/auth/login/",
                {"email": "login@test.local", "password": "wrong-password"},
                format="json",
            )
            self.assertIn(response.status_code, {401, 400})

        blocked = self.client.post(
            "/auth/login/",
            {"email": "login@test.local", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)


class PasswordResetEmailSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        User.objects.create_user(
            email="reset@test.local",
            password="OldPass!123",
            user_type="rider",
        )

    def test_legacy_password_reset_is_rate_limited(self):
        for _ in range(5):
            response = self.client.post(
                "/auth/password/reset/",
                {"email": "reset@test.local"},
                format="json",
            )
            self.assertEqual(response.status_code, 200)

        blocked = self.client.post(
            "/auth/password/reset/",
            {"email": "reset@test.local"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
