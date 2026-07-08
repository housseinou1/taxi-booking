"""OWASP-aligned security hardening tests for auth, 2FA, integrity, and sessions."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from admin_2fa.integrity import require_integrity
from admin_2fa.models import AdminTOTP
from admin_2fa.pending import consume_pending_token, issue_pending_token
from authapp.models import DeviceSession

User = get_user_model()


class DeviceBindingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="rider@example.com",
            password="RiderPass123!",
            first_name="Ada",
            last_name="Rider",
            user_type="rider",
        )

    def test_login_creates_device_session_and_flags_new_device(self):
        response = self.client.post(
            "/auth/login/",
            {
                "email": "rider@example.com",
                "password": "RiderPass123!",
                "device_id": "device-abc-001",
                "device_name": "Pixel",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("is_new_device"))
        self.assertTrue(DeviceSession.objects.filter(user=self.user, device_id="device-abc-001").exists())

        second = self.client.post(
            "/auth/login/",
            {
                "email": "rider@example.com",
                "password": "RiderPass123!",
                "device_id": "device-abc-001",
                "device_name": "Pixel",
            },
            format="json",
        )
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data.get("is_new_device"))

    def test_logout_all_devices_clears_sessions(self):
        login = self.client.post(
            "/auth/login/",
            {
                "email": "rider@example.com",
                "password": "RiderPass123!",
                "device_id": "device-logout-1",
            },
            format="json",
        )
        token = login.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.post("/auth/logout-all-devices/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(DeviceSession.objects.filter(user=self.user).exists())

    @override_settings(MAX_CONCURRENT_DEVICE_SESSIONS=2)
    def test_concurrent_device_session_limit(self):
        for idx in range(3):
            response = self.client.post(
                "/auth/login/",
                {
                    "email": "rider@example.com",
                    "password": "RiderPass123!",
                    "device_id": f"device-limit-{idx}",
                    "device_name": f"Phone-{idx}",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 200)
        self.assertEqual(DeviceSession.objects.filter(user=self.user).count(), 2)
        remaining = set(
            DeviceSession.objects.filter(user=self.user).values_list("device_id", flat=True)
        )
        self.assertEqual(remaining, {"device-limit-1", "device-limit-2"})


class Admin2FATests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="AdminPass123!",
            first_name="Sakho",
            last_name="Admin",
        )
        self.totp = AdminTOTP.objects.create(
            user=self.admin,
            secret="JBSWY3DPEHPK3PXP",
            is_confirmed=True,
        )

    def test_admin_login_requires_2fa_when_confirmed(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "admin@example.com", "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("is_2fa_required"))
        self.assertIn("pending_token", response.data)
        self.assertNotIn("access", response.data)

    def test_pending_token_issues_jwt_after_valid_code(self):
        pending = issue_pending_token(self.admin.id)
        # Valid code for fixed secret may drift; use model verify path with mocked code by temporary valid_window.
        code = self.totp.get_totp().now()
        response = self.client.post(
            "/auth/2fa/verify/",
            {"pending_token": pending, "code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("verified"))
        self.assertIn("access", response.data)
        self.assertIsNone(consume_pending_token(pending))


class IntegrityGateTests(TestCase):
    @override_settings(PLAY_INTEGRITY_ENFORCE=False)
    def test_require_integrity_permissive_when_disabled(self):
        self.assertTrue(require_integrity(123))

    @override_settings(PLAY_INTEGRITY_ENFORCE=True)
    def test_require_integrity_blocks_without_cached_verdict(self):
        cache.clear()
        self.assertFalse(require_integrity(999))
