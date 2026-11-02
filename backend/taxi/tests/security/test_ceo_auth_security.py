"""Phase 6.3A — CEO authentication & authorization security tests.

Development/test environment only (isolated pytest-django DB). Verifies:
  - a superuser + CEO group resolves to the 'ceo' admin dashboard role
  - MFA setup / confirmation / login enforcement (pending-token -> JWT)
  - invalid and expired MFA codes are rejected
  - rider accounts cannot reach protected admin endpoints
  - creating the CEO account leaves existing rider accounts unchanged
  - admin API endpoints enforce authorization server-side

No production access, no CEO-only enforcement, no deploy/commit.
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
PERMISSIONS = "/operations/admin/me/permissions/"
TOTP_SETUP = "/auth/2fa/setup/"
TOTP_CONFIRM = "/auth/2fa/confirm/"
TOTP_VERIFY = "/auth/2fa/verify/"


def _make_ceo(email="ceo@yala.test", password="CeoPass!234"):
    """Mirror the Phase 6.3 production procedure: superuser + CEO group."""
    ceo = User.objects.create_superuser(email=email, password=password)
    group, _ = Group.objects.get_or_create(name="CEO")
    ceo.groups.add(group)
    return ceo


def _make_rider(email="rider@yala.test", password="RiderPass!234"):
    return User.objects.create_user(email=email, password=password, user_type="rider")


class CeoRoleResolutionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.ceo = _make_ceo()

    def test_superuser_in_ceo_group_resolves_ceo_role(self):
        from operations.admin_permissions_service import build_admin_permissions

        payload = build_admin_permissions(self.ceo)
        self.assertEqual(payload["role"], "ceo")
        self.assertEqual(payload["home_route"], "/admin/home/ceo")
        self.assertTrue(payload["elevated"])
        # CEO sees the full module set incl. the employees module.
        self.assertIn("employees", payload["modules"])
        self.assertTrue(payload["actions"]["employees.administer"])

    def test_ceo_can_fetch_permissions_endpoint(self):
        self.client.force_authenticate(user=self.ceo)
        r = self.client.get(PERMISSIONS)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["role"], "ceo")


class CeoMfaEnforcementTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "CeoPass!234"
        self.ceo = _make_ceo(password=self.password)

    def _login(self):
        return self.client.post(
            LOGIN, {"email": self.ceo.email, "password": self.password}, format="json"
        )

    def test_login_without_mfa_configured_issues_tokens(self):
        # Before TOTP is confirmed, the admin login issues tokens directly.
        r = self._login()
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body.get("is_2fa_required", False))
        self.assertIn("access", body)

    def test_mfa_setup_confirm_then_login_requires_second_factor(self):
        # 1) Setup TOTP (authenticated as the CEO).
        self.client.force_authenticate(user=self.ceo)
        setup = self.client.post(TOTP_SETUP, {}, format="json")
        self.assertEqual(setup.status_code, 200)
        secret = setup.json()["secret"]

        # 2) Confirm with a valid code.
        valid = pyotp.TOTP(secret).now()
        confirm = self.client.post(TOTP_CONFIRM, {"code": valid}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self.assertTrue(AdminTOTP.objects.get(user=self.ceo).is_confirmed)

        # 3) Now a fresh password login must require the second factor (no JWT yet).
        self.client.force_authenticate(user=None)
        cache.clear()  # avoid login rate-limit bleed
        login = self._login()
        self.assertEqual(login.status_code, 200)
        body = login.json()
        self.assertTrue(body.get("is_2fa_required"))
        self.assertIn("pending_token", body)
        self.assertNotIn("access", body)  # tokens withheld until 2FA

        # 4) Completing 2FA with a valid code issues tokens.
        pending = body["pending_token"]
        code = pyotp.TOTP(secret).now()
        verify = self.client.post(
            TOTP_VERIFY, {"pending_token": pending, "code": code}, format="json"
        )
        self.assertEqual(verify.status_code, 200)
        self.assertTrue(verify.json()["verified"])
        self.assertIn("access", verify.json())

    def test_invalid_mfa_code_rejected(self):
        self.client.force_authenticate(user=self.ceo)
        secret = self.client.post(TOTP_SETUP, {}, format="json").json()["secret"]
        self.client.post(TOTP_CONFIRM, {"code": pyotp.TOTP(secret).now()}, format="json")

        self.client.force_authenticate(user=None)
        cache.clear()
        body = self._login().json()
        pending = body["pending_token"]
        # Wrong 6-digit code.
        verify = self.client.post(
            TOTP_VERIFY, {"pending_token": pending, "code": "000000"}, format="json"
        )
        self.assertEqual(verify.status_code, 400)
        self.assertNotIn("access", verify.json())

    def test_expired_mfa_code_rejected(self):
        self.client.force_authenticate(user=self.ceo)
        secret = self.client.post(TOTP_SETUP, {}, format="json").json()["secret"]
        self.client.post(TOTP_CONFIRM, {"code": pyotp.TOTP(secret).now()}, format="json")

        self.client.force_authenticate(user=None)
        cache.clear()
        body = self._login().json()
        pending = body["pending_token"]
        # A code from a window far in the past is expired/invalid.
        expired = pyotp.TOTP(secret).at(0)  # unix epoch — far outside valid_window
        verify = self.client.post(
            TOTP_VERIFY, {"pending_token": pending, "code": expired}, format="json"
        )
        self.assertEqual(verify.status_code, 400)
        self.assertNotIn("access", verify.json())


class RiderCannotAccessAdminTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.rider = _make_rider()

    def test_rider_denied_permissions_endpoint(self):
        self.client.force_authenticate(user=self.rider)
        r = self.client.get(PERMISSIONS)
        self.assertEqual(r.status_code, 403)

    def test_anonymous_denied_permissions_endpoint(self):
        r = self.client.get(PERMISSIONS)
        self.assertIn(r.status_code, (401, 403))

    def test_rider_denied_sample_admin_endpoints(self):
        # Backend authorization must hold regardless of the frontend.
        self.client.force_authenticate(user=self.rider)
        for path in (
            "/operations/center/dashboard/",
            "/operations/fleet/dashboard/",
            "/employees/",
        ):
            r = self.client.get(path)
            self.assertIn(
                r.status_code, (401, 403),
                f"rider unexpectedly allowed at {path} (status {r.status_code})",
            )

    def test_rider_role_resolves_rider_not_admin(self):
        self.client.force_authenticate(user=self.rider)
        r = self.client.post(LOGIN, {"email": self.rider.email, "password": "RiderPass!234"}, format="json")
        # Fresh client login (not force_authenticate) to inspect role.
        c = APIClient()
        cache.clear()
        body = c.post(LOGIN, {"email": self.rider.email, "password": "RiderPass!234"}, format="json").json()
        self.assertEqual(body.get("role"), "rider")
        self.assertFalse(body.get("is_staff"))


class CeoCreationDoesNotModifyRidersTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_creating_ceo_leaves_existing_rider_unchanged(self):
        rider = _make_rider()
        snapshot = {
            "is_staff": rider.is_staff,
            "is_superuser": rider.is_superuser,
            "is_active": rider.is_active,
            "user_type": rider.user_type,
            "password": rider.password,
            "groups": sorted(rider.groups.values_list("name", flat=True)),
        }

        _make_ceo()  # create the CEO after the rider exists

        rider.refresh_from_db()
        self.assertEqual(rider.is_staff, snapshot["is_staff"])
        self.assertFalse(rider.is_staff)
        self.assertEqual(rider.is_superuser, snapshot["is_superuser"])
        self.assertEqual(rider.is_active, snapshot["is_active"])
        self.assertEqual(rider.user_type, snapshot["user_type"])
        self.assertEqual(rider.password, snapshot["password"])  # hash untouched
        self.assertEqual(
            sorted(rider.groups.values_list("name", flat=True)), snapshot["groups"]
        )


class AdminEndpointAuthorizationMatrixTests(TestCase):
    """Confirm sample admin endpoints enforce authorization server-side:
    CEO allowed, rider denied."""

    def setUp(self):
        cache.clear()
        self.ceo = _make_ceo()
        self.rider = _make_rider()

    def _status(self, user, path):
        c = APIClient()
        c.force_authenticate(user=user)
        return c.get(path).status_code

    def test_permissions_endpoint_matrix(self):
        self.assertEqual(self._status(self.ceo, PERMISSIONS), 200)
        self.assertEqual(self._status(self.rider, PERMISSIONS), 403)

    def test_employees_endpoint_matrix(self):
        # CEO (elevated) allowed; rider denied. Employees list is HR-gated and
        # CEO passes via superuser/CEO membership.
        self.assertIn(self._status(self.ceo, "/employees/"), (200,))
        self.assertEqual(self._status(self.rider, "/employees/"), 403)
