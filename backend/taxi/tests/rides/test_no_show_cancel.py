"""Tests for Lyft-style rider no-show cancellation."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from taxi.rides.services.no_show_service import evaluate_no_show_eligibility

User = get_user_model()


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class LyftNoShowCancelTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(
            email="lyft-noshow-rider@example.com",
            password="Pass123!",
            first_name="Rider",
            last_name="Test",
            user_type="rider",
        )
        self.driver = User.objects.create_user(
            email="lyft-noshow-driver@example.com",
            password="Pass123!",
            first_name="Driver",
            last_name="Test",
            user_type="driver",
        )
        self.admin = User.objects.create_superuser(
            email="lyft-noshow-admin@example.com",
            password="Pass123!",
            first_name="Admin",
            last_name="Test",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            is_available=False,
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            plate_number="NS-002",
            car_type="regular",
            performance_points=100,
            acceptance_rate_points=100,
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            pickup_lat=18.0735,
            pickup_lng=-15.9582,
            status="driver_arrived",
            fare=Decimal("300.00"),
            driver_arrived_at=timezone.now() - timedelta(minutes=6),
            rider_call_attempt_count=1,
        )
        # Near pickup
        self.near_lat = 18.0735
        self.near_lng = -15.9582
        # ~1km away
        self.far_lat = 18.0825
        self.far_lng = -15.9582

    def test_eligibility_requires_max_wait_and_gps(self):
        ok, details = evaluate_no_show_eligibility(
            self.ride,
            "Rider no-show",
            driver_lat=self.near_lat,
            driver_lng=self.near_lng,
        )
        self.assertTrue(ok)
        self.assertTrue(details["gps_ok"])
        self.assertTrue(details["wait_ok"])

        self.ride.driver_arrived_at = timezone.now() - timedelta(minutes=2)
        ok, details = evaluate_no_show_eligibility(
            self.ride,
            "Rider no-show",
            driver_lat=self.near_lat,
            driver_lng=self.near_lng,
        )
        self.assertFalse(ok)
        self.assertEqual(details["block_reason"], "max_wait_not_reached")

        self.ride.driver_arrived_at = timezone.now() - timedelta(minutes=6)
        ok, details = evaluate_no_show_eligibility(
            self.ride,
            "Rider no-show",
            driver_lat=self.far_lat,
            driver_lng=self.far_lng,
        )
        self.assertFalse(ok)
        self.assertEqual(details["block_reason"], "too_far_from_pickup")

        ok, details = evaluate_no_show_eligibility(self.ride, "Rider no-show")
        self.assertFalse(ok)
        self.assertEqual(details["block_reason"], "gps_required")

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    def test_driver_rider_no_show_marks_status_and_credits_driver(
        self, _notify, _broadcast, _payment
    ):
        profile = DriverProfile.objects.get(user=self.driver)
        before_points = profile.performance_points
        before_acceptance = profile.acceptance_rate_points
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {
                "reason": "Rider no-show",
                "lat": self.near_lat,
                "lng": self.near_lng,
                "device_id": "qa-device-1",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data.get("penalty_waived"))
        self.assertTrue(response.data.get("is_rider_no_show"))
        self.assertEqual(Decimal(str(response.data.get("no_show_fee"))), Decimal("75"))
        self.assertEqual(
            Decimal(str(response.data.get("no_show_driver_compensation"))),
            Decimal("75"),
        )
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.status, "rider_no_show")
        self.assertTrue(self.ride.is_rider_no_show)
        self.assertIsNotNone(self.ride.no_show_at)
        self.assertIsNotNone(response.data.get("no_show_at"))
        self.assertEqual(self.ride.cancelled_by, "driver")
        self.assertEqual(self.ride.cancellation_reason, "Rider no-show")
        self.assertEqual(self.ride.no_show_evidence.get("device_id"), "qa-device-1")
        profile.refresh_from_db()
        self.assertEqual(profile.performance_points, before_points)
        self.assertEqual(profile.acceptance_rate_points, before_acceptance)

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    def test_no_show_rejected_when_too_far(self, _notify, _broadcast, _payment):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {
                "reason": "Rider no-show",
                "lat": self.far_lat,
                "lng": self.far_lng,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("block_reason"), "too_far_from_pickup")
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.status, "driver_arrived")

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.drivers.services.ride_performance_service.apply_driver_cancellation_penalty")
    def test_driver_side_cancel_still_penalizes(
        self, mock_penalty, _notify, _broadcast, _payment
    ):
        mock_penalty.return_value = {"performance_points": 97}
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Vehicle issue"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data.get("penalty_waived"))
        self.assertEqual(str(response.data.get("cancellation_fee")), "150.00")
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.status, "cancelled")
        self.assertFalse(self.ride.is_rider_no_show)
        mock_penalty.assert_called_once()

    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_driver_arrived")
    def test_arrived_rejects_far_gps(self, _notify, _broadcast):
        self.ride.status = "driver_arriving"
        self.ride.driver_arrived_at = None
        self.ride.save(update_fields=["status", "driver_arrived_at"])
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/arrived/{self.ride.id}/",
            {"lat": self.far_lat, "lng": self.far_lng},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.status, "driver_arriving")

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    def test_admin_can_cancel_driver_arrived(self, _notify, _broadcast, _payment):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Support cleanup — rider unreachable"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("cancelled_by"), "admin")
        self.assertEqual(str(response.data.get("cancellation_fee")), "0.00")

    def test_call_attempt_endpoint(self):
        self.ride.rider_call_attempt_count = 0
        self.ride.rider_call_attempts = []
        self.ride.save(update_fields=["rider_call_attempt_count", "rider_call_attempts"])
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(f"/rides/call-attempt/{self.ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("call_attempts"), 1)
