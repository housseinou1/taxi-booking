from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride


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
        DriverProfile.objects.create(user=self.driver, status="approved")

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
