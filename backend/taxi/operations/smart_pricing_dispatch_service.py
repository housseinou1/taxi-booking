"""Smart Pricing & Dispatch Engine (Phase 28).

Feature-flagged intelligent dispatch scoring, dynamic pricing, surge controls,
analytics, and dry-run fare simulation. Existing MARKET / CityPricing remain
the default when the engine is disabled.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from locations.models import City, CityPricing
from features.models import SurgeHistory
from payments.models import Payment
from taxi.market import MARKET, calculate_app_fee, calculate_fare, get_app_fee_percent
from taxi.rides.models import DispatchOfferLog, Ride
from taxi.rides.services.driver_dispatch_service import (
    explain_ranked_driver,
    rank_eligible_drivers,
    radius_for_round,
    select_best_driver,
)

from .ai_operations_service import build_smart_dispatch_insights, build_surge_monitor
from .executive_service import RIDE_ACTIVE, _dec
from .fleet_performance_service import build_fleet_overview
from .models import PlatformSetting

User = get_user_model()

ENGINE_SETTING_KEY = "smart_engine"
DISPATCH_RULES_KEY = "dispatch_rules"
PRICING_RULES_KEY = "dynamic_pricing_rules"
SURGE_CONFIG_KEY = "surge_engine_config"
AUDIT_KEY = "smart_engine_audit"

DEFAULT_ENGINE_FLAGS = {
    "enabled": False,
    "smart_dispatch_enabled": False,
    "dynamic_pricing_enabled": False,
    "surge_pricing_enabled": False,
}

DEFAULT_DISPATCH_WEIGHTS = {
    "distance": 0.40,
    "eta": 0.15,
    "rating": 0.12,
    "acceptance": 0.10,
    "cancellation": 0.08,
    "level": 0.05,
    "fairness": 0.10,
    "traffic_factor": 0.0,
    "vehicle_match": 0.0,
    "idle_time": 0.0,
}

DEFAULT_DISPATCH_RULES = {
    "search_radii_km": [2.0, 5.0, 10.0, 25.0],
    "avg_city_speed_kmh": 28.0,
    "traffic_multiplier": 1.0,
    "weights": DEFAULT_DISPATCH_WEIGHTS,
    "require_documents": True,
    "prefer_idle_minutes": 15,
}

DEFAULT_PRICING_RULES = {
    "base_fare": None,
    "distance_fare_per_km": None,
    "time_fare_per_minute": Decimal("0"),
    "waiting_fee_per_minute": None,
    "minimum_fare": None,
    "airport_surcharge": Decimal("0"),
    "night_surcharge_pct": Decimal("0"),
    "holiday_surcharge_pct": Decimal("0"),
    "weather_surcharge_pct": Decimal("0"),
    "event_surcharge_pct": Decimal("0"),
    "night_hours": [22, 6],
}

DEFAULT_SURGE_CONFIG = {
    "enabled": False,
    "max_multiplier": 2.5,
    "excluded_zones": [],
    "auto_apply": False,
}


def _quantize(value) -> str:
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _append_audit(action: str, summary: str, details: dict | None = None, user=None):
    trail = PlatformSetting.get_value(AUDIT_KEY, {"entries": []}) or {"entries": []}
    entries = list(trail.get("entries") or [])
    entries.insert(
        0,
        {
            "action": action,
            "summary": summary,
            "details": details or {},
            "user_id": getattr(user, "id", None),
            "user_email": getattr(user, "email", None),
            "at": timezone.now().isoformat(),
        },
    )
    PlatformSetting.set_value(AUDIT_KEY, {"entries": entries[:200]}, user=user)


def get_engine_flags() -> dict:
    stored = PlatformSetting.get_value(ENGINE_SETTING_KEY, DEFAULT_ENGINE_FLAGS) or {}
    return {**DEFAULT_ENGINE_FLAGS, **stored}


def set_engine_flags(payload: dict, user=None) -> dict:
    current = get_engine_flags()
    merged = {**current, **{k: v for k, v in payload.items() if k in DEFAULT_ENGINE_FLAGS}}
    PlatformSetting.set_value(ENGINE_SETTING_KEY, merged, user=user)
    _append_audit("engine_flags", "Updated smart engine feature flags", merged, user=user)
    return merged


def is_engine_enabled() -> bool:
    return bool(get_engine_flags().get("enabled"))


def is_smart_dispatch_enabled() -> bool:
    flags = get_engine_flags()
    return bool(flags.get("enabled") and flags.get("smart_dispatch_enabled"))


def is_dynamic_pricing_enabled() -> bool:
    flags = get_engine_flags()
    return bool(flags.get("enabled") and flags.get("dynamic_pricing_enabled"))


def is_surge_enabled() -> bool:
    flags = get_engine_flags()
    surge = get_surge_config()
    return bool(flags.get("enabled") and flags.get("surge_pricing_enabled") and surge.get("enabled"))


def get_dispatch_rules(city_id=None) -> dict:
    all_rules = PlatformSetting.get_value(DISPATCH_RULES_KEY, {"default": DEFAULT_DISPATCH_RULES}) or {}
    default = {**DEFAULT_DISPATCH_RULES, **(all_rules.get("default") or {})}
    default_weights = {**DEFAULT_DISPATCH_WEIGHTS, **(default.get("weights") or {})}
    default["weights"] = default_weights
    if city_id is not None:
        city_key = str(city_id)
        city_rules = all_rules.get("cities", {}).get(city_key, {})
        merged = {**default, **city_rules}
        merged["weights"] = {**default_weights, **(city_rules.get("weights") or {})}
        return merged
    return default


def set_dispatch_rules(payload: dict, city_id=None, user=None) -> dict:
    all_rules = PlatformSetting.get_value(DISPATCH_RULES_KEY, {"default": DEFAULT_DISPATCH_RULES}) or {}
    if city_id is None:
        merged = {**get_dispatch_rules(), **payload}
        if "weights" in payload:
            merged["weights"] = {**get_dispatch_rules()["weights"], **payload["weights"]}
        all_rules["default"] = merged
    else:
        cities = dict(all_rules.get("cities") or {})
        current = get_dispatch_rules(city_id)
        merged = {**current, **payload}
        if "weights" in payload:
            merged["weights"] = {**current["weights"], **payload["weights"]}
        cities[str(city_id)] = merged
        all_rules["cities"] = cities
    PlatformSetting.set_value(DISPATCH_RULES_KEY, all_rules, user=user)
    _append_audit(
        "dispatch_rules",
        f"Updated dispatch rules{' for city ' + str(city_id) if city_id else ''}",
        merged if city_id is None else cities[str(city_id)],
        user=user,
    )
    return get_dispatch_rules(city_id)


def resolve_dispatch_weights(city_id=None) -> dict:
    if not is_smart_dispatch_enabled():
        return DEFAULT_DISPATCH_WEIGHTS
    return get_dispatch_rules(city_id).get("weights") or DEFAULT_DISPATCH_WEIGHTS


def get_pricing_rules(city_id=None, ride_type: str = "regular") -> dict:
    all_rules = PlatformSetting.get_value(PRICING_RULES_KEY, {"default": DEFAULT_PRICING_RULES}) or {}
    default = {**DEFAULT_PRICING_RULES, **(all_rules.get("default") or {})}
    city_rules = {}
    if city_id is not None:
        city_rules = (all_rules.get("cities") or {}).get(str(city_id), {})
    ride_rules = (all_rules.get("ride_types") or {}).get(ride_type.lower(), {})
    merged = {**default, **city_rules, **ride_rules}

    pricing_row = None
    if city_id:
        pricing_row = CityPricing.objects.filter(city_id=city_id, ride_type=ride_type.lower(), is_active=True).first()
    if pricing_row:
        if merged.get("base_fare") is None:
            merged["base_fare"] = pricing_row.base_fare
        if merged.get("distance_fare_per_km") is None:
            merged["distance_fare_per_km"] = pricing_row.per_km
        if merged.get("minimum_fare") is None:
            merged["minimum_fare"] = pricing_row.minimum_fare
    else:
        market = MARKET["fare"].get(ride_type.lower(), MARKET["fare"]["regular"])
        if merged.get("base_fare") is None:
            merged["base_fare"] = market["base"]
        if merged.get("distance_fare_per_km") is None:
            merged["distance_fare_per_km"] = market["per_km"]

    waiting = MARKET.get("waiting", {})
    if merged.get("waiting_fee_per_minute") is None:
        merged["waiting_fee_per_minute"] = waiting.get("per_minute_fee", Decimal("50"))
    return merged


def set_pricing_rules(payload: dict, city_id=None, ride_type: str | None = None, user=None) -> dict:
    all_rules = PlatformSetting.get_value(PRICING_RULES_KEY, {"default": DEFAULT_PRICING_RULES}) or {}
    if city_id is None and ride_type is None:
        default = {**get_pricing_rules(), **payload}
        all_rules["default"] = default
    elif ride_type:
        ride_types = dict(all_rules.get("ride_types") or {})
        current = ride_types.get(ride_type.lower(), {})
        ride_types[ride_type.lower()] = {**current, **payload}
        all_rules["ride_types"] = ride_types
    else:
        cities = dict(all_rules.get("cities") or {})
        current = cities.get(str(city_id), {})
        cities[str(city_id)] = {**current, **payload}
        all_rules["cities"] = cities
    PlatformSetting.set_value(PRICING_RULES_KEY, all_rules, user=user)
    _append_audit(
        "pricing_rules",
        f"Updated dynamic pricing rules",
        {"city_id": city_id, "ride_type": ride_type, "payload": payload},
        user=user,
    )
    return get_pricing_rules(city_id, ride_type or "regular")


def get_surge_config() -> dict:
    stored = PlatformSetting.get_value(SURGE_CONFIG_KEY, DEFAULT_SURGE_CONFIG) or {}
    return {**DEFAULT_SURGE_CONFIG, **stored}


def set_surge_config(payload: dict, user=None) -> dict:
    merged = {**get_surge_config(), **payload}
    PlatformSetting.set_value(SURGE_CONFIG_KEY, merged, user=user)
    _append_audit("surge_config", "Updated surge engine configuration", merged, user=user)
    return merged


def _is_night(now=None, night_hours=None) -> bool:
    now = now or timezone.localtime()
    start, end = night_hours or [22, 6]
    hour = now.hour
    if start > end:
        return hour >= start or hour < end
    return start <= hour < end


def _zone_excluded(zone: dict, excluded: list) -> bool:
    label = (zone.get("label") or "").lower()
    for item in excluded:
        needle = str(item).lower()
        if needle in label:
            return True
        if zone.get("lat") is not None and zone.get("lng") is not None:
            if needle == f"{zone['lat']},{zone['lng']}":
                return True
    return False


def build_surge_panel(city_id=None) -> dict:
    raw = build_surge_monitor(city_id=city_id)
    config = get_surge_config()
    max_mult = float(config.get("max_multiplier") or 2.5)
    excluded = config.get("excluded_zones") or []
    enabled = is_surge_enabled()

    zones = []
    for zone in raw.get("zones", []):
        if _zone_excluded(zone, excluded):
            continue
        multiplier = min(float(zone.get("suggested_surge_multiplier") or 1.0), max_mult)
        if not enabled:
            multiplier = 1.0
        zones.append(
            {
                **zone,
                "demand": zone.get("requests_last_hour", 0),
                "supply": zone.get("drivers_nearby", 0),
                "surge_multiplier": multiplier,
                "estimated_wait_seconds": zone.get("avg_wait_seconds", 0),
                "surge_active": enabled and multiplier > 1.0,
            }
        )

    return {
        "generated_at": raw.get("generated_at"),
        "surge_enabled": enabled,
        "config": config,
        "zones": zones,
        "summary": {
            **raw.get("summary", {}),
            "active_surge_zones": sum(1 for z in zones if z.get("surge_active")),
        },
    }


def calculate_dynamic_fare(
    *,
    distance_km,
    duration_minutes=0,
    waiting_minutes=0,
    ride_type="regular",
    city_id=None,
    pickup_label="",
    is_holiday=False,
    is_weather_event=False,
    is_special_event=False,
    surge_multiplier=1.0,
    use_engine: bool | None = None,
) -> dict:
    """Compute fare breakdown. Uses legacy pricing unless engine + dynamic pricing enabled."""
    use_engine = is_dynamic_pricing_enabled() if use_engine is None else use_engine
    rules = get_pricing_rules(city_id, ride_type)

    if not use_engine:
        base_total = calculate_fare(ride_type, distance_km)
        commission = calculate_app_fee(base_total)
        return {
            "engine": "legacy",
            "customer_price": _quantize(base_total),
            "driver_earnings": _quantize(base_total - commission),
            "company_commission": _quantize(commission),
            "surge_multiplier": 1.0,
            "breakdown": {
                "base_fare": _quantize(base_total),
                "distance_fare": "0.00",
                "time_fare": "0.00",
                "waiting_fee": "0.00",
                "surcharges": {},
            },
        }

    distance = Decimal(str(distance_km or 0))
    duration = Decimal(str(duration_minutes or 0))
    waiting = Decimal(str(waiting_minutes or 0))

    base = Decimal(str(rules["base_fare"]))
    distance_fare = distance * Decimal(str(rules["distance_fare_per_km"]))
    time_fare = duration * Decimal(str(rules.get("time_fare_per_minute") or 0))
    free_wait = Decimal(str(MARKET.get("waiting", {}).get("free_minutes", 3)))
    billable_wait = max(waiting - free_wait, Decimal("0"))
    waiting_fee = billable_wait * Decimal(str(rules["waiting_fee_per_minute"]))

    subtotal = base + distance_fare + time_fare + waiting_fee
    surcharges = {}
    pickup_lower = (pickup_label or "").lower()

    if any(k in pickup_lower for k in MARKET.get("rewards", {}).get("airport_keywords", [])):
        airport = Decimal(str(rules.get("airport_surcharge") or 0))
        if airport > 0:
            surcharges["airport"] = airport
            subtotal += airport

    if _is_night(night_hours=rules.get("night_hours")):
        pct = Decimal(str(rules.get("night_surcharge_pct") or 0))
        if pct > 0:
            amount = (subtotal * pct / Decimal("100")).quantize(Decimal("0.01"))
            surcharges["night"] = amount
            subtotal += amount

    for flag, key in ((is_holiday, "holiday"), (is_weather_event, "weather"), (is_special_event, "event")):
        if flag:
            pct = Decimal(str(rules.get(f"{key}_surcharge_pct") or 0))
            if pct > 0:
                amount = (subtotal * pct / Decimal("100")).quantize(Decimal("0.01"))
                surcharges[key] = amount
                subtotal += amount

    minimum = Decimal(str(rules.get("minimum_fare") or 0))
    subtotal = max(subtotal, minimum)

    mult = Decimal(str(surge_multiplier if is_surge_enabled() else 1.0))
    customer_price = (subtotal * mult).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    commission_rate = get_app_fee_percent()
    commission = (customer_price * commission_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    driver_earnings = customer_price - commission

    return {
        "engine": "smart",
        "customer_price": _quantize(customer_price),
        "driver_earnings": _quantize(driver_earnings),
        "company_commission": _quantize(commission),
        "surge_multiplier": float(mult),
        "breakdown": {
            "base_fare": _quantize(base),
            "distance_fare": _quantize(distance_fare),
            "time_fare": _quantize(time_fare),
            "waiting_fee": _quantize(waiting_fee),
            "surcharges": {k: _quantize(v) for k, v in surcharges.items()},
            "subtotal_before_surge": _quantize(subtotal),
        },
    }


def simulate_pricing(payload: dict, user=None) -> dict:
    result = calculate_dynamic_fare(
        distance_km=payload.get("distance_km", 0),
        duration_minutes=payload.get("duration_minutes", 0),
        waiting_minutes=payload.get("waiting_minutes", 0),
        ride_type=payload.get("ride_type", "regular"),
        city_id=payload.get("city_id"),
        pickup_label=payload.get("pickup_label", ""),
        is_holiday=bool(payload.get("is_holiday")),
        is_weather_event=bool(payload.get("is_weather_event")),
        is_special_event=bool(payload.get("is_special_event")),
        surge_multiplier=payload.get("surge_multiplier", 1.0),
        use_engine=bool(payload.get("use_engine", True)),
    )
    legacy = calculate_dynamic_fare(
        distance_km=payload.get("distance_km", 0),
        ride_type=payload.get("ride_type", "regular"),
        city_id=payload.get("city_id"),
        use_engine=False,
    )
    _append_audit(
        "pricing_simulation",
        "Pricing simulation (dry run)",
        {"input": payload, "result": result},
        user=user,
    )
    return {
        "simulation": True,
        "input": payload,
        "result": result,
        "legacy_comparison": legacy,
        "delta_customer_price": _quantize(
            Decimal(result["customer_price"]) - Decimal(legacy["customer_price"])
        ),
    }


def _period_start(period: str):
    now = timezone.now()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return now - timedelta(days=7)
    return now - timedelta(hours=24)


def build_dispatch_analytics(city_id=None, period: str = "today") -> dict:
    start = _period_start(period)
    rides = Ride.objects.filter(created_at__gte=start)
    logs = DispatchOfferLog.objects.filter(created_at__gte=start)
    if city_id:
        rides = rides.filter(city_id=city_id)
        logs = logs.filter(ride__city_id=city_id)

    offered = logs.filter(result="offered").count()
    accepted = logs.filter(result="accepted").count()
    declined = logs.filter(result="declined").count()
    expired = logs.filter(result="expired").count()
    no_driver = logs.filter(result="no_driver").count()

    avg_eta = logs.filter(eta_minutes__isnull=False).aggregate(v=Avg("eta_minutes"))["v"]
    avg_dispatch_seconds = None
    accepted_by_ride = {}
    for row in logs.filter(result="accepted").values("ride_id", "created_at").order_by("ride_id", "created_at"):
        if row["ride_id"] not in accepted_by_ride:
            accepted_by_ride[row["ride_id"]] = row["created_at"]

    dispatch_samples = []
    for ride in rides.filter(status__in=["completed", "driver_arriving", "driver_arrived", "in_progress"]).only(
        "id", "created_at"
    )[:200]:
        accepted_at = accepted_by_ride.get(ride.id)
        if accepted_at:
            dispatch_samples.append((accepted_at - ride.created_at).total_seconds())
    if dispatch_samples:
        avg_dispatch_seconds = round(sum(dispatch_samples) / len(dispatch_samples), 1)

    completed = rides.filter(status="completed")
    fleet = build_fleet_overview(city_id=city_id)
    online = fleet.get("online_drivers", 0) + fleet.get("busy_drivers", 0)
    busy = fleet.get("busy_drivers", 0)
    utilization = round((busy / online) * 100, 1) if online else 0.0

    idle_profiles = []
    from taxi.drivers.models import DriverProfile

    profiles = DriverProfile.objects.filter(status="approved", is_available=True)
    if city_id:
        profiles = profiles.filter(user__city_id=city_id)
    now = timezone.now()
    for profile in profiles[:500]:
        if profile.available_since:
            idle_profiles.append((now - profile.available_since).total_seconds() / 60.0)
    avg_idle_minutes = round(sum(idle_profiles) / len(idle_profiles), 1) if idle_profiles else 0.0

    acceptance_rate = round((accepted / offered) * 100, 1) if offered else 0.0

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "avg_pickup_eta_minutes": round(avg_eta, 1) if avg_eta is not None else None,
        "avg_dispatch_time_seconds": avg_dispatch_seconds,
        "acceptance_rate_pct": acceptance_rate,
        "rejected_requests": declined + expired,
        "declined_offers": declined,
        "expired_offers": expired,
        "no_driver_events": no_driver,
        "driver_utilization_pct": utilization,
        "avg_idle_minutes": avg_idle_minutes,
        "completed_rides": completed.count(),
        "total_offers": offered,
    }


def build_ceo_dashboard(city_id=None, period: str = "week") -> dict:
    start = _period_start(period)
    rides = Ride.objects.filter(status="completed", completed_at__gte=start)
    ride_ids = list(rides.values_list("id", flat=True))
    payments = Payment.objects.filter(status="paid", ride_id__in=ride_ids) if ride_ids else Payment.objects.none()
    if city_id:
        rides = rides.filter(city_id=city_id)
        ride_ids = list(rides.values_list("id", flat=True))
        payments = Payment.objects.filter(status="paid", ride_id__in=ride_ids) if ride_ids else Payment.objects.none()

    revenue = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    driver_earnings = payments.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
    ride_count = rides.count()
    avg_fare = (revenue / ride_count) if ride_count else Decimal("0")
    profit_per_ride = (commission / ride_count) if ride_count else Decimal("0")

    surge_rows = SurgeHistory.objects.filter(created_at__gte=start)
    if city_id:
        surge_rows = surge_rows.filter(ride__city_id=city_id)
    surge_revenue = surge_rows.aggregate(total=Sum("surge_fare"))["total"] or Decimal("0")

    analytics = build_dispatch_analytics(city_id=city_id, period=period)
    flags = get_engine_flags()

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "engine_enabled": flags.get("enabled"),
        "revenue_impact": {
            "total_revenue": _dec(revenue),
            "platform_commission": _dec(commission),
            "driver_payouts": _dec(driver_earnings),
            "completed_rides": ride_count,
        },
        "dispatch_efficiency": {
            "avg_dispatch_time_seconds": analytics.get("avg_dispatch_time_seconds"),
            "acceptance_rate_pct": analytics.get("acceptance_rate_pct"),
            "avg_pickup_eta_minutes": analytics.get("avg_pickup_eta_minutes"),
            "driver_utilization_pct": analytics.get("driver_utilization_pct"),
        },
        "surge_revenue": _dec(surge_revenue),
        "average_fare": _dec(avg_fare),
        "profit_per_ride": _dec(profit_per_ride),
        "driver_utilization_pct": analytics.get("driver_utilization_pct"),
    }


def build_smart_engine_dashboard(city_id=None) -> dict:
    from .cache_utils import cached_ops_call

    def _build():
        dispatch_insights = build_smart_dispatch_insights(city_id=city_id)
        surge = build_surge_panel(city_id=city_id)
        analytics = build_dispatch_analytics(city_id=city_id)
        pricing_rules = get_pricing_rules(city_id)
        dispatch_rules = get_dispatch_rules(city_id)

        cities = list(City.objects.filter(is_active=True).order_by("name").values("id", "name"))

        return {
            "generated_at": timezone.now().isoformat(),
            "engine_flags": get_engine_flags(),
            "dispatch_rules": dispatch_rules,
            "pricing_rules": {
                k: _quantize(v) if isinstance(v, Decimal) else v for k, v in pricing_rules.items()
            },
            "surge": surge,
            "dispatch_insights": dispatch_insights,
            "dispatch_analytics": analytics,
            "cities": cities,
            "audit_trail": get_audit_trail(limit=25),
        }

    return cached_ops_call("smart_engine_dashboard", _build, city_id=city_id)


def get_audit_trail(limit: int = 50) -> list[dict]:
    trail = PlatformSetting.get_value(AUDIT_KEY, {"entries": []}) or {"entries": []}
    return list(trail.get("entries") or [])[:limit]
