"""Tests for the admin driver activity endpoint.

GET /auth/admin/driver/<DriverProfile.id>/activity/

Covers auth, the DriverProfile.id -> User.id mapping, strict data isolation
between drivers, null defaults, newest-DeviceSession selection, and the rule
that a driver account must NOT 404 (only a missing DriverProfile id 404s).
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

from .models import DeviceSession

User = get_user_model()


class AdminDriverActivityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create users first so DriverProfile ids diverge from user ids.
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password="StrongPass123!"
        )
        self.non_staff = User.objects.create_user(
            email="plain@example.com", password="StrongPass123!"
        )
        self.user_a = User.objects.create_user(
            email="driverA@example.com", password="StrongPass123!", user_type="driver"
        )
        self.user_b = User.objects.create_user(
            email="driverB@example.com", password="StrongPass123!", user_type="driver"
        )

        self.profile_a = DriverProfile.objects.create(user=self.user_a, status="approved")
        self.profile_b = DriverProfile.objects.create(user=self.user_b, status="approved")

        assert self.profile_a.id != self.user_a.id
        assert self.profile_b.id != self.user_b.id
        assert self.profile_a.id != self.profile_b.id

    def _url(self, driver_id):
        return f"/auth/admin/driver/{driver_id}/activity/"

    # --- auth ---

    def test_anonymous_denied(self):
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertIn(resp.status_code, (401, 403))

    def test_non_staff_forbidden(self):
        self.client.force_authenticate(self.non_staff)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 403)

    def test_admin_ok_for_driver(self):
        """A driver account must NOT 404 here (inverted rider rule)."""
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        for key in ("last_login", "last_seen", "last_seen_device"):
            self.assertIn(key, resp.data)

    def test_missing_profile_404(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(999999))
        self.assertEqual(resp.status_code, 404)

    # --- null defaults ---

    def test_nulls_when_no_login_or_session(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data["last_login"])
        self.assertIsNone(resp.data["last_seen"])
        self.assertIsNone(resp.data["last_seen_device"])

    # --- populated values ---

    def test_last_login_reported(self):
        self.user_a.last_login = timezone.now()
        self.user_a.save(update_fields=["last_login"])
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertIsNotNone(resp.data["last_login"])

    def test_newest_device_session_reported(self):
        from datetime import timedelta

        now = timezone.now()
        old = DeviceSession.objects.create(
            user=self.user_a, device_id="old-device", device_name="Old Phone"
        )
        newest = DeviceSession.objects.create(
            user=self.user_a, device_id="new-device", device_name="New Phone"
        )
        # last_seen_at is auto_now, so both rows land on the same instant when
        # created back-to-back. Pin explicit, distinct timestamps via update()
        # (which bypasses auto_now) so ordering is deterministic.
        DeviceSession.objects.filter(pk=old.pk).update(
            last_seen_at=now - timedelta(hours=1)
        )
        DeviceSession.objects.filter(pk=newest.pk).update(last_seen_at=now)

        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["last_seen_device"], "New Phone")
        self.assertIsNotNone(resp.data["last_seen"])

    # --- data isolation / id mapping ---

    def test_data_isolation_profile_id_resolves_user_id(self):
        DeviceSession.objects.create(
            user=self.user_a, device_id="a-device", device_name="A Phone"
        )
        DeviceSession.objects.create(
            user=self.user_b, device_id="b-device", device_name="B Phone"
        )

        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["last_seen_device"], "A Phone")

    def test_driver_b_session_never_leaks(self):
        DeviceSession.objects.create(
            user=self.user_b, device_id="b-device", device_name="B Phone"
        )
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data["last_seen_device"])
