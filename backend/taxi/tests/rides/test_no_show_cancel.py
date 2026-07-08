"""Tests for driver no-show cancel waiver and call-attempt logging."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from taxi.rides.services.no_show_service import no_show_waiver_eligible

User = get_user_model()


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class NoShowCancelTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(
            email="noshow-rider@example.com",
            password="Pass123!",
            first_name="Rider",
            last_name="Test",
            user_type="rider",
        )
        self.driver = User.objects.create_user(
            email="noshow-driver@example.com",
            password="Pass123!",
            first_name="Driver",
            last_name="Test",
            user_type="driver",
        )
        self.admin = User.objects.create_superuser(
            email="noshow-admin@example.com",
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
            plate_number="NS-001",
            car_type="regular",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            status="driver_arrived",
            fare=Decimal("300.00"),
            driver_arrived_at=timezone.now() - timedelta(minutes=5),
            rider_call_attempt_count=2,
            rider_call_attempts=[
                {"at": timezone.now().isoformat(), "by_user_id": self.driver.id},
                {"at": timezone.now().isoformat(), "by_user_id": self.driver.id},
            ],
        )

    def test_waiver_helper_requires_wait_and_calls(self):
        ok, details = no_show_waiver_eligible(self.ride, "Rider no-show")
        self.assertTrue(ok)
        self.assertTrue(details["eligible"])

        self.ride.rider_call_attempt_count = 1
        ok, details = no_show_waiver_eligible(self.ride, "Rider no-show")
        self.assertFalse(ok)
        self.assertFalse(details["calls_ok"])

        self.ride.rider_call_attempt_count = 2
        self.ride.driver_arrived_at = timezone.now() - timedelta(seconds=30)
        ok, details = no_show_waiver_eligible(self.ride, "Rider no-show")
        self.assertFalse(ok)
        self.assertFalse(details["wait_ok"])

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    def test_driver_no_show_waives_fee_and_points(self, _notify, _broadcast, _payment):
        profile = DriverProfile.objects.get(user=self.driver)
        before_points = profile.performance_points or 100
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Rider no-show"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("penalty_waived"))
        self.assertEqual(str(response.data.get("cancellation_fee")), "0")
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.status, "cancelled")
        self.assertEqual(self.ride.cancelled_by, "driver")
        profile.refresh_from_db()
        self.assertEqual(profile.performance_points or 100, before_points)

    @patch("taxi.rides.views.cancel_ride_payment")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.drivers.services.ride_performance_service.apply_driver_cancellation_penalty")
    def test_driver_cancel_without_gate_keeps_penalty(
        self, mock_penalty, _notify, _broadcast, _payment
    ):
        mock_penalty.return_value = {"performance_points": 97}
        self.ride.rider_call_attempt_count = 0
        self.ride.save(update_fields=["rider_call_attempt_count"])
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Vehicle issue"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data.get("penalty_waived"))
        self.assertEqual(str(response.data.get("cancellation_fee")), "150")
        mock_penalty.assert_called_once()

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
        self.assertEqual(str(response.data.get("cancellation_fee")), "0")

    def test_call_attempt_endpoint(self):
        self.ride.rider_call_attempt_count = 0
        self.ride.rider_call_attempts = []
        self.ride.save(update_fields=["rider_call_attempt_count", "rider_call_attempts"])
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(f"/rides/call-attempt/{self.ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("call_attempts"), 1)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.rider_call_attempt_count, 1)

        # Rider cannot log calls
        self.client.force_authenticate(user=self.rider)
        forbidden = self.client.post(f"/rides/call-attempt/{self.ride.id}/", {}, format="json")
        self.assertEqual(forbidden.status_code, 403)
