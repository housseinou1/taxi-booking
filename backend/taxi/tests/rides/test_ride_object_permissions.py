"""IDOR / object-level permission regression tests for ride mutations."""

from django.utils import timezone
from rest_framework.test import APITestCase

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
        profile_picture="users/profile_pictures/rider.jpg",
    )


def _make_driver(email, phone, national_id, driver_code, qr_uuid):
    user = User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Driver",
        last_name="Test",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        national_id_number=national_id,
        user_type="driver",
    )
    DriverProfile.objects.create(
        user=user,
        status="approved",
        driver_code=driver_code,
        qr_code_uuid=qr_uuid,
        is_available=True,
        registration_status="approved",
    )
    return user


class RideObjectPermissionTests(APITestCase):
    def setUp(self):
        self.rider = _make_rider(
            "idor-rider@example.com", "+22233000001", "1111000001"
        )
        self.other_rider = _make_rider(
            "idor-other-rider@example.com", "+22233000002", "1111000002"
        )
        self.driver = _make_driver(
            "idor-driver@example.com",
            "+22233000003",
            "1111000003",
            "910001",
            "10000000-0000-4000-8000-000000000001",
        )
        self.other_driver = _make_driver(
            "idor-other-driver@example.com",
            "+22233000004",
            "1111000004",
            "910002",
            "10000000-0000-4000-8000-000000000002",
        )

    def _assigned_ride(self, status="driver_arriving"):
        return Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            status=status,
            fare="250.00",
            pickup_lat=18.0735,
            pickup_lng=-15.9582,
        )

    def test_stranger_cannot_view_ride_detail(self):
        ride = self._assigned_ride()
        self.client.force_authenticate(self.other_rider)
        response = self.client.get(f"/rides/{ride.id}/")
        self.assertEqual(response.status_code, 403)

    def test_stranger_cannot_cancel_assigned_ride(self):
        ride = self._assigned_ride()
        self.client.force_authenticate(self.other_rider)
        response = self.client.post(
            f"/rides/cancel/{ride.id}/",
            {"reason": "Changed plans"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        ride.refresh_from_db()
        self.assertEqual(ride.status, "driver_arriving")

    def test_unassigned_driver_cannot_cancel_ride(self):
        ride = self._assigned_ride()
        self.client.force_authenticate(self.other_driver)
        response = self.client.post(
            f"/rides/cancel/{ride.id}/",
            {"reason": "Busy"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        ride.refresh_from_db()
        self.assertEqual(ride.status, "driver_arriving")

    def test_other_driver_cannot_arrive_start_or_complete(self):
        ride = self._assigned_ride(status="driver_arrived")
        self.client.force_authenticate(self.other_driver)

        arrived = self.client.post(
            f"/rides/arrived/{ride.id}/",
            {"lat": 18.0735, "lng": -15.9582},
            format="json",
        )
        self.assertIn(arrived.status_code, (403, 404))

        start = self.client.post(f"/rides/start/{ride.id}/", {}, format="json")
        self.assertIn(start.status_code, (403, 404))

        complete = self.client.post(f"/rides/complete/{ride.id}/", {}, format="json")
        self.assertIn(complete.status_code, (403, 404))

        ride.refresh_from_db()
        self.assertEqual(ride.status, "driver_arrived")
        self.assertEqual(ride.driver_id, self.driver.id)

    def test_other_driver_cannot_accept_exclusive_offer(self):
        ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            status="requested",
            fare="250.00",
            offered_driver=self.driver,
        )
        self.client.force_authenticate(self.other_driver)
        response = self.client.post(f"/rides/accept/{ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        ride.refresh_from_db()
        self.assertIsNone(ride.driver_id)
        self.assertEqual(ride.status, "requested")

    def test_other_driver_cannot_decline_exclusive_offer(self):
        ride = Ride.objects.create(
            rider=self.rider,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            status="requested",
            fare="250.00",
            offered_driver=self.driver,
        )
        self.client.force_authenticate(self.other_driver)
        response = self.client.post(f"/rides/decline/{ride.id}/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        ride.refresh_from_db()
        self.assertEqual(ride.offered_driver_id, self.driver.id)

    def test_other_rider_cannot_rate_ride(self):
        ride = self._assigned_ride(status="completed")
        self.client.force_authenticate(self.other_rider)
        response = self.client.post(
            f"/rides/rate/{ride.id}/",
            {"rating": 5, "review": "Great"},
            format="json",
        )
        self.assertIn(response.status_code, (403, 404))
        ride.refresh_from_db()
        self.assertIsNone(ride.rating)

    def test_other_driver_cannot_rate_rider(self):
        ride = self._assigned_ride(status="completed")
        self.client.force_authenticate(self.other_driver)
        response = self.client.post(
            f"/rides/rate-rider/{ride.id}/",
            {"rating": 5, "review": "Fine"},
            format="json",
        )
        self.assertIn(response.status_code, (403, 404))
        ride.refresh_from_db()
        self.assertIsNone(ride.driver_rating)
