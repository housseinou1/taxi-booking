from decimal import Decimal

from django.utils import timezone

from taxi.market import MARKET

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
    WaitingFeeConfig,
)


def _resolve_ride_type(ride_type):
    return str(ride_type or "regular").strip()


def get_global_fare_config(ride_type):
    """Return base, per-km, and minimum fare for a ride type.

    Resolution order:
    1. Active database-backed GlobalFareConfig
    2. Existing market.py values
    """
    rt = _resolve_ride_type(ride_type)
    now = timezone.now()

    config = (
        GlobalFareConfig.objects.filter(
            ride_type__iexact=rt,
            is_active=True,
            effective_from__lte=now,
        )
        .order_by("-effective_from", "-created_at")
        .first()
    )

    if config:
        return {
            "base": Decimal(config.base_fare),
            "per_km": Decimal(config.per_km),
            "minimum_fare": Decimal(config.minimum_fare),
        }

    market_fare = MARKET["fare"].get(rt.lower())
    if market_fare is None:
        market_fare = MARKET["fare"]["regular"]

    return {
        "base": Decimal(market_fare["base"]),
        "per_km": Decimal(market_fare["per_km"]),
        "minimum_fare": Decimal(market_fare["base"]),
    }


def get_waiting_policy():
    """Return the active waiting-fee policy, falling back to market.py."""
    now = timezone.now()
    config = WaitingFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()

    if config:
        return {
            "free_minutes": int(config.free_minutes),
            "per_minute_fee": Decimal(config.per_minute_fee),
            "max_wait_minutes": int(config.max_wait_minutes),
            "arrive_max_distance_m": int(config.arrive_max_distance_m),
            "no_show_max_distance_m": int(config.no_show_max_distance_m),
        }

    waiting = MARKET["waiting"]
    return {
        "free_minutes": int(waiting["free_minutes"]),
        "per_minute_fee": Decimal(waiting["per_minute_fee"]),
        "max_wait_minutes": int(waiting["max_wait_minutes"]),
        "arrive_max_distance_m": int(waiting["arrive_max_distance_m"]),
        "no_show_max_distance_m": int(waiting["no_show_max_distance_m"]),
    }


def get_cancellation_policy():
    """Return the active cancellation-fee policy, falling back to market.py."""
    now = timezone.now()
    config = CancellationFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()

    if config:
        return {
            "free_window_minutes": int(config.free_window_minutes),
            "en_route_fee": Decimal(config.en_route_fee),
            "arrived_fee": Decimal(config.arrived_fee),
            "driver_penalty": Decimal(config.driver_penalty),
        }

    cancellation = MARKET["cancellation"]
    return {
        "free_window_minutes": int(cancellation["free_window_minutes"]),
        "en_route_fee": Decimal(cancellation["en_route_fee"]),
        "arrived_fee": Decimal(cancellation["arrived_fee"]),
        "driver_penalty": Decimal(cancellation["driver_penalty"]),
    }


def get_no_show_policy():
    """Return the active no-show fee policy, falling back to market.py."""
    now = timezone.now()
    config = NoShowFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()

    if config:
        return {
            "rider_fee": Decimal(config.rider_fee),
            "driver_compensation": Decimal(config.driver_compensation),
            "wait_minutes_threshold": int(config.wait_minutes_threshold),
            "max_distance_m": int(config.max_distance_m),
        }

    no_show = MARKET["no_show"]
    waiting = MARKET["waiting"]
    return {
        "rider_fee": Decimal(no_show["rider_fee"]),
        "driver_compensation": Decimal(no_show["driver_compensation"]),
        "wait_minutes_threshold": int(waiting["max_wait_minutes"]),
        "max_distance_m": int(waiting["no_show_max_distance_m"]),
    }


def get_ride_commission_policy():
    """Return the active ride commission split, falling back to market.py."""
    now = timezone.now()
    config = RideCommissionConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()

    if config:
        return {
            "platform_percent": Decimal(config.platform_percent),
            "driver_percent": Decimal(config.driver_percent),
        }

    platform = Decimal(MARKET["app_fee_percent"])
    return {
        "platform_percent": platform,
        "driver_percent": Decimal("1.0000") - platform,
    }
