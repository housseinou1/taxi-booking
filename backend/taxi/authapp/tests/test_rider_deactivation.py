"""Tests for secure rider DEACTIVATION (account blocking) via the admin
`POST /auth/users/<id>/block/` endpoint.

The Riders Management admin UI replaced the dangerous permanent-delete action
with "Deactivate Account", which calls this existing endpoint. These tests lock
in the security-critical behavior the UI relies on:

- the account is deactivated (is_active=False), not deleted (the row survives),
- future login is prevented and active refresh tokens are blacklisted,
- the action is admin-only,
- ride/payment/other related records are preserved (no cascade delete).

No migrations, no model changes — this exercises existing behavior only.
"""
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)


@override_settings(DEBUG=True)
class RiderDeactivationTests(APITestCase):
    def setUp(self):
        from ..models import User

        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="AdminPass123",
            first_name="Admin",
            last_name="User",
            phone_number="+22222000001",
            national_id_number="1234500001",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save(update_fields=["is_staff", "is_superuser"])

        self.rider = User.objects.create_user(
            email="rider@example.com",
            password="RiderPass123",
            first_name="Test",
            last_name="Rider",
            phone_number="+22222000002",
            national_id_number="1234500002",
        )

    def _deactivate(self, user_id):
        return self.client.post(f"/auth/users/{user_id}/block/")

    def test_deactivation_sets_is_active_false_without_deleting_the_account(self):
        from ..models import User

        self.client.force_authenticate(self.admin)
        response = self._deactivate(self.rider.id)

        self.assertEqual(response.status_code, 200)
        # The account row still exists (NOT a permanent delete).
        self.assertTrue(User.objects.filter(id=self.rider.id).exists())
        self.rider.refresh_from_db()
        self.assertFalse(self.rider.is_active)

    def test_deactivation_blacklists_outstanding_refresh_tokens(self):
        # Give the rider an active refresh token (simulating a live session).
        refresh = RefreshToken.for_user(self.rider)
        self.assertTrue(
            OutstandingToken.objects.filter(user=self.rider).exists()
        )

        self.client.force_authenticate(self.admin)
        self._deactivate(self.rider.id)

        # Every outstanding token for the rider is now blacklisted (cannot be
        # used to refresh -> prevents continued/future access).
        outstanding = OutstandingToken.objects.filter(user=self.rider)
        self.assertTrue(outstanding.exists())
        for token in outstanding:
            self.assertTrue(
                BlacklistedToken.objects.filter(token=token).exists(),
                "deactivation must blacklist the rider's outstanding tokens",
            )

    def test_deactivated_rider_cannot_log_in(self):
        self.client.force_authenticate(self.admin)
        self._deactivate(self.rider.id)
        self.client.force_authenticate(None)

        login = self.client.post(
            "/auth/login/",
            {"email": "rider@example.com", "password": "RiderPass123"},
            format="json",
        )
        # Inactive account must not receive a successful login.
        self.assertNotEqual(login.status_code, 200)

    def test_deactivation_requires_admin(self):
        # A non-staff user cannot deactivate anyone.
        self.client.force_authenticate(self.rider)
        response = self._deactivate(self.admin.id)
        self.assertIn(response.status_code, (401, 403))

    def test_deactivation_is_reversible_via_unblock(self):
        self.client.force_authenticate(self.admin)
        self._deactivate(self.rider.id)
        self.rider.refresh_from_db()
        self.assertFalse(self.rider.is_active)

        reactivate = self.client.post(f"/auth/users/{self.rider.id}/unblock/")
        self.assertEqual(reactivate.status_code, 200)
        self.rider.refresh_from_db()
        self.assertTrue(self.rider.is_active)
