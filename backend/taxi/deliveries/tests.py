from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile

from .models import Delivery


class DeliveryFlowTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="delivery-rider@example.com",
            password="StrongPass123",
            first_name="Delivery",
            last_name="Rider",
            phone_number="+22222445511",
            phone_verified_at=timezone.now(),
            national_id_number="8765432190",
            rider_status="approved",
        )
        self.driver = User.objects.create_user(
            email="delivery-driver@example.com",
            password="StrongPass123",
            first_name="Delivery",
            last_name="Driver",
            phone_number="+22222556611",
            phone_verified_at=timezone.now(),
            national_id_number="7654321980",
            user_type="driver",
        )
        DriverProfile.objects.create(user=self.driver, status="approved")

    def test_complete_delivery_flow(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            "/deliveries/request/",
            {
                "pickup": "Tevragh Zeina",
                "destination": "Nouakchott Airport",
                "recipient_name": "Moussa Ahmed",
                "recipient_phone": "22334455",
                "package_type": "document",
                "package_description": "Signed documents",
                "distance_km": "12",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        delivery_id = response.data["id"]
        recipient_code = response.data["recipient_code"]

        self.client.force_authenticate(self.driver)
        for action, expected_status in (
            ("accept", "accepted"),
            ("pickup", "picked_up"),
            ("start", "delivering"),
        ):
            response = self.client.post(f"/deliveries/{delivery_id}/{action}/", {}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["status"], expected_status)

        wrong = self.client.post(
            f"/deliveries/{delivery_id}/confirm/",
            {"recipient_code": "0000"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)

        response = self.client.post(
            f"/deliveries/{delivery_id}/confirm/",
            {"recipient_code": recipient_code},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "delivered")
        self.assertIsNotNone(Delivery.objects.get(id=delivery_id).delivered_at)

    def test_unapproved_driver_cannot_accept_delivery(self):
        pending = User.objects.create_user(
            email="pending-delivery-driver@example.com",
            password="StrongPass123",
            first_name="Pending",
            last_name="Driver",
            phone_number="+22222667711",
            phone_verified_at=timezone.now(),
            national_id_number="6543219870",
            user_type="driver",
        )
        DriverProfile.objects.create(user=pending, status="pending")
        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Moussa Ahmed",
            recipient_phone="+22222334455",
            recipient_code_hash="unused",
        )
        self.client.force_authenticate(pending)
        response = self.client.post(f"/deliveries/{delivery.id}/accept/", {}, format="json")
        self.assertEqual(response.status_code, 403)
