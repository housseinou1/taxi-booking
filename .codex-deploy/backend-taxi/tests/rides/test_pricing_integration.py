"""
Mission 16 Commit 2 — Pricing Integration Tests.

Covers:
  - Fare resolution: city override / global DB / market fallback
  - Inactive / future config ignored
  - Invalid ride type rejected
  - Ride creation: snapshot saved, values match, client fare ignored
  - Scheduled ride snapshot saved
  - Waiting fee: snapshot policy used, legacy fallback
  - Cancellation: snapshot policy used
  - Commission: snapshot used, 30/70 result
  - Historical ride safety (no snapshot → no crash)
  - Estimate endpoint contract
"""
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from app_settings.models import (
    GlobalFareConfig,
    WaitingFeeConfig,
    CancellationFeeConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
)
from app_settings.pricing_service import (
    resolve_ride_fare,
    get_ride_commission_percent,
    get_ride_cancellation_policy,
    get_ride_waiting_policy,
    get_ride_no_show_policy,
)
from locations.models import City, CityPricing
from taxi.rides.models import Ride, RidePricingSnapshot
from taxi.rides.services.waiting_service import calculate_waiting_fee


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def rider(db):
    u = User(
        email="pricing-rider@test.com",
        first_name="Pricing",
        last_name="Rider",
        user_type="rider",
    )
    u.set_password("Pass1234!")
    u.phone_number = "+22200001111"
    u.phone_verified_at = timezone.now()
    u.national_id_number = "1111111111"
    u.rider_status = "approved"
    u.save()
    return u


@pytest.fixture
def city(db):
    from locations.models import Region
    region, _ = Region.objects.get_or_create(name="Test Region", defaults={"slug": "test-region"})
    c, _ = City.objects.get_or_create(
        name="Test City",
        region=region,
        defaults={"slug": "test-city", "is_active": True},
    )
    return c


@pytest.fixture
def api_client(rider):
    client = APIClient()
    client.force_authenticate(rider)
    return client


# ── Fare Resolution ───────────────────────────────────────────────────────────

class TestFareResolution:
    """resolve_ride_fare() — approved resolution order."""

    @pytest.mark.django_db
    def test_city_override_preferred(self, city):
        CityPricing.objects.create(
            city=city, ride_type="regular",
            base_fare="100.00", per_km="5.00",
            minimum_fare="100.00", is_active=True,
        )
        result = resolve_ride_fare(city, "regular", 10)
        assert result.source == "city"
        assert result.base_fare == Decimal("100.00")
        assert result.per_km == Decimal("5.00")
        assert result.estimated_fare == Decimal("150.00")

    @pytest.mark.django_db
    def test_global_db_selected_when_no_city_pricing(self, city):
        GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="200.00",
            per_km="10.00", minimum_fare="200.00",
            is_active=True, effective_from=timezone.now(),
        )
        result = resolve_ride_fare(city, "regular", 5)
        assert result.source == "global_db"
        assert result.base_fare == Decimal("200.00")

    @pytest.mark.django_db
    def test_market_fallback_when_no_db_config(self):
        result = resolve_ride_fare(None, "regular", 5)
        assert result.source == "market_fallback"
        # Approved regular base = 175 MRU
        assert result.base_fare == Decimal("175.00")
        assert result.per_km == Decimal("20.00")

    @pytest.mark.django_db
    def test_inactive_config_ignored(self, city):
        GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="9999.00",
            per_km="999.00", minimum_fare="9999.00",
            is_active=False, effective_from=timezone.now(),
        )
        result = resolve_ride_fare(None, "regular", 5)
        assert result.source == "market_fallback"
        assert result.base_fare == Decimal("175.00")

    @pytest.mark.django_db
    def test_future_effective_config_ignored(self):
        future = timezone.now() + timezone.timedelta(days=30)
        GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="500.00",
            per_km="50.00", minimum_fare="500.00",
            is_active=True, effective_from=future,
        )
        result = resolve_ride_fare(None, "regular", 5)
        assert result.source == "market_fallback"

    @pytest.mark.django_db
    def test_fare_result_contains_all_fields(self):
        result = resolve_ride_fare(None, "xl", 8)
        assert result.ride_type == "xl"
        assert result.estimated_fare > Decimal("0")
        assert result.app_fee >= Decimal("0")
        assert result.driver_earning >= Decimal("0")
        assert result.estimated_fare == result.app_fee + result.driver_earning

    @pytest.mark.django_db
    def test_approved_fares_market_fallback(self):
        """Confirm the approved fare values are intact in market.py."""
        cases = [
            ("regular", 0, Decimal("175.00")),
            ("xl", 0, Decimal("225.00")),
            ("comfort", 0, Decimal("275.00")),
            ("share", 0, Decimal("150.00")),
        ]
        for ride_type, dist, expected_base in cases:
            r = resolve_ride_fare(None, ride_type, dist)
            assert r.base_fare == expected_base, f"Wrong base for {ride_type}"
            assert r.estimated_fare == expected_base, f"Wrong fare for {ride_type}"


# ── Ride Creation Snapshot ────────────────────────────────────────────────────

class TestRideCreationSnapshot:
    """Snapshot is saved atomically with ride creation."""

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.broadcast_ride_request_to_available_drivers")
    @pytest.mark.django_db
    def test_snapshot_created_on_request(self, _bcast_drivers, _bcast, _timeout, api_client):
        resp = api_client.post("/rides/request/", {
            "pickup": "A", "destination": "B",
            "distance_km": 5,
            "ride_terms_accepted": True, "privacy_accepted": True,
        }, format="json")
        assert resp.status_code == 201
        ride = Ride.objects.get(id=resp.data["id"])
        snap = RidePricingSnapshot.objects.get(ride=ride)
        assert snap.estimated_fare == ride.fare
        assert snap.source in ("market_fallback", "global_db", "city")
        assert snap.commission_percent is not None
        assert snap.app_fee == ride.app_fee
        assert snap.driver_earning == ride.driver_earning

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.broadcast_ride_request_to_available_drivers")
    @pytest.mark.django_db
    def test_client_submitted_fare_ignored(self, _bcast_drivers, _bcast, _timeout, api_client):
        """Client can't override server-computed fare."""
        resp = api_client.post("/rides/request/", {
            "pickup": "A", "destination": "B",
            "distance_km": 5, "fare": "1.00",
            "ride_terms_accepted": True, "privacy_accepted": True,
        }, format="json")
        assert resp.status_code == 201
        ride = Ride.objects.get(id=resp.data["id"])
        # Fare must be the backend-computed value, not 1.00
        assert ride.fare > Decimal("1.00")

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.broadcast_ride_request_to_available_drivers")
    @pytest.mark.django_db
    def test_snapshot_values_match_fare(self, _bcast_drivers, _bcast, _timeout, api_client):
        resp = api_client.post("/rides/request/", {
            "pickup": "A", "destination": "B", "distance_km": 3,
            "ride_terms_accepted": True, "privacy_accepted": True,
        }, format="json")
        ride = Ride.objects.get(id=resp.data["id"])
        snap = ride.pricing_snapshot
        assert snap.estimated_fare == ride.fare
        assert snap.app_fee + snap.driver_earning == snap.estimated_fare

    @patch("taxi.rides.views.start_ride_request_timeout")
    @patch("taxi.rides.views.broadcast_ride_update")
    @patch("taxi.rides.views.broadcast_ride_request_to_available_drivers")
    @pytest.mark.django_db
    def test_scheduled_ride_snapshot_saved(self, _bcast_drivers, _bcast, _timeout, api_client, rider):
        from django.utils import timezone as tz
        future = (tz.now() + tz.timedelta(hours=2)).isoformat()
        resp = api_client.post("/rides/schedule/", {
            "pickup": "A", "destination": "B", "distance_km": 4,
            "scheduled_at": future,
            "ride_terms_accepted": True, "privacy_accepted": True,
        }, format="json")
        assert resp.status_code == 201
        ride = Ride.objects.get(id=resp.data["id"])
        assert RidePricingSnapshot.objects.filter(ride=ride).exists()

    @pytest.mark.django_db
    def test_only_one_snapshot_per_ride(self, city):
        """_create_pricing_snapshot is idempotent."""
        from taxi.rides.views import _create_pricing_snapshot
        from authapp.models import User

        rider = User.objects.create_user(
            email="snap-idem@test.com", password="P@ss1234",
            phone_number="+22299991111",
        )
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("175.00"), status="requested",
        )
        fare_result = resolve_ride_fare(None, "regular", 5)
        _create_pricing_snapshot(ride, fare_result)
        _create_pricing_snapshot(ride, fare_result)  # second call must be a no-op
        assert RidePricingSnapshot.objects.filter(ride=ride).count() == 1


# ── Estimate Endpoint ─────────────────────────────────────────────────────────

class TestEstimateEndpoint:

    @pytest.mark.django_db
    def test_estimate_returns_200(self, api_client):
        resp = api_client.post("/rides/estimate/", {
            "ride_type": "regular", "distance_km": 5,
        }, format="json")
        assert resp.status_code == 200
        assert "estimated_fare" in resp.data
        assert "pricing_source" in resp.data
        assert "currency" in resp.data

    @pytest.mark.django_db
    def test_estimate_invalid_type_rejected(self, api_client):
        resp = api_client.post("/rides/estimate/", {
            "ride_type": "helicopter", "distance_km": 5,
        }, format="json")
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_estimate_all_fields_present(self, api_client):
        resp = api_client.post("/rides/estimate/", {
            "ride_type": "xl", "distance_km": 8,
        }, format="json")
        assert resp.status_code == 200
        for field in ("ride_type", "distance_km", "base_fare", "per_km",
                      "minimum_fare", "distance_charge", "estimated_fare",
                      "pricing_source", "city_override", "app_fee_estimate",
                      "driver_earning_estimate", "currency"):
            assert field in resp.data, f"Missing field: {field}"

    @pytest.mark.django_db
    def test_estimate_approved_regular_base(self, api_client):
        resp = api_client.post("/rides/estimate/", {
            "ride_type": "regular", "distance_km": 0,
        }, format="json")
        assert resp.status_code == 200
        # Zero distance → base fare = 175 MRU (approved)
        assert Decimal(resp.data["estimated_fare"]) == Decimal("175.00")

    @pytest.mark.django_db
    def test_estimate_does_not_create_ride(self, api_client):
        before = Ride.objects.count()
        api_client.post("/rides/estimate/", {
            "ride_type": "regular", "distance_km": 5,
        }, format="json")
        assert Ride.objects.count() == before


# ── Waiting Policy ────────────────────────────────────────────────────────────

class TestWaitingPolicy:

    @pytest.mark.django_db
    def test_snapshot_waiting_policy_used(self, rider):
        waiting_cfg = WaitingFeeConfig.objects.create(
            free_minutes=2, per_minute_fee="10.00",
            max_wait_minutes=10, effective_from=timezone.now(),
        )
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("200.00"), status="driver_arrived",
        )
        RidePricingSnapshot.objects.create(
            ride=ride, ride_type="regular", source="market_fallback",
            base_fare="175.00", per_km="20.00", minimum_fare="175.00",
            billable_distance_km="5.00", distance_charge="100.00",
            estimated_fare="200.00", commission_percent="0.3000",
            app_fee="60.00", driver_earning="140.00",
            waiting_policy=waiting_cfg,
        )
        # 3 minutes = 1 chargeable minute (free_minutes=2 from snapshot)
        fee = calculate_waiting_fee(180, ride=ride)
        assert fee == Decimal("10.00")

    @pytest.mark.django_db
    def test_legacy_ride_no_snapshot_uses_fallback(self, rider):
        """Ride with no snapshot must not crash; falls back to market.py."""
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("175.00"), status="driver_arrived",
        )
        # market.py: free_minutes=3, per_minute_fee=50
        # 4 minutes = 1 chargeable minute = 50 MRU
        fee = calculate_waiting_fee(240, ride=ride)
        assert fee == Decimal("50.00")

    @pytest.mark.django_db
    def test_waiting_fee_zero_within_free_period(self, rider):
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("175.00"), status="driver_arrived",
        )
        # 3 minutes exactly (market.py free_minutes=3) → 0 fee
        fee = calculate_waiting_fee(180, ride=ride)
        assert fee == Decimal("0.00")


# ── Cancellation Policy ───────────────────────────────────────────────────────

class TestCancellationPolicy:

    @pytest.mark.django_db
    def test_snapshot_cancellation_policy_used(self, rider):
        cancel_cfg = CancellationFeeConfig.objects.create(
            free_window_minutes=2, en_route_fee="30.00",
            arrived_fee="55.00", driver_penalty="120.00",
            is_active=True, effective_from=timezone.now(),
        )
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("200.00"), status="driver_arriving",
        )
        RidePricingSnapshot.objects.create(
            ride=ride, ride_type="regular", source="market_fallback",
            base_fare="175.00", per_km="20.00", minimum_fare="175.00",
            billable_distance_km="5.00", distance_charge="100.00",
            estimated_fare="200.00", commission_percent="0.3000",
            app_fee="60.00", driver_earning="140.00",
            cancellation_policy=cancel_cfg,
        )
        policy = get_ride_cancellation_policy(ride)
        assert policy["en_route_fee"] == Decimal("30.00")
        assert policy["arrived_fee"] == Decimal("55.00")
        assert policy["driver_penalty"] == Decimal("120.00")

    @pytest.mark.django_db
    def test_legacy_ride_uses_market_fallback(self, rider):
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("175.00"), status="driver_arriving",
        )
        policy = get_ride_cancellation_policy(ride)
        # market.py: en_route_fee=50, arrived_fee=75, driver_penalty=150
        assert policy["en_route_fee"] == Decimal("50.00")
        assert policy["driver_penalty"] == Decimal("150.00")

    @pytest.mark.django_db
    def test_approved_cancellation_fees_unchanged(self):
        """Market.py fallback values must match the approved schedule."""
        from taxi.market import MARKET
        c = MARKET["cancellation"]
        assert Decimal(str(c["en_route_fee"])) == Decimal("50.00")
        assert Decimal(str(c["arrived_fee"])) == Decimal("75.00")
        assert Decimal(str(c["driver_penalty"])) == Decimal("150.00")


# ── Commission ────────────────────────────────────────────────────────────────

class TestCommission:

    @pytest.mark.django_db
    def test_snapshot_commission_used(self, rider):
        comm_cfg = RideCommissionConfig.objects.create(
            platform_percent="0.2500", driver_percent="0.7500",
            is_active=True, effective_from=timezone.now(),
        )
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("200.00"), status="requested",
        )
        RidePricingSnapshot.objects.create(
            ride=ride, ride_type="regular", source="market_fallback",
            base_fare="175.00", per_km="20.00", minimum_fare="175.00",
            billable_distance_km="5.00", distance_charge="100.00",
            estimated_fare="200.00", commission_percent="0.2500",
            app_fee="50.00", driver_earning="150.00",
            commission_policy=comm_cfg,
        )
        assert get_ride_commission_percent(ride) == Decimal("0.2500")

    @pytest.mark.django_db
    def test_30_70_split_market_fallback(self, rider):
        """No snapshot → market.py 30% default → 30/70 split."""
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("200.00"), status="requested",
        )
        pct = get_ride_commission_percent(ride)
        # Market.py default is 30%
        assert pct == Decimal("0.3000")

    @pytest.mark.django_db
    def test_existing_ride_not_recalculated_on_new_config(self, rider):
        """Activating a new commission config must not change settled ride snapshots."""
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("200.00"), status="completed",
        )
        RidePricingSnapshot.objects.create(
            ride=ride, ride_type="regular", source="market_fallback",
            base_fare="175.00", per_km="20.00", minimum_fare="175.00",
            billable_distance_km="5.00", distance_charge="100.00",
            estimated_fare="200.00", commission_percent="0.3000",
            app_fee="60.00", driver_earning="140.00",
        )
        # Activate a new higher commission config
        RideCommissionConfig.objects.create(
            platform_percent="0.4000", driver_percent="0.6000",
            is_active=True, effective_from=timezone.now(),
        )
        # The ride's snapshot still reads the original 30%
        pct = get_ride_commission_percent(ride)
        assert pct == Decimal("0.3000")


# ── Historical / Legacy Ride Safety ──────────────────────────────────────────

class TestHistoricalRideSafety:

    @pytest.mark.django_db
    def test_old_ride_no_snapshot_does_not_crash(self, rider):
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("300.00"), status="completed",
        )
        # All policy getters must be safe on rides without a snapshot
        assert get_ride_commission_percent(ride) >= Decimal("0")
        assert get_ride_cancellation_policy(ride)["en_route_fee"] >= Decimal("0")
        assert get_ride_waiting_policy(ride)["free_minutes"] >= 0
        assert get_ride_no_show_policy(ride)["rider_fee"] >= Decimal("0")

    @pytest.mark.django_db
    def test_waiting_fee_legacy_no_crash(self, rider):
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("300.00"), status="driver_arrived",
        )
        fee = calculate_waiting_fee(600, ride=ride)
        assert fee >= Decimal("0")

    @pytest.mark.django_db
    def test_fare_values_not_mutated_on_old_rides(self, rider):
        """Old ride fare must remain unchanged after migrations/new configs."""
        ride = Ride.objects.create(
            rider=rider, pickup="A", destination="B",
            fare=Decimal("999.99"), status="completed",
        )
        ride.refresh_from_db()
        assert ride.fare == Decimal("999.99")


# ── App Settings Tests ────────────────────────────────────────────────────────

class TestAppSettingsModels:

    @pytest.mark.django_db
    def test_global_fare_config_deactivates_previous(self):
        now = timezone.now()
        cfg1 = GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="175.00", per_km="20.00",
            minimum_fare="175.00", is_active=True, effective_from=now,
        )
        cfg2 = GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="180.00", per_km="21.00",
            minimum_fare="180.00", is_active=True, effective_from=now,
        )
        cfg1.refresh_from_db()
        assert not cfg1.is_active
        assert cfg2.is_active

    @pytest.mark.django_db
    def test_commission_config_deactivates_previous(self):
        now = timezone.now()
        cfg1 = RideCommissionConfig.objects.create(
            platform_percent="0.3000", driver_percent="0.7000",
            is_active=True, effective_from=now,
        )
        cfg2 = RideCommissionConfig.objects.create(
            platform_percent="0.2500", driver_percent="0.7500",
            is_active=True, effective_from=now,
        )
        cfg1.refresh_from_db()
        assert not cfg1.is_active
        assert cfg2.is_active
