from collections import namedtuple
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from taxi.market import MARKET

from locations.models import CityPricing

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
            "config_id": config.id,
        }

    platform = Decimal(MARKET["app_fee_percent"])
    return {
        "platform_percent": platform,
        "driver_percent": Decimal("1.0000") - platform,
        "config_id": None,
    }


FareResult = namedtuple(
    "FareResult",
    [
        "ride_type",
        "source",
        "city_pricing_id",
        "global_fare_config_id",
        "base_fare",
        "per_km",
        "minimum_fare",
        "billable_distance_km",
        "distance_charge",
        "estimated_fare",
        "commission_percent",
        "commission_config_id",
        "waiting_policy_id",
        "cancellation_policy_id",
        "no_show_policy_id",
        "effective_from",
        "app_fee",
        "driver_earning",
    ],
)


def calculate_ride_app_fee(fare, commission_percent=None):
    """Calculate the platform app fee using the provided commission percent."""
    percent = Decimal(str(commission_percent or MARKET["app_fee_percent"]))
    amount = Decimal(str(fare or 0)) * percent
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def resolve_ride_fare(city, ride_type, distance_km):
    """Resolve ride fare in the approved order:

    1. Active CityPricing override for city + ride type.
    2. Active GlobalFareConfig.
    3. market.py fallback.

    Returns an immutable FareResult namedtuple with all pricing metadata.
    """
    rt = _resolve_ride_type(ride_type).lower()
    distance = max(Decimal(str(distance_km or 0)), Decimal("0"))

    now = timezone.now()

    city_pricing = None
    global_config = None
    source = "market_fallback"
    effective_from = None

    if city:
        city_pricing = CityPricing.objects.filter(
            city=city,
            ride_type__iexact=rt,
            is_active=True,
        ).first()

    if city_pricing:
        source = "city"
        base_fare = Decimal(city_pricing.base_fare)
        per_km = Decimal(city_pricing.per_km)
        minimum_fare = Decimal(city_pricing.minimum_fare)
    else:
        global_config = (
            GlobalFareConfig.objects.filter(
                ride_type__iexact=rt,
                is_active=True,
                effective_from__lte=now,
            )
            .order_by("-effective_from", "-created_at")
            .first()
        )

        if global_config:
            source = "global_db"
            base_fare = Decimal(global_config.base_fare)
            per_km = Decimal(global_config.per_km)
            minimum_fare = Decimal(global_config.minimum_fare)
            effective_from = global_config.effective_from
        else:
            market_fare = MARKET["fare"].get(rt, MARKET["fare"]["regular"])
            base_fare = Decimal(market_fare["base"])
            per_km = Decimal(market_fare["per_km"])
            minimum_fare = base_fare

    raw_fare = base_fare + (distance * per_km)
    estimated_fare = max(raw_fare, base_fare, minimum_fare)
    estimated_fare = estimated_fare.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    distance_charge = estimated_fare - base_fare

    waiting_config = WaitingFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()
    cancellation_config = CancellationFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()
    no_show_config = NoShowFeeConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()
    commission_config = RideCommissionConfig.objects.filter(
        is_active=True,
        effective_from__lte=now,
    ).order_by("-effective_from", "-created_at").first()

    if commission_config:
        commission_percent = Decimal(commission_config.platform_percent)
    else:
        commission_percent = Decimal(MARKET["app_fee_percent"])

    app_fee = calculate_ride_app_fee(estimated_fare, commission_percent)
    driver_earning = estimated_fare - app_fee

    return FareResult(
        ride_type=rt,
        source=source,
        city_pricing_id=city_pricing.id if city_pricing else None,
        global_fare_config_id=global_config.id if global_config else None,
        base_fare=base_fare,
        per_km=per_km,
        minimum_fare=minimum_fare,
        billable_distance_km=distance,
        distance_charge=distance_charge,
        estimated_fare=estimated_fare,
        commission_percent=commission_percent,
        commission_config_id=commission_config.id if commission_config else None,
        waiting_policy_id=waiting_config.id if waiting_config else None,
        cancellation_policy_id=cancellation_config.id if cancellation_config else None,
        no_show_policy_id=no_show_config.id if no_show_config else None,
        effective_from=effective_from,
        app_fee=app_fee,
        driver_earning=driver_earning,
    )


def _snapshot_for_ride(ride):
    return getattr(ride, "pricing_snapshot", None)


def get_ride_commission_percent(ride):
    """Return the commission percent that applies to a ride.

    Prefer the snapshot captured at ride creation; otherwise fall back to the
    active commission policy and finally market.py.
    """
    snapshot = _snapshot_for_ride(ride)
    if snapshot and snapshot.commission_percent is not None:
        return Decimal(snapshot.commission_percent)
    return get_ride_commission_policy()["platform_percent"]


def get_ride_cancellation_policy(ride):
    """Return the cancellation policy applicable to a ride, preferring its snapshot."""
    snapshot = _snapshot_for_ride(ride)
    if snapshot and snapshot.cancellation_policy:
        cfg = snapshot.cancellation_policy
        return {
            "free_window_minutes": int(cfg.free_window_minutes),
            "en_route_fee": Decimal(cfg.en_route_fee),
            "arrived_fee": Decimal(cfg.arrived_fee),
            "driver_penalty": Decimal(cfg.driver_penalty),
            "config_id": cfg.id,
        }
    return get_cancellation_policy()


def get_ride_waiting_policy(ride):
    """Return the waiting policy applicable to a ride, preferring its snapshot."""
    snapshot = _snapshot_for_ride(ride)
    if snapshot and snapshot.waiting_policy:
        cfg = snapshot.waiting_policy
        return {
            "free_minutes": int(cfg.free_minutes),
            "per_minute_fee": Decimal(cfg.per_minute_fee),
            "max_wait_minutes": int(cfg.max_wait_minutes),
            "arrive_max_distance_m": int(cfg.arrive_max_distance_m),
            "no_show_max_distance_m": int(cfg.no_show_max_distance_m),
            "config_id": cfg.id,
        }
    return get_waiting_policy()


def get_ride_no_show_policy(ride):
    """Return the no-show fee policy applicable to a ride, preferring its snapshot."""
    snapshot = _snapshot_for_ride(ride)
    if snapshot and snapshot.no_show_policy:
        cfg = snapshot.no_show_policy
        return {
            "rider_fee": Decimal(cfg.rider_fee),
            "driver_compensation": Decimal(cfg.driver_compensation),
            "wait_minutes_threshold": int(cfg.wait_minutes_threshold),
            "max_distance_m": int(cfg.max_distance_m),
            "config_id": cfg.id,
        }
    return get_no_show_policy()
