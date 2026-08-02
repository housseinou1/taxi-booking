"""
Tests for app_settings pricing models and pricing_service.
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from .models import (
    GlobalFareConfig,
    WaitingFeeConfig,
    CancellationFeeConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
)
from .pricing_service import (
    get_global_fare_config,
    get_waiting_policy,
    get_cancellation_policy,
    get_no_show_policy,
    get_ride_commission_policy,
    resolve_ride_fare,
)


class GlobalFareConfigTests(TestCase):

    def test_market_fallback_when_no_db_config(self):
        result = get_global_fare_config("regular")
        # Approved regular base = 175 MRU
        self.assertEqual(result["base"], Decimal("175.00"))
        self.assertEqual(result["per_km"], Decimal("20.00"))

    def test_db_config_overrides_market(self):
        GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="200.00",
            per_km="22.00", minimum_fare="200.00",
            is_active=True, effective_from=timezone.now(),
        )
        result = get_global_fare_config("regular")
        self.assertEqual(result["base"], Decimal("200.00"))
        self.assertEqual(result["per_km"], Decimal("22.00"))

    def test_inactive_config_ignored(self):
        GlobalFareConfig.objects.create(
            ride_type="Regular", base_fare="9999.00",
            per_km="999.00", minimum_fare="9999.00",
            is_active=False, effective_from=timezone.now(),
        )
        result = get_global_fare_config("regular")
        self.assertEqual(result["base"], Decimal("175.00"))  # market fallback

    def test_approved_xl_base(self):
        result = get_global_fare_config("xl")
        # Market fallback xl base = 225 MRU
        self.assertEqual(result["base"], Decimal("225.00"))

    def test_approved_comfort_base(self):
        result = get_global_fare_config("comfort")
        self.assertEqual(result["base"], Decimal("275.00"))

    def test_approved_share_base(self):
        result = get_global_fare_config("share")
        self.assertEqual(result["base"], Decimal("150.00"))


class WaitingPolicyTests(TestCase):

    def test_market_fallback_values(self):
        policy = get_waiting_policy()
        self.assertEqual(policy["free_minutes"], 3)
        self.assertEqual(policy["per_minute_fee"], Decimal("50.00"))
        self.assertEqual(policy["max_wait_minutes"], 5)

    def test_db_config_used_when_active(self):
        WaitingFeeConfig.objects.create(
            free_minutes=5, per_minute_fee="20.00",
            max_wait_minutes=15, effective_from=timezone.now(),
        )
        policy = get_waiting_policy()
        self.assertEqual(policy["free_minutes"], 5)
        self.assertEqual(policy["per_minute_fee"], Decimal("20.00"))


class CancellationPolicyTests(TestCase):

    def test_approved_market_values(self):
        policy = get_cancellation_policy()
        self.assertEqual(policy["en_route_fee"], Decimal("50.00"))
        self.assertEqual(policy["arrived_fee"], Decimal("75.00"))
        self.assertEqual(policy["driver_penalty"], Decimal("150.00"))

    def test_db_config_overrides_market(self):
        CancellationFeeConfig.objects.create(
            free_window_minutes=3, en_route_fee="40.00",
            arrived_fee="60.00", driver_penalty="100.00",
            is_active=True, effective_from=timezone.now(),
        )
        policy = get_cancellation_policy()
        self.assertEqual(policy["en_route_fee"], Decimal("40.00"))


class CommissionPolicyTests(TestCase):

    def test_market_fallback_30_percent(self):
        policy = get_ride_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.3000"))

    def test_db_config_overrides(self):
        RideCommissionConfig.objects.create(
            platform_percent="0.2500", driver_percent="0.7500",
            is_active=True, effective_from=timezone.now(),
        )
        policy = get_ride_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.2500"))


class ResolveFareTests(TestCase):

    def test_market_fallback_regular(self):
        result = resolve_ride_fare(None, "regular", 0)
        self.assertEqual(result.source, "market_fallback")
        self.assertEqual(result.base_fare, Decimal("175.00"))
        self.assertEqual(result.estimated_fare, Decimal("175.00"))

    def test_app_fee_plus_driver_equals_fare(self):
        result = resolve_ride_fare(None, "regular", 10)
        self.assertEqual(result.app_fee + result.driver_earning, result.estimated_fare)

    def test_minimum_fare_enforced(self):
        result = resolve_ride_fare(None, "xl", 0)
        self.assertEqual(result.estimated_fare, Decimal("225.00"))
