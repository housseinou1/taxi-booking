from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from features.airports import ensure_default_airports
from features.models import AirportPickup, LostItem

User = get_user_model()


class ServiceRoutesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="services.test@yala.mr",
            password="TestPass123!",
            user_type="rider",
        )
        ensure_default_airports()

    def test_public_airport_list(self):
        response = self.client.get("/rides/airports/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 2)

    def test_book_airport_pickup(self):
        self.client.force_authenticate(self.user)
        list_response = self.client.get("/rides/airports/")
        airport_id = list_response.data[0]["id"]

        response = self.client.post(
            "/rides/airports/book/",
            {
                "airport_id": airport_id,
                "service_type": "pickup",
                "flight_number": "AT500",
                "arrival_time": timezone.now().replace(microsecond=0).isoformat(),
                "destination": "Tevragh Zeina",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AirportPickup.objects.count(), 1)

    def test_report_lost_item_without_ride(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/rides/lost-found/report/",
            {
                "description": "Black phone left in back seat",
                "category": "phone",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["reference"].startswith("LF-"))
        self.assertEqual(LostItem.objects.count(), 1)

    def test_my_lost_items(self):
        self.client.force_authenticate(self.user)
        self.client.post(
            "/rides/lost-found/report/",
            {"description": "Wallet", "category": "wallet"},
            format="json",
        )
        response = self.client.get("/rides/lost-found/my-items/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
