"""Regression tests: UAT-D-010 delivery request contract + courier location updates.

UAT-D-010 (production smoke "Request delivery — HTTP 400") was the smoke harness omitting the
required ``payment_method``; the backend validation is correct and must stay strict.

Courier location: ``POST /deliveries/courier/location/`` read ``DriverProfile.updated_at``
(a field that does not exist), so every update from a courier with a stored position returned
HTTP 500, and non-numeric input crashed ``float()``. It now uses the same validation as the
ride-driver location endpoint.

Reuses the fully onboarded customer/courier fixture of ``DeliveryFlowTests`` (setUp only, so
that suite's tests are not re-run here).
"""
from unittest.mock import patch

from django.core.cache import cache
from rest_framework.test import APITestCase

from deliveries.models import Delivery
from deliveries.tests import DeliveryFlowTests

LOCATION = "/deliveries/courier/location/"
SMOKE_PAYLOAD = {  # scripts/platform-rc1-smoke.py TEST2-DELIVERY, verbatim
    "pickup": "Tevragh Zeina Delivery RC1",
    "destination": "Nouakchott Airport Delivery RC1",
    "recipient_name": "Smoke Recipient",
    "recipient_phone": "22334455",
    "package_type": "document",
    "courier_type_required": "motorcycle",
    "package_description": "RC1 platform smoke package",
    "distance_km": "10",
    "delivery_terms_accepted": True,
    "privacy_policy_accepted": True,
}


class FixtureMixin:
    setUp = DeliveryFlowTests.setUp

    def tearDown(self):
        cache.clear()  # location plausibility + rate-limit state lives in the cache


class DeliveryRequestContractTests(FixtureMixin, APITestCase):
    def request_delivery(self, payload):
        self.client.force_authenticate(self.customer)
        with patch("deliveries.views.require_integrity", return_value=True):
            return self.client.post("/deliveries/request/", payload, format="json")

    def test_smoke_payload_without_payment_method_is_rejected_with_a_field_error(self):
        response = self.request_delivery(dict(SMOKE_PAYLOAD))
        self.assertEqual(response.status_code, 400)
        self.assertIn("payment_method", response.data)
        self.assertFalse(Delivery.objects.filter(customer=self.customer).exists())

    def test_cash_is_not_accepted(self):
        response = self.request_delivery({**SMOKE_PAYLOAD, "payment_method": "cash"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("payment_method", response.data)

    def test_smoke_payload_with_a_digital_method_succeeds(self):
        for method in ("bankily",):
            response = self.request_delivery({**SMOKE_PAYLOAD, "payment_method": method})
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["payment_method"], method)
            self.assertTrue(response.data.get("dropoff_pin") or response.data.get("recipient_code"))


class CourierLocationTests(FixtureMixin, APITestCase):
    def active_delivery(self, status="in_transit"):
        return Delivery.objects.create(
            customer=self.customer, driver=self.driver, pickup="P", destination="D", recipient_name="R",
            recipient_phone="+22200000000", recipient_code_hash="h", status=status,
        )

    def post(self, body):
        self.client.force_authenticate(self.driver)
        return self.client.post(LOCATION, body, format="json")

    def stored(self):
        self.driver_profile.refresh_from_db()
        return self.driver_profile.current_lat, self.driver_profile.current_lng

    def test_update_accepted_during_an_active_delivery(self):
        self.active_delivery()
        self.assertIsNotNone(self.driver_profile.current_lat)  # a stored position existed (old 500 path)
        with patch("deliveries.broadcast.broadcast_courier_location") as broadcast:
            response = self.post({"lat": 18.08, "lng": -15.96})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.stored(), (18.08, -15.96))
        broadcast.assert_called_once()

    def test_successive_plausible_updates_are_accepted(self):
        self.active_delivery("picked_up")
        self.assertEqual(self.post({"lat": 18.0800, "lng": -15.9600}).status_code, 200)
        cache.set(f"driver-location:{self.driver.id}", {"lat": 18.0800, "lng": -15.9600, "time": 0})
        self.assertEqual(self.post({"lat": "18.0805", "lng": "-15.9605"}).status_code, 200)
        self.assertEqual(self.stored(), (18.0805, -15.9605))

    def test_invalid_coordinates_are_400_not_500_and_not_stored(self):
        self.active_delivery()
        before = self.stored()
        for body in ({"lat": "abc", "lng": -15.96}, {"lat": "nan", "lng": "nan"}, {"lat": 123.0, "lng": -15.96},
                     {"lat": 18.08}):
            with self.subTest(body=body):
                self.assertEqual(self.post(body).status_code, 400)
        self.assertEqual(self.stored(), before)

    def test_implausible_jump_is_rejected_and_fraud_flagged(self):
        from security.models import FraudFlag

        self.active_delivery()
        self.assertEqual(self.post({"lat": 18.08, "lng": -15.96}).status_code, 200)
        before = FraudFlag.objects.filter(user=self.driver).count()
        response = self.post({"lat": 20.93, "lng": -17.03})  # ~350 km a moment later
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.stored(), (18.08, -15.96))
        self.assertEqual(FraudFlag.objects.filter(user=self.driver).count(), before + 1)

    def test_customer_receives_the_location_over_the_delivery_channel(self):
        delivery = self.active_delivery()
        sent = []

        async def capture(channel_layer, delivery_id, lat, lng, eta_minutes=None):
            sent.append((delivery_id, lat, lng))

        with patch("deliveries.broadcast._get_channel_layer", return_value=object()), \
                patch("deliveries.broadcast.send_delivery_location_update", capture), \
                patch("deliveries.services.location_batcher.should_broadcast_location", return_value=True):
            self.assertEqual(self.post({"lat": 18.081, "lng": -15.961}).status_code, 200)
        self.assertEqual(sent, [(delivery.id, 18.081, -15.961)])

    def test_unapproved_courier_is_rejected(self):
        self.active_delivery()
        type(self.driver_profile).objects.filter(pk=self.driver_profile.pk).update(status="pending")
        response = self.post({"lat": 18.08, "lng": -15.96})
        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(self.stored(), (18.08, -15.96))

    def test_non_courier_customer_is_rejected(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(LOCATION, {"lat": 18.08, "lng": -15.96}, format="json")
        self.assertIn(response.status_code, (400, 403))
