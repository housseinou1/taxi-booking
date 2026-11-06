"""Tests for the admin driver ride-history + statistics endpoint.

Covers authorization, strict driver data isolation, the DriverProfile.id ->
User.id mapping, pagination caps, status/date filtering, malformed-date handling,
Decimal-safe summary stats, and regression of the shared mobile contracts
(driver_earnings_summary at /rides/driver/earnings/ and serialize_driver at
/drivers/me/).
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
    """Create a driver User + DriverProfile, forcing DriverProfile.id to diverge
    from User.id by first creating and deleting throwaway profile rows."""
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


class AdminDriverRideHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="admin-drv-hist@test.local",
            password="StrongPass123",
            is_staff=True,
        )
        # module-gated admin endpoint: give the acting admin an explicit role
        self.admin.groups.add(Group.objects.get_or_create(name="CEO")[0])

        # Burn a DriverProfile id so surviving profile ids diverge from user ids:
        # create a throwaway driver+profile, then delete both. The User and
        # DriverProfile id sequences advance independently, so the real profiles
        # created afterward have ids that differ from their user ids.
        throwaway_user = _make_user(
            "throwaway-drv@example.com", "+22233200010", "2223000010", user_type="driver"
        )
        throwaway_profile = DriverProfile.objects.create(
            user=throwaway_user,
            status="pending",
            driver_code="T00000",
            qr_code_uuid="30000000-0000-4000-8000-000000000110",
        )
        throwaway_profile.delete()
        throwaway_user.delete()

        self.driver_a_user, self.driver_a = _make_driver(
            "drv-a@example.com",
            "+22233200001",
            "2223000001",
            "930001",
            "30000000-0000-4000-8000-000000000001",
        )
        self.driver_b_user, self.driver_b = _make_driver(
            "drv-b@example.com",
            "+22233200002",
            "2223000002",
            "930002",
            "30000000-0000-4000-8000-000000000002",
        )

        self.rider = _make_user(
            "drv-hist-rider@example.com", "+22233200003", "2223000003", rider_status="approved"
        )

        now = timezone.now()

        # Driver A: 2 completed (300.00 + 200.00 = 500.00, avg 250.00), 1 cancelled.
        self.a_completed_1 = Ride.objects.create(
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
        self.a_completed_2 = Ride.objects.create(
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
        self.a_cancelled = Ride.objects.create(
            rider=self.rider,
            driver=self.driver_a_user,
            pickup="A3",
            destination="B3",
            fare=Decimal("50.00"),
            status="cancelled",
        )

        # Driver B: 1 completed — must never leak into A's endpoint.
        self.b_completed = Ride.objects.create(
            rider=self.rider,
            driver=self.driver_b_user,
            pickup="BX",
            destination="BY",
            fare=Decimal("999.00"),
            driver_earning=Decimal("777.00"),
            app_fee=Decimal("222.00"),
            status="completed",
            completed_at=now,
        )

    def _url(self, driver_profile_id):
        return f"/rides/admin/driver/{driver_profile_id}/history/"

    # ── ID mapping sanity ───────────────────────────────────────────────────
    def test_profile_id_differs_from_user_id(self):
        self.assertNotEqual(self.driver_a.id, self.driver_a.user_id)
        self.assertNotEqual(self.driver_b.id, self.driver_b.user_id)
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

    # ── Data isolation + ID mapping ──────────────────────────────────────────
    def test_only_target_driver_rides_returned(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        returned_ids = {row["id"] for row in data["results"]}
        # The URL carried DriverProfile.id but resolved to driver_a's user_id.
        self.assertEqual(
            returned_ids,
            {self.a_completed_1.id, self.a_completed_2.id, self.a_cancelled.id},
        )
        self.assertNotIn(self.b_completed.id, returned_ids)

    # ── Pagination ─────────────────────────────────────────────────────────
    def test_pagination_cap_clamped_to_100(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id), {"page_size": 500})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["page_size"], 100)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["count"], 3)
        self.assertEqual(data["total_pages"], 1)

    # ── Filters ────────────────────────────────────────────────────────────
    def test_status_filter(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id), {"status": "completed"})
        self.assertEqual(response.status_code, 200)
        returned_ids = {row["id"] for row in response.json()["results"]}
        self.assertEqual(returned_ids, {self.a_completed_1.id, self.a_completed_2.id})

    def test_unknown_status_ignored(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id), {"status": "bogus"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 3)

    def test_date_filter(self):
        self.client.force_authenticate(user=self.admin)
        today = timezone.localdate().isoformat()
        response = self.client.get(self._url(self.driver_a.id), {"date_from": today})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 3)

        future = timezone.localdate().replace(year=timezone.localdate().year + 1)
        response = self.client.get(
            self._url(self.driver_a.id), {"date_from": future.isoformat()}
        )
        self.assertEqual(response.json()["count"], 0)

    def test_malformed_date_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            self._url(self.driver_a.id), {"date_from": "not-a-date"}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.get(
            self._url(self.driver_a.id), {"date_to": "13/13/2020"}
        )
        self.assertEqual(response.status_code, 400)

    # ── Summary (Decimal-safe statistics) ──────────────────────────────────
    def test_summary_correctness(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id))
        summary = response.json()["summary"]
        self.assertEqual(summary["total_rides"], 3)
        self.assertEqual(summary["completed_rides"], 2)
        self.assertEqual(summary["cancelled_rides"], 1)
        self.assertEqual(summary["total_earnings_mru"], "500.00")
        self.assertEqual(summary["average_earning_mru"], "250.00")

    def test_summary_ignores_list_filters(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_a.id), {"status": "cancelled"})
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["summary"]["total_rides"], 3)
        self.assertEqual(data["summary"]["completed_rides"], 2)

    def test_summary_null_when_no_completed_rides(self):
        empty_user, empty_profile = _make_driver(
            "drv-empty@example.com",
            "+22233200099",
            "2223000099",
            "930099",
            "30000000-0000-4000-8000-000000000099",
        )
        Ride.objects.create(
            rider=self.rider,
            driver=empty_user,
            pickup="P",
            destination="Q",
            fare=Decimal("12.00"),
            status="cancelled",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(empty_profile.id))
        summary = response.json()["summary"]
        self.assertEqual(summary["completed_rides"], 0)
        self.assertIsNone(summary["total_earnings_mru"])
        self.assertIsNone(summary["average_earning_mru"])

    # ── Regression: shared mobile contracts unchanged ────────────────────────
    def test_driver_earnings_summary_contract_unchanged(self):
        self.client.force_authenticate(user=self.driver_a_user)
        response = self.client.get("/rides/driver/earnings/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "today_earnings",
            "week_earnings",
            "month_earnings",
            "year_earnings",
            "total_earnings",
            "withdrawable_balance",
            "completed_rides",
            "today_completed_rides",
            "earnings_date",
            "charts",
        ):
            self.assertIn(key, data)
        # self-earnings endpoint keeps its float contract (not strings).
        self.assertIsInstance(data["total_earnings"], float)

    def test_serialize_driver_contract_unchanged(self):
        self.client.force_authenticate(user=self.driver_a_user)
        response = self.client.get("/drivers/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("status", response.json())
