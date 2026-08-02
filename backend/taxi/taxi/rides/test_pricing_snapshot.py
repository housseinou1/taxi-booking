"""Integration tests for RidePricingSnapshot and the dynamic fare resolver."""

from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from app_settings.models import (
    GlobalFareConfig,
    RideCommissionConfig,
    WaitingFeeConfig,
)
from app_settings.pricing_service import resolve_ride_fare, get_ride_commission_percent
from locations.models import City, CityPricing, Region
from taxi.rides.models import Ride, RidePricingSnapshot
from taxi.rides.services.waiting_service import calculate_waiting_fee


class PricingSnapshotTests(APITestCase):
    def setUp(self):
        self.rider = User.objects.create_user(
            email="pricing-rider@example.com",
            password="StrongPass123",
            first_name="Pricing",
            last_name="Rider",
            phone_number="+22222667788",
            phone_verified_at=timezone.now(),
            national_id_number="1234567890",
            rider_status="approved",
        )

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    def test_request_ride_creates_pricing_snapshot(self, _broadcast, _timeout):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/rides/request/",
            {
                "pickup": "Tevragh Zeina",
                "destination": "Airport",
                "distance_km": 8,
                "ride_terms_accepted": True,
                "privacy_accepted": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        ride_id = response.data["id"]
        self.assertTrue(response.data["fare"])

        snapshot = RidePricingSnapshot.objects.get(ride_id=ride_id)
        self.assertEqual(str(snapshot.estimated_fare), response.data["fare"])
        self.assertEqual(snapshot.ride_type, "regular")
        self.assertIn(snapshot.source, ["market_fallback", "global_db", "city"])
        self.assertIsNotNone(snapshot.commission_percent)
        self.assertEqual(str(snapshot.app_fee), response.data["app_fee"])
        self.assertEqual(str(snapshot.driver_earning), response.data["driver_earning"])

    def test_resolve_ride_fare_prefers_city_pricing(self):
        region = Region.objects.create(name="Test Region")
        city = City.objects.create(name="Test City", region=region)
        CityPricing.objects.create(
            city=city,
            ride_type="regular",
            base_fare="50.00",
            per_km="2.00",
            minimum_fare="60.00",
            is_active=True,
        )

        result = resolve_ride_fare(city, "regular", 10)
        self.assertEqual(result.source, "city")
        self.assertEqual(result.base_fare, Decimal("50.00"))
        self.assertEqual(result.per_km, Decimal("2.00"))
        self.assertEqual(result.estimated_fare, Decimal("70.00"))

    def test_resolve_ride_fare_falls_back_to_market(self):
        GlobalFareConfig.objects.all().update(is_active=False)
        CityPricing.objects.all().update(is_active=False)
        result = resolve_ride_fare(None, "regular", 5)
        self.assertEqual(result.source, "market_fallback")
        self.assertGreater(result.estimated_fare, Decimal("0"))
        self.assertEqual(result.app_fee, (result.estimated_fare * result.commission_percent).quantize(Decimal("0.01")))

    def test_waiting_fee_uses_snapshot_policy(self):
        now = timezone.now()
        GlobalFareConfig.objects.create(
            ride_type="Regular",
            base_fare="50.00",
            per_km="2.00",
            minimum_fare="50.00",
            effective_from=now,
        )
        waiting_cfg = WaitingFeeConfig.objects.create(
            free_minutes=2,
            per_minute_fee="5.00",
            max_wait_minutes=10,
            effective_from=now,
        )

        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/rides/request/",
            {
                "pickup": "A",
                "destination": "B",
                "distance_km": 1,
                "ride_terms_accepted": True,
                "privacy_accepted": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        ride = Ride.objects.get(id=response.data["id"])
        snapshot = ride.pricing_snapshot
        self.assertEqual(snapshot.waiting_policy, waiting_cfg)

        fee = calculate_waiting_fee(300, ride=ride)  # 5 minutes = 3 chargeable minutes
        self.assertEqual(fee, Decimal("15.00"))

    def test_commission_percent_uses_snapshot(self):
        now = timezone.now()
        RideCommissionConfig.objects.create(
            platform_percent="0.2500",
            driver_percent="0.7500",
            effective_from=now,
        )

        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/rides/request/",
            {
                "pickup": "A",
                "destination": "B",
                "distance_km": 2,
                "ride_terms_accepted": True,
                "privacy_accepted": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        ride = Ride.objects.get(id=response.data["id"])
        self.assertEqual(get_ride_commission_percent(ride), Decimal("0.2500"))
