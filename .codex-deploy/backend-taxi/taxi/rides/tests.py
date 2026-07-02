from unittest.mock import MagicMock, patch

from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from taxi.rides.views import broadcast_ride_request_to_available_drivers


class CompleteRideFlowTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="flow-rider@example.com",
            password="StrongPass123",
            first_name="Flow",
            last_name="Rider",
            phone_number="+22222445566",
            phone_verified_at=timezone.now(),
            national_id_number="8765432109",
            rider_status="approved",
            profile_picture="users/profile_pictures/rider.jpg",
        )
        self.driver = User.objects.create_user(
            email="flow-driver@example.com",
            password="StrongPass123",
            first_name="Flow",
            last_name="Driver",
            phone_number="+22222556677",
            phone_verified_at=timezone.now(),
            national_id_number="7654321098",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="900001",
            qr_code_uuid="00000000-0000-4000-8000-000000000001",
            is_available=True,
            driver_level="silver",
            car_type="comfort",
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            vehicle_color="White",
            plate_number="NKC-4521",
            registration_status="approved",
        )

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    def test_rider_request_through_driver_completion(self, _broadcast, _timeout):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/rides/request/",
            {
                "pickup": "Tevragh Zeina",
                "destination": "Nouakchott Airport",
                "distance_km": 12,
                "fare": "250.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        ride_id = response.data["id"]
        pickup_pin = response.data["pickup_pin"]
        self.assertEqual(len(pickup_pin), 4)

        self.client.force_authenticate(self.driver)
        for endpoint, expected_status in (
            (f"/rides/accept/{ride_id}/", "driver_arriving"),
            (f"/rides/arrived/{ride_id}/", "driver_arrived"),
        ):
            response = self.client.post(endpoint, {}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["status"], expected_status)
            self.assertEqual(response.data["pickup_pin"], "")
            self.assertEqual(response.data["driver_name"], "Flow Driver")
            self.assertEqual(response.data["driver_code"], "900001")
            self.assertEqual(response.data["driver_level"], "silver")
            self.assertTrue(response.data["driver_verified"])
            self.assertEqual(response.data["vehicle_make"], "Toyota")
            self.assertEqual(response.data["vehicle_model"], "Corolla")
            self.assertEqual(response.data["vehicle_color"], "White")
            self.assertEqual(response.data["vehicle_category"], "comfort")
            self.assertEqual(response.data["plate_number"], "NKC-4521")
            self.assertTrue(response.data["vehicle_verified"])

        self.client.force_authenticate(self.rider)
        response = self.client.get("/rides/history/")
        self.assertEqual(response.status_code, 200)
        active_ride = response.data[0]
        self.assertEqual(active_ride["id"], ride_id)
        self.assertEqual(active_ride["pickup_pin"], pickup_pin)
        self.assertEqual(active_ride["pin_code"], pickup_pin)
        self.assertEqual(active_ride["driver_name"], "Flow Driver")
        self.assertEqual(active_ride["vehicle_make"], "Toyota")

        self.client.force_authenticate(self.driver)
        response = self.client.post(
            f"/rides/start/{ride_id}/",
            {"pickup_pin": "99999"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/rides/start/{ride_id}/",
            {"pickup_pin": pickup_pin},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "in_progress")
        self.assertTrue(response.data["pickup_pin_verified"])

        response = self.client.post(f"/rides/complete/{ride_id}/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "completed")

        ride = Ride.objects.get(id=ride_id)
        self.assertEqual(ride.driver, self.driver)
        self.assertIsNotNone(ride.completed_at)

    def test_unapproved_driver_cannot_view_or_accept_requests(self):
        unapproved_driver = User.objects.create_user(
            email="pending-driver@example.com",
            password="StrongPass123",
            first_name="Pending",
            last_name="Driver",
            phone_number="+22222667788",
            phone_verified_at=timezone.now(),
            national_id_number="6543210987",
            user_type="driver",
        )
        DriverProfile.objects.create(user=unapproved_driver, status="pending")

        ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            status="requested",
        )

        self.client.force_authenticate(unapproved_driver)
        response = self.client.get("/rides/available/")
        self.assertEqual(response.status_code, 403)

        response = self.client.post(f"/rides/accept/{ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        ride.refresh_from_db()
        self.assertIsNone(ride.driver)

    @patch("taxi.rides.views.async_to_sync")
    @patch("taxi.rides.views.get_channel_layer")
    def test_new_request_is_sent_to_eligible_online_driver(
        self, get_channel_layer, async_to_sync
    ):
        channel_layer = MagicMock()
        send = MagicMock()
        get_channel_layer.return_value = channel_layer
        async_to_sync.return_value = send

        ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            distance_km=12,
            fare="250.00",
            status="requested",
        )

        notified = broadcast_ride_request_to_available_drivers(ride)

        self.assertEqual(notified, 1)
        send.assert_called_once()
        args = send.call_args.args
        self.assertEqual(args[0], f"driver_{self.driver.id}")
        self.assertEqual(args[1]["type"], "ride_request")
        self.assertEqual(args[1]["message"]["ride_id"], ride.id)

    @patch("taxi.rides.views.async_to_sync")
    @patch("taxi.rides.views.get_channel_layer")
    def test_busy_driver_does_not_receive_new_request(
        self, get_channel_layer, async_to_sync
    ):
        get_channel_layer.return_value = MagicMock()
        send = MagicMock()
        async_to_sync.return_value = send

        Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="Airport",
            destination="Centre",
            status="in_progress",
        )
        pending_ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            status="requested",
        )

        notified = broadcast_ride_request_to_available_drivers(pending_ride)

        self.assertEqual(notified, 0)
        send.assert_not_called()


class RideCancellationFlowTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="cancel-rider@example.com",
            password="StrongPass123",
            first_name="Cancel",
            last_name="Rider",
        )
        self.driver = User.objects.create_user(
            email="cancel-driver@example.com",
            password="StrongPass123",
            first_name="Cancel",
            last_name="Driver",
            user_type="driver",
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="990001",
            qr_code_uuid="00000000-0000-4000-8000-000000009901",
            is_available=False,
        )

    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.cancel_ride_payment")
    def test_rider_can_cancel_requested_ride_without_fee(self, _payment, _broadcast, _notify):
        ride = Ride.objects.create(
            rider=self.rider,
            pickup="Airport",
            destination="Centre",
            status="requested",
        )
        self.client.force_authenticate(self.rider)

        response = self.client.post(
            f"/rides/cancel/{ride.id}/",
            {"reason": "Changed my mind"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        ride.refresh_from_db()
        self.assertEqual(ride.status, "cancelled")
        self.assertEqual(ride.cancelled_by, "rider")
        self.assertEqual(ride.cancellation_reason, "Changed my mind")
        self.assertEqual(str(ride.cancellation_fee), "0.00")
        self.assertIsNotNone(ride.cancelled_at)

    @patch("taxi.rides.views.notify_ride_cancelled")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.cancel_ride_payment")
    def test_driver_cancel_returns_driver_to_waiting_mode(self, _payment, _broadcast, _notify):
        ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="Airport",
            destination="Centre",
            status="driver_arrived",
        )
        self.client.force_authenticate(self.driver)

        response = self.client.post(
            f"/rides/cancel/{ride.id}/",
            {"reason": "Emergency"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        ride.refresh_from_db()
        self.driver_profile.refresh_from_db()
        self.assertEqual(ride.cancelled_by, "driver")
        self.assertEqual(str(ride.cancellation_fee), "150.00")
        self.assertTrue(self.driver_profile.is_available)

    def test_cancellation_requires_reason_and_is_blocked_after_start(self):
        ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="Airport",
            destination="Centre",
            status="driver_arriving",
        )
        self.client.force_authenticate(self.rider)
        response = self.client.post(f"/rides/cancel/{ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Cancellation reason is required.")

        ride.status = "in_progress"
        ride.save(update_fields=["status"])
        response = self.client.post(
            f"/rides/cancel/{ride.id}/",
            {"reason": "Emergency"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
