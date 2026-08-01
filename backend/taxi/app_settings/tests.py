from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from taxi.market import MARKET

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
    WaitingFeeConfig,
)
from .pricing_service import (
    get_cancellation_policy,
    get_global_fare_config,
    get_no_show_policy,
    get_ride_commission_policy,
    get_waiting_policy,
)


class GlobalFareConfigTests(TestCase):
    def test_approved_seeded_values(self):
        """Migration seeds the approved approved base/per-km/minimum fares."""
        config = get_global_fare_config("regular")
        self.assertEqual(config["base"], Decimal("175.00"))
        self.assertEqual(config["per_km"], Decimal("20.00"))
        self.assertEqual(config["minimum_fare"], Decimal("175.00"))

        for ride_type, base, per_km in [
            ("xl", Decimal("225.00"), Decimal("25.00")),
            ("comfort", Decimal("275.00"), Decimal("30.00")),
            ("share", Decimal("150.00"), Decimal("15.00")),
        ]:
            with self.subTest(ride_type=ride_type):
                data = get_global_fare_config(ride_type)
                self.assertEqual(data["base"], base)
                self.assertEqual(data["per_km"], per_km)
                self.assertEqual(data["minimum_fare"], base)

    def test_case_insensitive_ride_type_lookup(self):
        self.assertEqual(
            get_global_fare_config("COMFORT"),
            get_global_fare_config("comfort"),
        )

    def test_unknown_ride_type_falls_back_to_regular(self):
        self.assertEqual(get_global_fare_config("unknown")["base"], Decimal("175.00"))

    def test_negative_fare_validation(self):
        for field in ["base_fare", "per_km", "minimum_fare"]:
            with self.subTest(field=field):
                config = GlobalFareConfig(
                    ride_type="Regular",
                    **{"base_fare": Decimal("100.00"), "per_km": Decimal("10.00"), "minimum_fare": Decimal("100.00"), field: Decimal("-1.00")}
                )
                with self.assertRaises(ValidationError):
                    config.full_clean()

    def test_only_one_active_per_ride_type(self):
        first = GlobalFareConfig.objects.get(ride_type="Regular")
        second = GlobalFareConfig.objects.create(
            ride_type="Regular",
            base_fare=Decimal("200.00"),
            per_km=Decimal("25.00"),
            minimum_fare=Decimal("200.00"),
            is_active=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)

    def test_service_prefers_database_over_market(self):
        GlobalFareConfig.objects.create(
            ride_type="Regular",
            base_fare=Decimal("999.00"),
            per_km=Decimal("99.00"),
            minimum_fare=Decimal("999.00"),
            is_active=True,
        )
        config = get_global_fare_config("regular")
        self.assertEqual(config["base"], Decimal("999.00"))

    def test_service_ignores_inactive_records(self):
        GlobalFareConfig.objects.create(
            ride_type="Regular",
            base_fare=Decimal("999.00"),
            per_km=Decimal("99.00"),
            minimum_fare=Decimal("999.00"),
            is_active=False,
        )
        # The active seeded record should still be in effect.
        config = get_global_fare_config("regular")
        self.assertEqual(config["base"], Decimal("175.00"))

    def test_service_ignores_future_effective_date(self):
        GlobalFareConfig.objects.create(
            ride_type="Regular",
            base_fare=Decimal("999.00"),
            per_km=Decimal("99.00"),
            minimum_fare=Decimal("999.00"),
            is_active=True,
            effective_from=timezone.now() + timezone.timedelta(days=7),
        )
        config = get_global_fare_config("regular")
        self.assertEqual(config["base"], Decimal("175.00"))


class WaitingFeeConfigTests(TestCase):
    def test_seeded_waiting_policy(self):
        policy = get_waiting_policy()
        self.assertEqual(policy["free_minutes"], 3)
        self.assertEqual(policy["per_minute_fee"], Decimal("50.00"))
        self.assertEqual(policy["max_wait_minutes"], 5)
        self.assertEqual(policy["arrive_max_distance_m"], 350)
        self.assertEqual(policy["no_show_max_distance_m"], 150)

    def test_max_wait_must_be_at_least_free_minutes(self):
        config = WaitingFeeConfig(
            free_minutes=5,
            per_minute_fee=Decimal("50.00"),
            max_wait_minutes=3,
        )
        with self.assertRaises(ValidationError):
            config.full_clean()

    def test_negative_per_minute_fee_validation(self):
        config = WaitingFeeConfig(
            free_minutes=3,
            per_minute_fee=Decimal("-1.00"),
            max_wait_minutes=5,
        )
        with self.assertRaises(ValidationError):
            config.full_clean()

    def test_only_one_active_waiting_config(self):
        first = WaitingFeeConfig.objects.first()
        second = WaitingFeeConfig.objects.create(
            free_minutes=10,
            per_minute_fee=Decimal("100.00"),
            max_wait_minutes=15,
            is_active=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)


class CancellationFeeConfigTests(TestCase):
    def test_seeded_cancellation_policy(self):
        policy = get_cancellation_policy()
        self.assertEqual(policy["free_window_minutes"], 2)
        self.assertEqual(policy["en_route_fee"], Decimal("50.00"))
        self.assertEqual(policy["arrived_fee"], Decimal("75.00"))
        self.assertEqual(policy["driver_penalty"], Decimal("150.00"))

    def test_negative_fee_validation(self):
        for field in ["en_route_fee", "arrived_fee", "driver_penalty"]:
            with self.subTest(field=field):
                defaults = {
                    "free_window_minutes": 2,
                    "en_route_fee": Decimal("50.00"),
                    "arrived_fee": Decimal("75.00"),
                    "driver_penalty": Decimal("150.00"),
                    field: Decimal("-1.00"),
                }
                config = CancellationFeeConfig(**defaults)
                with self.assertRaises(ValidationError):
                    config.full_clean()

    def test_only_one_active_cancellation_config(self):
        first = CancellationFeeConfig.objects.first()
        second = CancellationFeeConfig.objects.create(
            free_window_minutes=5,
            en_route_fee=Decimal("25.00"),
            arrived_fee=Decimal("35.00"),
            driver_penalty=Decimal("100.00"),
            is_active=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)


class NoShowFeeConfigTests(TestCase):
    def test_seeded_no_show_policy(self):
        policy = get_no_show_policy()
        self.assertEqual(policy["rider_fee"], Decimal("75.00"))
        self.assertEqual(policy["driver_compensation"], Decimal("75.00"))

    def test_negative_fee_validation(self):
        config = NoShowFeeConfig(rider_fee=Decimal("-1.00"), driver_compensation=Decimal("75.00"))
        with self.assertRaises(ValidationError):
            config.full_clean()

    def test_only_one_active_no_show_config(self):
        first = NoShowFeeConfig.objects.first()
        second = NoShowFeeConfig.objects.create(
            rider_fee=Decimal("100.00"),
            driver_compensation=Decimal("100.00"),
            is_active=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)


class RideCommissionConfigTests(TestCase):
    def test_seeded_commission_policy(self):
        policy = get_ride_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.3000"))
        self.assertEqual(policy["driver_percent"], Decimal("0.7000"))

    def test_invalid_percent_validation(self):
        for field in ["platform_percent", "driver_percent"]:
            with self.subTest(field=field):
                defaults = {
                    "platform_percent": Decimal("0.30"),
                    "driver_percent": Decimal("0.70"),
                    field: Decimal("1.50"),
                }
                config = RideCommissionConfig(**defaults)
                with self.assertRaises(ValidationError):
                    config.full_clean()

    def test_percent_sum_cannot_exceed_one(self):
        config = RideCommissionConfig(
            platform_percent=Decimal("0.60"),
            driver_percent=Decimal("0.60"),
        )
        with self.assertRaises(ValidationError):
            config.full_clean()

    def test_only_one_active_commission_config(self):
        first = RideCommissionConfig.objects.first()
        second = RideCommissionConfig.objects.create(
            platform_percent=Decimal("0.25"),
            driver_percent=Decimal("0.75"),
            is_active=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)


class ServiceFallbackTests(TestCase):
    def test_all_services_fall_back_to_market(self):
        # Clear the database-backed pricing records to force market.py fallback.
        GlobalFareConfig.objects.all().delete()
        WaitingFeeConfig.objects.all().delete()
        CancellationFeeConfig.objects.all().delete()
        NoShowFeeConfig.objects.all().delete()
        RideCommissionConfig.objects.all().delete()

        fare = get_global_fare_config("regular")
        self.assertEqual(fare["base"], MARKET["fare"]["regular"]["base"])
        self.assertEqual(fare["per_km"], MARKET["fare"]["regular"]["per_km"])

        waiting = get_waiting_policy()
        self.assertEqual(waiting["free_minutes"], MARKET["waiting"]["free_minutes"])

        cancellation = get_cancellation_policy()
        self.assertEqual(cancellation["arrived_fee"], MARKET["cancellation"]["arrived_fee"])

        no_show = get_no_show_policy()
        self.assertEqual(no_show["rider_fee"], MARKET["no_show"]["rider_fee"])

        commission = get_ride_commission_policy()
        self.assertEqual(commission["platform_percent"], MARKET["app_fee_percent"])
        self.assertEqual(commission["driver_percent"], Decimal("1.0000") - MARKET["app_fee_percent"])
