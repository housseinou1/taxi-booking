"""Login-contract tests for the Yala Admin / CEO production login investigation.

These pin the backend `login_view` behavior to prove the diagnosis: with the
CURRENT backend code, a valid CEO (active, staff, superuser, CEO group) does NOT
receive the 401 "Invalid email or password" — it either gets tokens or, when
TOTP is confirmed, the 2FA-required pending step. The 401 only occurs for a
missing user or a genuinely wrong password.

Safe/offline: uses fabricated test credentials against the isolated test DB.
No production access, no real-password attempts.
"""

import pyotp
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from admin_2fa.models import AdminTOTP

User = get_user_model()
LOGIN = "/auth/login/"

CEO_EMAIL = "ceo@yala.test"
CEO_PASSWORD = "Fake-CeoPass!234"  # test-only, never a real credential


class CeoLoginContractTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.ceo = User.objects.create_superuser(email=CEO_EMAIL, password=CEO_PASSWORD)
        group, _ = Group.objects.get_or_create(name="CEO")
        self.ceo.groups.add(group)

    def test_valid_ceo_credentials_do_not_return_401(self):
        # The crux: correct CEO credentials must NOT produce the 401 the browser
        # saw. With no TOTP configured yet, this issues tokens (200).
        r = self.client.post(
            LOGIN, {"email": CEO_EMAIL, "password": CEO_PASSWORD}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertNotEqual(body.get("error"), "Invalid email or password")
        self.assertIn("access", body)

    def test_valid_ceo_with_totp_gets_2fa_step_not_401(self):
        # Configure + confirm TOTP, then a correct-credential login returns the
        # 2FA pending step (200, is_2fa_required) — still NOT a 401.
        secret = pyotp.random_base32()
        AdminTOTP.objects.create(user=self.ceo, secret=secret, is_confirmed=True)
        cache.clear()
        r = self.client.post(
            LOGIN, {"email": CEO_EMAIL, "password": CEO_PASSWORD}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body.get("is_2fa_required"))
        self.assertIn("pending_token", body)
        self.assertNotIn("access", body)  # tokens withheld, but NOT a 401

    def test_wrong_password_returns_401(self):
        r = self.client.post(
            LOGIN, {"email": CEO_EMAIL, "password": "wrong-password"}, format="json"
        )
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()["error"], "Invalid email or password")

    def test_unknown_email_returns_401(self):
        r = self.client.post(
            LOGIN, {"email": "nobody@yala.test", "password": CEO_PASSWORD}, format="json"
        )
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()["error"], "Invalid email or password")

    def test_email_normalization_uppercase_and_spaces(self):
        # login_view does email.strip().lower() + email__iexact, so a surrounding
        # space / different case must still authenticate the same CEO.
        r = self.client.post(
            LOGIN, {"email": f"  {CEO_EMAIL.upper()}  ", "password": CEO_PASSWORD}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.json())

    def test_inactive_account_returns_403_not_401(self):
        self.ceo.is_active = False
        self.ceo.save(update_fields=["is_active"])
        cache.clear()
        r = self.client.post(
            LOGIN, {"email": CEO_EMAIL, "password": CEO_PASSWORD}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        # Distinct message — proves an inactive account is NOT the 401 cause.
        self.assertNotEqual(r.json().get("error"), "Invalid email or password")

    def test_expected_login_payload_fields_are_honored(self):
        # The frontend sends email/password/device_id/device_name. Confirm the
        # endpoint accepts that exact shape and authenticates.
        r = self.client.post(
            LOGIN,
            {
                "email": CEO_EMAIL,
                "password": CEO_PASSWORD,
                "device_id": "test-device-123",
                "device_name": "Investigation Test",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.json())
