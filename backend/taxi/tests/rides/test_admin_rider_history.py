"""Tests for the admin rider ride-history + statistics endpoint.

Covers authorization, strict rider data isolation, pagination caps,
status/date filtering, malformed-date handling, and Decimal-safe summary stats.
"""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride


def _make_rider(email, phone, national_id):
    return User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Rider",
        last_name="Test",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        national_id_number=national_id,
        rider_status="approved",
    )


class AdminRiderRideHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="admin@test.local",
            password="StrongPass123",
            is_staff=True,
        )
        self.rider = _make_rider("hist-rider@example.com", "+22233100001", "2222000001")
        self.other_rider = _make_rider(
            "hist-other@example.com", "+22233100002", "2222000002"
        )

        self.driver_user = User.objects.create_user(
            email="hist-driver@example.com",
            password="StrongPass123",
            first_name="Dolo",
            last_name="Drive",
            phone_number="+22233100003",
            phone_verified_at=timezone.now(),
            national_id_number="2222000003",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            driver_code="920001",
            qr_code_uuid="20000000-0000-4000-8000-000000000001",
            is_available=True,
            registration_status="approved",
        )

        # Seed rides for self.rider: 2 completed (120.50 + 79.50 = 200.00),
        # 1 cancelled, 1 requested (non-completed, non-cancelled).
        self.completed_1 = Ride.objects.create(
            rider=self.rider,
            driver=self.driver_user,
            pickup="A",
            destination="B",
            fare=Decimal("120.50"),
            status="completed",
            rating=5,
            review="Great",
        )
        self.completed_2 = Ride.objects.create(
            rider=self.rider,
            driver=self.driver_user,
            pickup="C",
            destination="D",
            fare=Decimal("79.50"),
            status="completed",
        )
        self.cancelled_1 = Ride.objects.create(
            rider=self.rider,
            pickup="E",
            destination="F",
            fare=Decimal("50.00"),
            status="cancelled",
        )
        self.requested_1 = Ride.objects.create(
            rider=self.rider,
            pickup="G",
            destination="H",
            fare=Decimal("10.00"),
            status="requested",
        )

        # A ride belonging to a DIFFERENT rider — must never leak.
        self.other_ride = Ride.objects.create(
            rider=self.other_rider,
            pickup="X",
            destination="Y",
            fare=Decimal("999.00"),
            status="completed",
        )

    def _url(self, rider_id):
        return f"/rides/admin/rider/{rider_id}/history/"

    # ── Authorization ──────────────────────────────────────────────────────
    def test_anonymous_denied(self):
        response = self.client.get(self._url(self.rider.id))
        self.assertIn(response.status_code, (401, 403))

    def test_non_staff_rider_denied(self):
        self.client.force_authenticate(user=self.rider)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 403)

    def test_admin_allowed(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 200)

    # ── Data isolation ─────────────────────────────────────────────────────
    def test_only_target_rider_rides_returned(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        returned_ids = {row["id"] for row in data["results"]}
        self.assertNotIn(self.other_ride.id, returned_ids)
        self.assertEqual(
            returned_ids,
            {
                self.completed_1.id,
                self.completed_2.id,
                self.cancelled_1.id,
                self.requested_1.id,
            },
        )

    def test_staff_target_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.admin.id))
        self.assertEqual(response.status_code, 404)

    def test_driver_target_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_user.id))
        self.assertEqual(response.status_code, 404)

    # ── Pagination ─────────────────────────────────────────────────────────
    def test_pagination_cap_clamped_to_100(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"page_size": 500})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["page_size"], 100)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["count"], 4)
        self.assertEqual(data["total_pages"], 1)

    # ── Filters ────────────────────────────────────────────────────────────
    def test_status_filter(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"status": "completed"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        returned_ids = {row["id"] for row in data["results"]}
        self.assertEqual(returned_ids, {self.completed_1.id, self.completed_2.id})

    def test_unknown_status_ignored(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"status": "bogus"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 4)

    def test_date_filter(self):
        self.client.force_authenticate(user=self.admin)
        today = timezone.localdate().isoformat()
        response = self.client.get(self._url(self.rider.id), {"date_from": today})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 4)

        # A future date_from excludes everything created today.
        future = timezone.localdate().replace(year=timezone.localdate().year + 1)
        response = self.client.get(
            self._url(self.rider.id), {"date_from": future.isoformat()}
        )
        self.assertEqual(response.json()["count"], 0)

    def test_malformed_date_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            self._url(self.rider.id), {"date_from": "not-a-date"}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.get(self._url(self.rider.id), {"date_to": "13/13/2020"})
        self.assertEqual(response.status_code, 400)

    # ── Summary (Decimal-safe statistics) ──────────────────────────────────
    def test_summary_correctness(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        summary = response.json()["summary"]
        self.assertEqual(summary["total_rides"], 4)
        self.assertEqual(summary["completed_rides"], 2)
        self.assertEqual(summary["cancelled_rides"], 1)
        self.assertEqual(Decimal(summary["total_spend_mru"]), Decimal("200.00"))
        self.assertEqual(Decimal(summary["average_fare_mru"]), Decimal("100.00"))

    def test_summary_ignores_list_filters(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"status": "cancelled"})
        data = response.json()
        # Only the cancelled ride is listed, but the summary spans full history.
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["summary"]["total_rides"], 4)
        self.assertEqual(data["summary"]["completed_rides"], 2)

    def test_summary_null_when_no_completed_rides(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.other_rider.id))
        # other_rider has a single completed ride; give them a no-completed rider.
        empty_rider = _make_rider("empty@example.com", "+22233100099", "2222000099")
        Ride.objects.create(
            rider=empty_rider,
            pickup="P",
            destination="Q",
            fare=Decimal("12.00"),
            status="cancelled",
        )
        response = self.client.get(self._url(empty_rider.id))
        summary = response.json()["summary"]
        self.assertEqual(summary["completed_rides"], 0)
        self.assertIsNone(summary["total_spend_mru"])
        self.assertIsNone(summary["average_fare_mru"])
