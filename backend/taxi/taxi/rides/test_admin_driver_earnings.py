"""Tests for the admin driver earnings-breakdown endpoint.

Covers authorization, the DriverProfile.id -> User.id mapping, strict driver
data isolation, Decimal-safe money (strings or null, never float/0), the
total/today/week/month buckets, and regression of the shared mobile contract
driver_earnings_summary (/rides/driver/earnings/).
"""
from django.contrib.auth.models import Group

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride


def _make_user(email, phone, national_id, **extra):
    return User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Test",
        last_name="User",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        national_id_number=national_id,
        **extra,
    )


def _make_driver(email, phone, national_id, driver_code, qr_uuid):
    user = _make_user(email, phone, national_id, user_type="driver")
    profile = DriverProfile.objects.create(
        user=user,
        status="approved",
        driver_code=driver_code,
        qr_code_uuid=qr_uuid,
        is_available=True,
        registration_status="approved",
    )
    return user, profile


class AdminDriverEarningsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="admin-drv-earn@test.local",
            password="StrongPass123",
            is_staff=True,
        )
        # module-gated admin endpoint: give the acting admin an explicit role
        self.admin.groups.add(Group.objects.get_or_create(name="CEO")[0])

        # Diverge the DriverProfile id sequence from the User id sequence.
        throwaway_user = _make_user(
            "throwaway-earn@example.com", "+22233300010", "2224000010", user_type="driver"
        )
        throwaway_profile = DriverProfile.objects.create(
            user=throwaway_user,
            status="pending",
            driver_code="T10000",
            qr_code_uuid="40000000-0000-4000-8000-000000000110",
        )
        throwaway_profile.delete()
        throwaway_user.delete()

        self.driver_a_user, self.driver_a = _make_driver(
            "earn-a@example.com",
            "+22233300001",
            "2224000001",
            "940001",
            "40000000-0000-4000-8000-000000000001",
        )
        self.driver_b_user, self.driver_b = _make_driver(
            "earn-b@example.com",
            "+22233300002",
            "2224000002",
            "940002",
            "40000000-0000-4000-8000-000000000002",
        )
        self.rider = _make_user(
            "earn-rider@example.com", "+22233300003", "2224000003", rider_status="approved"
        )

        now = timezone.now()

        # Driver A: 2 completed today -> earnings 300+200=500, commission 100+100=200.
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver_a_user,
            pickup="A1",
            destination="B1",
            fare=Decimal("400.00"),
            driver_earning=Decimal("300.00"),
            app_fee=Decimal("100.00"),
            status="completed",
            completed_at=now,
        )
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver_a_user,
            pickup="A2",
            destination="B2",
            fare=Decimal("300.00"),
            driver_earning=Decimal("200.00"),
            app_fee=Decimal("100.00"),
            status="completed",
            completed_at=now,
        )
        # A cancelled ride must never count toward earnings.
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver_a_user,
            pickup="A3",
            destination="B3",
            fare=Decimal("999.00"),
            driver_earning=Decimal("999.00"),
            app_fee=Decimal("999.00"),
            status="cancelled",
        )

        # Driver B: 1 completed — must never leak into A's buckets.
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver_b_user,
            pickup="BX",
            destination="BY",
            fare=Decimal("777.00"),
            driver_earning=Decimal("777.00"),
            app_fee=Decimal("123.00"),
            status="completed",
            completed_at=now,
        )

    def _url(self, driver_profile_id):
        return f"/rides/admin/driver/{driver_profile_id}/earnings/"

    # ── ID mapping sanity ───────────────────────────────────────────────────
    def test_profile_id_differs_from_user_id(self):
        self.assertNotEqual(self.driver_a.id, self.driver_a.user_id)
        self.assertNotEqual(self.driver_a.id, self.driver_b.id)

    # ── Authorization ─────────────────────────────────────────────────────
    def test_anonymous_denied(self):
        response = self.client.get(self._url(self.driver_a.id))
        self.assertIn(response.status_code, (401, 403))

    def test_non_staff_denied(self):
        self.client.force_authenticate(user=self.driver_a_user)
        response = self.client.get(self._url(self.driver_a.id))
        self.assertEqual(response.status_code, 403)

    def test_admin_allowed(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id))
        self.assertEqual(response.status_code, 200)

    def test_missing_profile_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(999999))
        self.assertEqual(response.status_code, 404)

    # ── Buckets, Decimal safety, data isolation ──────────────────────────────
    def test_total_bucket_decimal_strings(self):
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(self._url(self.driver_a.id)).json()
        total = data["total"]
        self.assertEqual(total["earnings_mru"], "500.00")
        self.assertEqual(total["commission_mru"], "200.00")
        self.assertEqual(total["payout_mru"], "500.00")
        self.assertEqual(total["ride_count"], 2)
        self.assertEqual(total["currency"], "MRU")
        self.assertEqual(data["currency"], "MRU")
        # Money is a string, never a float.
        self.assertIsInstance(total["earnings_mru"], str)

    def test_today_week_month_buckets(self):
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(self._url(self.driver_a.id)).json()
        for key in ("today", "week", "month"):
            self.assertEqual(data[key]["earnings_mru"], "500.00")
            self.assertEqual(data[key]["ride_count"], 2)

    def test_data_isolation_b_does_not_leak(self):
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(self._url(self.driver_a.id)).json()
        # B's completed earning (777.00) must not be present anywhere.
        self.assertEqual(data["total"]["earnings_mru"], "500.00")

    def test_empty_period_returns_null_not_zero(self):
        empty_user, empty_profile = _make_driver(
            "earn-empty@example.com",
            "+22233300099",
            "2224000099",
            "940099",
            "40000000-0000-4000-8000-000000000099",
        )
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(self._url(empty_profile.id)).json()
        for key in ("total", "today", "week", "month"):
            self.assertIsNone(data[key]["earnings_mru"])
            self.assertIsNone(data[key]["commission_mru"])
            self.assertIsNone(data[key]["payout_mru"])
            self.assertEqual(data[key]["ride_count"], 0)

    # ── Regression: shared mobile contract unchanged ─────────────────────────
    def test_driver_earnings_summary_contract_unchanged(self):
        self.client.force_authenticate(user=self.driver_a_user)
        response = self.client.get("/rides/driver/earnings/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total_earnings", data)
        # self-earnings endpoint keeps its float contract.
        self.assertIsInstance(data["total_earnings"], float)
