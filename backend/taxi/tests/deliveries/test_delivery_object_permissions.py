"""IDOR / object-level permission regression tests for delivery mutations."""

from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from cities.models import City, Region
from legal.constants import COURIER_TERMS_VERSION, CUSTOMER_DELIVERY_TERMS_VERSION, CUSTOMER_PRIVACY_VERSION
from payments.models import DriverPayoutMethod
from taxi.drivers.models import DriverDocument, DriverProfile

from deliveries.models import Delivery, DriverDeliverySettings


def _approve_customer(user):
    user.delivery_terms_accepted = True
    user.delivery_terms_accepted_at = timezone.now()
    user.delivery_terms_version = CUSTOMER_DELIVERY_TERMS_VERSION
    user.privacy_policy_accepted = True
    user.privacy_policy_accepted_at = timezone.now()
    user.privacy_policy_version = CUSTOMER_PRIVACY_VERSION
    user.save(
        update_fields=[
            "delivery_terms_accepted",
            "delivery_terms_accepted_at",
            "delivery_terms_version",
            "privacy_policy_accepted",
            "privacy_policy_accepted_at",
            "privacy_policy_version",
        ]
    )


def _make_courier(email, phone, national_id, city, plate):
    user = User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Courier",
        last_name="Test",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        national_id_number=national_id,
        user_type="driver",
        city=city,
    )
    profile = DriverProfile.objects.create(
        user=user,
        status="approved",
        vehicle_make="Yala",
        vehicle_model="Moto",
        vehicle_color="Green",
        plate_number=plate,
        vehicle_plate=plate,
        terms_accepted=True,
        terms_accepted_at=timezone.now(),
        terms_version=COURIER_TERMS_VERSION,
        signature_image="legal/courier_signatures/test.png",
        signed_full_name="Courier Test",
        signed_ip_address="127.0.0.1",
        signed_device_info="test client",
        legal_declaration_accepted=True,
        terms_scrolled_to_bottom=True,
    )
    DriverDeliverySettings.objects.create(
        driver=user,
        delivery_mode_enabled=True,
        delivery_vehicle_type="motorcycle",
    )
    DriverPayoutMethod.objects.create(
        driver=user,
        payout_type="bank_account",
        account_holder_name="Courier Test",
        bank_name="Yala Bank",
        account_reference=f"DEL-{plate}",
    )
    expires_at = timezone.now().date() + timedelta(days=365)
    for document_type in ("national_id", "license", "carte_grise", "insurance"):
        DriverDocument.objects.create(
            driver=profile,
            document_type=document_type,
            file=SimpleUploadedFile(f"{document_type}.jpg", b"file"),
            status="approved",
            expires_at=expires_at,
        )
    return user


class DeliveryObjectPermissionTests(APITestCase):
    def setUp(self):
        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.0735, "longitude": -15.9582},
        )
        self.customer = User.objects.create_user(
            email="idor-delivery-customer@example.com",
            password="StrongPass123",
            first_name="Cust",
            last_name="One",
            phone_number="+22233110001",
            phone_verified_at=timezone.now(),
            national_id_number="2211000001",
            rider_status="approved",
        )
        _approve_customer(self.customer)
        self.other_customer = User.objects.create_user(
            email="idor-delivery-other@example.com",
            password="StrongPass123",
            first_name="Cust",
            last_name="Two",
            phone_number="+22233110002",
            phone_verified_at=timezone.now(),
            national_id_number="2211000002",
            rider_status="approved",
        )
        _approve_customer(self.other_customer)
        self.courier = _make_courier(
            "idor-courier@example.com",
            "+22233110003",
            "2211000003",
            self.city,
            "ID-1001",
        )
        self.other_courier = _make_courier(
            "idor-other-courier@example.com",
            "+22233110004",
            "2211000004",
            self.city,
            "ID-1002",
        )

    def _delivery(self, **kwargs):
        defaults = {
            "customer": self.customer,
            "pickup": "Pickup A",
            "destination": "Dropoff B",
            "recipient_name": "Recipient",
            "recipient_phone": "22334455",
            "recipient_code_hash": "unused",
            "status": "requested",
            "package_type": "small",
            "service_city": "Nouakchott",
        }
        defaults.update(kwargs)
        return Delivery.objects.create(**defaults)

    def test_stranger_cannot_view_delivery_detail(self):
        delivery = self._delivery(driver=self.courier, status="accepted")
        self.client.force_authenticate(self.other_customer)
        response = self.client.get(f"/deliveries/{delivery.id}/")
        self.assertEqual(response.status_code, 403)

    def test_stranger_cannot_cancel_delivery(self):
        delivery = self._delivery(driver=self.courier, status="accepted")
        self.client.force_authenticate(self.other_customer)
        response = self.client.post(f"/deliveries/{delivery.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, "accepted")

    def test_other_courier_cannot_expire_exclusive_offer(self):
        delivery = self._delivery(
            offered_driver=self.courier,
            offer_sent_at=timezone.now() - timedelta(minutes=10),
        )
        self.client.force_authenticate(self.other_courier)
        response = self.client.post(
            f"/deliveries/{delivery.id}/offer-timeout/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        delivery.refresh_from_db()
        self.assertEqual(delivery.offered_driver_id, self.courier.id)

    def test_other_courier_cannot_accept_exclusive_offer(self):
        delivery = self._delivery(offered_driver=self.courier, offer_sent_at=timezone.now())
        self.client.force_authenticate(self.other_courier)
        response = self.client.post(f"/deliveries/{delivery.id}/accept/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        delivery.refresh_from_db()
        self.assertIsNone(delivery.driver_id)
        self.assertEqual(delivery.status, "requested")

    def test_other_courier_cannot_decline_exclusive_offer(self):
        delivery = self._delivery(offered_driver=self.courier, offer_sent_at=timezone.now())
        self.client.force_authenticate(self.other_courier)
        response = self.client.post(f"/deliveries/{delivery.id}/decline/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        delivery.refresh_from_db()
        self.assertEqual(delivery.offered_driver_id, self.courier.id)

    def test_other_courier_cannot_mutate_assigned_delivery(self):
        delivery = self._delivery(driver=self.courier, status="accepted")
        self.client.force_authenticate(self.other_courier)
        response = self.client.post(
            f"/deliveries/{delivery.id}/arrive-pickup/",
            {},
            format="json",
        )
        self.assertIn(response.status_code, (403, 404))
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, "accepted")
        self.assertEqual(delivery.driver_id, self.courier.id)
