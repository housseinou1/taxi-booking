from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.ride_performance_service import (
    ACCEPTANCE_RATE_PENALTY,
    DAILY_DRIVER_CANCEL_RISK_THRESHOLD,
    PERFORMANCE_PENALTY_POINTS,
    RISK_WARNING_MESSAGE,
    apply_decline_penalty,
    apply_driver_cancellation_penalty,
    apply_missed_offer_penalty,
)
from taxi.rides.models import Ride
from taxi.rides.services.ride_assignment_service import (
    handle_driver_decline,
    handle_missed_offer,
    offer_ride_to_next_driver,
)


class RidePerformanceServiceTests(APITestCase):
    def setUp(self):
        self.driver = User.objects.create_user(
            email="perf-driver@example.com",
            password="StrongPass123",
            user_type="driver",
        )
        self.profile = DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="880001",
            qr_code_uuid="00000000-0000-4000-8000-000000008801",
            is_available=True,
            performance_points=100,
            acceptance_rate_points=100,
        )
        self.rider = User.objects.create_user(
            email="perf-rider@example.com",
            password="StrongPass123",
            first_name="Perf",
            last_name="Rider",
        )

    def test_missed_offer_penalty_reduces_points_and_counts(self):
        apply_missed_offer_penalty(self.profile)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_missed, 1)
        self.assertEqual(
            self.profile.performance_points, 100 - PERFORMANCE_PENALTY_POINTS
        )
        self.assertEqual(
            self.profile.acceptance_rate_points, 100 - ACCEPTANCE_RATE_PENALTY
        )

    def test_decline_penalty_reduces_points_and_counts(self):
        apply_decline_penalty(self.profile)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_declined, 1)
        self.assertEqual(
            self.profile.performance_points, 100 - PERFORMANCE_PENALTY_POINTS
        )

    def test_driver_cancellation_penalty_tracks_daily_risk(self):
        for _ in range(DAILY_DRIVER_CANCEL_RISK_THRESHOLD):
            apply_driver_cancellation_penalty(self.profile)
            self.profile.refresh_from_db()

        self.assertEqual(
            self.profile.cancellations_today_count,
            DAILY_DRIVER_CANCEL_RISK_THRESHOLD,
        )
        self.assertTrue(self.profile.account_risk_flag)
        self.assertTrue(self.profile.account_under_review)
        self.assertEqual(self.profile.account_risk_reason, RISK_WARNING_MESSAGE)


class RideAssignmentPerformanceTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="assign-rider@example.com",
            password="StrongPass123",
        )
        self.driver_a = User.objects.create_user(
            email="assign-driver-a@example.com",
            password="StrongPass123",
            user_type="driver",
        )
        self.driver_b = User.objects.create_user(
            email="assign-driver-b@example.com",
            password="StrongPass123",
            user_type="driver",
        )
        self.profile_a = DriverProfile.objects.create(
            user=self.driver_a,
            status="approved",
            driver_code="880101",
            qr_code_uuid="00000000-0000-4000-8000-000000008101",
            is_available=True,
        )
        self.profile_b = DriverProfile.objects.create(
            user=self.driver_b,
            status="approved",
            driver_code="880102",
            qr_code_uuid="00000000-0000-4000-8000-000000008102",
            is_available=True,
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Airport",
            destination="Centre",
            status="requested",
        )

    @patch("taxi.rides.services.ride_assignment_service.start_ride_request_timeout")
    @patch("taxi.rides.services.ride_assignment_service.schedule_ride_request_broadcast")
    @patch(
        "taxi.rides.services.driver_dispatch_service.driver_documents_ok",
        return_value=True,
    )
    def test_offer_assigns_single_driver(self, _docs, _broadcast, _timeout):
        offered = offer_ride_to_next_driver(self.ride, require_documents=False)

        self.assertTrue(offered)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.offered_driver_id, self.driver_a.id)
        self.profile_a.refresh_from_db()
        self.assertEqual(self.profile_a.total_rides_received, 1)

    @patch("taxi.rides.services.ride_assignment_service.offer_ride_to_next_driver")
    def test_missed_offer_penalizes_and_reassigns(self, reoffer):
        self.ride.offered_driver = self.driver_a
        self.ride.offer_sent_at = timezone.now()
        self.ride.save(update_fields=["offered_driver", "offer_sent_at"])
        reoffer.return_value = True

        handle_missed_offer(self.ride.id, self.driver_a.id)

        self.profile_a.refresh_from_db()
        self.assertEqual(self.profile_a.total_rides_missed, 1)
        reoffer.assert_called_once()

    @patch("taxi.rides.services.ride_assignment_service.offer_ride_to_next_driver")
    def test_decline_penalizes_and_reassigns(self, reoffer):
        self.ride.offered_driver = self.driver_a
        self.ride.offer_sent_at = timezone.now()
        self.ride.save(update_fields=["offered_driver", "offer_sent_at"])
        reoffer.return_value = True

        reassigned = handle_driver_decline(self.ride, self.driver_a)

        self.assertTrue(reassigned)
        self.profile_a.refresh_from_db()
        self.assertEqual(self.profile_a.total_rides_declined, 1)
        self.ride.refresh_from_db()
        self.assertIn(self.driver_a.id, self.ride.declined_driver_ids)


class RidePerformanceApiTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="api-rider@example.com",
            password="StrongPass123",
        )
        self.driver = User.objects.create_user(
            email="api-driver@example.com",
            password="StrongPass123",
            user_type="driver",
            phone_verified_at=timezone.now(),
        )
        self.profile = DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="880201",
            qr_code_uuid="00000000-0000-4000-8000-000000008201",
            is_available=True,
            performance_points=100,
            acceptance_rate_points=100,
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Airport",
            destination="Centre",
            status="requested",
            offered_driver=self.driver,
            offer_sent_at=timezone.now(),
        )

    @patch("taxi.rides.views.broadcast_ride_update")
    def test_decline_endpoint_applies_penalty(self, _broadcast):
        self.client.force_authenticate(self.driver)

        response = self.client.post(f"/rides/decline/{self.ride.id}/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_declined, 1)
        self.assertEqual(
            self.profile.performance_points, 100 - PERFORMANCE_PENALTY_POINTS
        )

    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.cancel_ride_payment")
    def test_rider_cancel_does_not_apply_driver_penalty(
        self, _payment, _broadcast, _notify
    ):
        self.ride.driver = self.driver
        self.ride.status = "driver_arriving"
        self.ride.save(update_fields=["driver", "status"])

        self.client.force_authenticate(self.rider)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Changed plans"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 100)
        self.assertEqual(self.profile.total_rides_cancelled, 0)

    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.cancel_ride_payment")
    def test_driver_cancel_applies_penalty(self, _payment, _broadcast, _notify):
        self.ride.driver = self.driver
        self.ride.status = "driver_arrived"
        self.ride.save(update_fields=["driver", "status"])

        self.client.force_authenticate(self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Emergency", "reason_details": ""},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_cancelled, 1)
        self.assertEqual(
            self.profile.performance_points, 100 - PERFORMANCE_PENALTY_POINTS
        )
        self.assertIn("driver_performance", response.json())

    def test_driver_cancel_other_requires_details(self):
        self.ride.driver = self.driver
        self.ride.status = "driver_arrived"
        self.ride.save(update_fields=["driver", "status"])

        self.client.force_authenticate(self.driver)
        response = self.client.post(
            f"/rides/cancel/{self.ride.id}/",
            {"reason": "Other", "reason_details": "too short"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_cancelled, 0)

    def test_driver_cancel_other_stores_details(self, _payment=None, _broadcast=None, _notify=None):
        self.ride.driver = self.driver
        self.ride.status = "driver_arrived"
        self.ride.save(update_fields=["driver", "status"])

        self.client.force_authenticate(self.driver)
        with patch("taxi.rides.views.notify_ride_cancelled"), patch(
            "taxi.rides.views.broadcast_ride_update"
        ), patch("taxi.rides.views.cancel_ride_payment"):
            response = self.client.post(
                f"/rides/cancel/{self.ride.id}/",
                {
                    "reason": "Other",
                    "reason_details": "Rider asked me to cancel via phone call",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.cancellation_reason, "Other")
        self.assertEqual(
            self.ride.cancellation_reason_details,
            "Rider asked me to cancel via phone call",
        )
