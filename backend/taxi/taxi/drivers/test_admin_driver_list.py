from decimal import Decimal

from authapp.models import User
from rest_framework.test import APITestCase

from taxi.drivers.models import DriverProfile

LIST_URL = "/drivers/list/"
ME_URL = "/drivers/me/"


class AdminDriverListFieldsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="drivers-admin@test.local",
            password="Test1234!",
            is_staff=True,
        )
        self.driver_user = User.objects.create_user(
            email="rated-driver@test.local",
            password="Test1234!",
            user_type="driver",
        )
        self.profile = DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            is_available=False,
            plate_number="TEST-010",
            vehicle_plate="TEST-010",
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            vehicle_color="White",
            total_rides_completed=42,
            average_rating=Decimal("4.75"),
        )

    def test_admin_list_includes_additive_fields(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertTrue(rows)

        row = next(r for r in rows if r["id"] == self.profile.id)
        self.assertIn("total_rides_completed", row)
        self.assertIn("average_rating", row)
        self.assertEqual(row["total_rides_completed"], self.profile.total_rides_completed)
        self.assertEqual(row["average_rating"], str(self.profile.average_rating))

    def test_driver_me_does_not_include_additive_fields(self):
        self.client.force_authenticate(user=self.driver_user)

        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertNotIn("total_rides_completed", payload)
        self.assertNotIn("average_rating", payload)

    def test_admin_list_average_rating_serialized_as_string(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        row = next(r for r in response.json() if r["id"] == self.profile.id)
        self.assertIsInstance(row["average_rating"], str)
        self.assertEqual(row["average_rating"], str(self.profile.average_rating))
