"""
Rules-based smart driver matching for ride offers.

Ranks eligible online drivers by distance/ETA (highest weight), rating,
acceptance, cancellations, level, and fair rotation — then expands search
radius when the current ring has no candidates.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from taxi.drivers.models import DriverProfile

logger = logging.getLogger(__name__)

DRIVER_ACTIVE_STATUSES = ["driver_arriving", "driver_arrived", "in_progress"]

# Expanding search rings (km). Final ring uses city/service-area limit.
SEARCH_RADIUS_KM = (2.0, 5.0, 10.0)
DEFAULT_CITY_RADIUS_KM = 25.0
AVG_CITY_SPEED_KMH = 28.0

LEVEL_SCORE = {
    "bronze": 0.55,
    "silver": 0.7,
    "gold": 0.85,
    "platinum": 0.95,
    "elite": 1.0,
}

RIDE_TYPE_TO_CAR = {
    "regular": "regular",
    "xl": "xl",
    "comfort": "comfort",
    "share": "share",
}

# Allowed car_type values that may serve each ride_type (inclusive upward).
VEHICLE_COMPATIBILITY = {
    "regular": {"regular", "comfort", "xl", ""},
    "comfort": {"comfort", "xl"},
    "xl": {"xl"},
    "share": {"share", "regular", ""},
}


@dataclass
class RankedDriver:
    profile: DriverProfile
    distance_km: float
    eta_minutes: float
    score: float
    breakdown: dict = field(default_factory=dict)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def city_search_radius_km() -> float:
    return float(
        getattr(settings, "YALA_DISPATCH_CITY_RADIUS_KM", DEFAULT_CITY_RADIUS_KM)
    )


def radius_for_round(dispatch_round: int) -> float:
    """1-based round → radius km (1=2, 2=5, 3=10, 4+=city)."""
    round_idx = max(1, int(dispatch_round or 1)) - 1
    if round_idx < len(SEARCH_RADIUS_KM):
        return SEARCH_RADIUS_KM[round_idx]
    return city_search_radius_km()


def max_dispatch_round() -> int:
    return len(SEARCH_RADIUS_KM) + 1


def normalize_ride_type(ride_type: Optional[str]) -> str:
    return (ride_type or "Regular").strip().lower()


def vehicle_matches(ride_type: Optional[str], car_type: Optional[str]) -> bool:
    ride_key = RIDE_TYPE_TO_CAR.get(normalize_ride_type(ride_type), "regular")
    car_key = (car_type or "regular").strip().lower()
    allowed = VEHICLE_COMPATIBILITY.get(ride_key, {"regular"})
    return car_key in allowed or (not car_key and "" in allowed)


def driver_in_service_area(lat: Optional[float], lng: Optional[float]) -> bool:
    if lat is None or lng is None:
        return False
    bounds = getattr(
        settings,
        "YALA_SERVICE_AREA_BOUNDS",
        {
            "min_lat": 17.75,
            "max_lat": 18.40,
            "min_lng": -16.35,
            "max_lng": -15.65,
        },
    )
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return False
    return (
        bounds["min_lat"] <= lat_f <= bounds["max_lat"]
        and bounds["min_lng"] <= lng_f <= bounds["max_lng"]
    )


def driver_documents_ok(profile: DriverProfile) -> bool:
    """Re-check required docs; online drivers normally already passed go-online."""
    try:
        from taxi.drivers.services.document_service import DocumentService

        state = DocumentService().get_documents_review_state(profile)
        return not state.get("documents_block_online")
    except Exception:
        logger.exception(
            "Document eligibility check failed for driver %s", profile.user_id
        )
        return False


def _cancellation_rate(profile: DriverProfile) -> float:
    completed = max(int(profile.total_rides_completed or 0), 0)
    cancelled = max(int(profile.total_rides_cancelled or 0), 0)
    denom = completed + cancelled
    if denom <= 0:
        return 0.0
    return cancelled / denom


def _rating_score(profile: DriverProfile) -> float:
    """New drivers (no ratings) get a neutral mid score — not excluded."""
    rating = float(profile.average_rating or 0)
    if rating <= 0:
        return 0.75
    return max(0.0, min(rating / 5.0, 1.0))


def _acceptance_score(profile: DriverProfile) -> float:
    points = float(profile.acceptance_rate_points or 0)
    return max(0.0, min(points / 100.0, 1.0))


def _distance_score(distance_km: float, radius_km: float) -> float:
    if distance_km <= 0:
        return 1.0
    cap = max(radius_km, 0.5)
    return max(0.0, 1.0 - (distance_km / cap))


def _fairness_score(profile: DriverProfile, now) -> float:
    """Prefer drivers waiting longest online and with fewer recent offers."""
    waiting = 0.0
    if profile.available_since:
        waiting_minutes = max((now - profile.available_since).total_seconds() / 60.0, 0)
        waiting = min(waiting_minutes / 60.0, 1.0)  # saturate at 60 min

    offers = float(profile.total_rides_received or 0)
    # Soft dampening so high-volume drivers don't always win ties
    offer_fairness = 1.0 / (1.0 + offers / 20.0)
    missed = float(profile.total_rides_missed or 0)
    miss_penalty = max(0.0, 1.0 - (missed / 30.0))
    return 0.5 * waiting + 0.35 * offer_fairness + 0.15 * miss_penalty


def _resolve_scoring_weights(city_id=None) -> dict:
    """Use smart-engine weights when feature-flagged; else built-in defaults."""
    try:
        from operations.smart_pricing_dispatch_service import resolve_dispatch_weights

        return resolve_dispatch_weights(city_id)
    except Exception:
        return {
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


def score_driver(
    profile: DriverProfile,
    *,
    distance_km: float,
    radius_km: float,
    now=None,
    ride_type: Optional[str] = None,
    city_id: Optional[int] = None,
) -> RankedDriver:
    now = now or timezone.now()
    avg_speed = AVG_CITY_SPEED_KMH
    try:
        from operations.smart_pricing_dispatch_service import get_dispatch_rules, is_smart_dispatch_enabled

        if is_smart_dispatch_enabled():
            rules = get_dispatch_rules(city_id)
            avg_speed = float(rules.get("avg_city_speed_kmh") or AVG_CITY_SPEED_KMH)
    except Exception:
        pass

    eta_minutes = (distance_km / max(avg_speed, 1.0)) * 60.0

    dist_s = _distance_score(distance_km, radius_km)
    # ETA mirrors distance; keep a separate light weight for clarity in logs
    eta_s = _distance_score(distance_km, radius_km)
    rating_s = _rating_score(profile)
    accept_s = _acceptance_score(profile)
    cancel_s = max(0.0, 1.0 - _cancellation_rate(profile))
    level_s = LEVEL_SCORE.get((profile.driver_level or "bronze").lower(), 0.55)
    fair_s = _fairness_score(profile, now)
    vehicle_s = 1.0 if vehicle_matches(ride_type, profile.car_type) else 0.0
    idle_minutes = (
        max((now - profile.available_since).total_seconds() / 60.0, 0)
        if profile.available_since
        else 0.0
    )
    idle_s = min(idle_minutes / 60.0, 1.0)
    traffic_s = 1.0

    weights = _resolve_scoring_weights(city_id)
    score = (
        weights.get("distance", 0.40) * dist_s
        + weights.get("eta", 0.15) * eta_s
        + weights.get("rating", 0.12) * rating_s
        + weights.get("acceptance", 0.10) * accept_s
        + weights.get("cancellation", 0.08) * cancel_s
        + weights.get("level", 0.05) * level_s
        + weights.get("fairness", 0.10) * fair_s
        + weights.get("vehicle_match", 0.0) * vehicle_s
        + weights.get("idle_time", 0.0) * idle_s
        + weights.get("traffic_factor", 0.0) * traffic_s
    )

    breakdown = {
        "distance": round(dist_s, 4),
        "eta": round(eta_s, 4),
        "rating": round(rating_s, 4),
        "acceptance": round(accept_s, 4),
        "cancellation": round(cancel_s, 4),
        "level": round(level_s, 4),
        "fairness": round(fair_s, 4),
        "vehicle_match": round(vehicle_s, 4),
        "idle_time": round(idle_s, 4),
        "online_minutes": round(idle_minutes, 1),
        "traffic": round(traffic_s, 4),
        "total": round(score, 4),
    }
    return RankedDriver(
        profile=profile,
        distance_km=round(distance_km, 3),
        eta_minutes=round(eta_minutes, 1),
        score=round(score, 4),
        breakdown=breakdown,
    )


def base_eligible_queryset(ride, excluded_user_ids: Optional[list[int]] = None):
    from taxi.rides.models import Ride

    active_driver_ids = Ride.objects.filter(
        status__in=DRIVER_ACTIVE_STATUSES,
        driver__isnull=False,
    ).values_list("driver_id", flat=True)

    profiles = (
        DriverProfile.objects.filter(
            status="approved",
            is_available=True,
            user__is_active=True,
            account_under_review=False,
        )
        .exclude(user_id__in=active_driver_ids)
        .select_related("user")
    )

    if ride.city_id:
        profiles = profiles.filter(
            Q(user__city_id=ride.city_id) | Q(user__city__isnull=True)
        )

    excluded = set(excluded_user_ids or [])
    if ride.declined_driver_ids:
        excluded.update(ride.declined_driver_ids)
    if excluded:
        profiles = profiles.exclude(user_id__in=excluded)

    return profiles


def rank_eligible_drivers(
    ride,
    *,
    radius_km: float,
    excluded_user_ids: Optional[list[int]] = None,
    require_documents: bool = True,
) -> list[RankedDriver]:
    """Return drivers inside radius, sorted by score descending."""
    pickup_lat = float(ride.pickup_lat)
    pickup_lng = float(ride.pickup_lng)
    now = timezone.now()
    ranked: list[RankedDriver] = []

    for profile in base_eligible_queryset(ride, excluded_user_ids):
        lat = profile.current_lat
        lng = profile.current_lng
        if not driver_in_service_area(lat, lng):
            continue
        if not vehicle_matches(ride.ride_type, profile.car_type):
            continue
        if require_documents and not driver_documents_ok(profile):
            continue

        distance = haversine_km(float(lat), float(lng), pickup_lat, pickup_lng)
        if distance > radius_km:
            continue

        ranked.append(
            score_driver(
                profile,
                distance_km=distance,
                radius_km=radius_km,
                now=now,
                ride_type=ride.ride_type,
                city_id=getattr(ride, "city_id", None),
            )
        )

    ranked.sort(
        key=lambda item: (
            -item.score,
            item.distance_km,
            item.profile.total_rides_received or 0,
            item.profile.id,
        )
    )
    return ranked


def select_best_driver(
    ride,
    *,
    dispatch_round: int = 1,
    excluded_user_ids: Optional[list[int]] = None,
    require_documents: bool = True,
) -> tuple[Optional[RankedDriver], float, int]:
    """
    Find best driver for the current round, expanding rounds until found or exhausted.

    Returns (ranked_driver_or_None, radius_km_used, final_round).
    """
    round_no = max(1, int(dispatch_round or 1))
    last_radius = radius_for_round(round_no)

    while round_no <= max_dispatch_round():
        last_radius = radius_for_round(round_no)
        candidates = rank_eligible_drivers(
            ride,
            radius_km=last_radius,
            excluded_user_ids=excluded_user_ids,
            require_documents=require_documents,
        )
        if candidates:
            return candidates[0], last_radius, round_no
        round_no += 1

    return None, last_radius, max_dispatch_round()


def explain_ranked_driver(ranked: RankedDriver, ride_type: Optional[str] = None) -> dict:
    """Human-readable explanation for why a driver was selected."""
    profile = ranked.profile
    breakdown = ranked.breakdown or {}
    reasons = []

    if ranked.distance_km <= 1:
        reasons.append(f"Closest available driver ({ranked.distance_km} km from pickup).")
    else:
        reasons.append(f"Within search radius at {ranked.distance_km} km ({ranked.eta_minutes} min ETA).")

    rating = float(profile.average_rating or 0)
    if rating >= 4.5:
        reasons.append(f"Strong rider rating ({rating:.1f}/5).")
    elif rating > 0:
        reasons.append(f"Rider rating {rating:.1f}/5.")

    accept_pts = profile.acceptance_rate_points or 0
    if accept_pts >= 90:
        reasons.append(f"High acceptance rate ({accept_pts}%).")

    cancel_rate = _cancellation_rate(profile)
    if cancel_rate <= 0.05:
        reasons.append("Low cancellation history.")
    elif cancel_rate > 0.2:
        reasons.append(f"Moderate cancellation rate ({cancel_rate * 100:.0f}%) — still best match.")

    online_min = breakdown.get("online_minutes") or 0
    if online_min >= 30:
        reasons.append(f"Online for {int(online_min)} minutes (fairness boost).")

    if vehicle_matches(ride_type, profile.car_type):
        reasons.append(f"Vehicle type '{profile.car_type or 'regular'}' matches ride request.")

    reasons.append("Traffic overlay not available — ETA uses average city speed.")

    weights = {
        "distance": 0.40,
        "eta": 0.15,
        "rating": 0.12,
        "acceptance": 0.10,
        "cancellation": 0.08,
        "level": 0.05,
        "fairness": 0.10,
    }
    factor_contributions = []
    for key, weight in weights.items():
        value = breakdown.get(key)
        if value is not None:
            factor_contributions.append(
                {"factor": key, "weight": weight, "score": value, "contribution": round(weight * value, 4)}
            )
    factor_contributions.sort(key=lambda item: item["contribution"], reverse=True)

    return {
        "driver_id": profile.user_id,
        "driver_name": profile.user.get_full_name() or profile.user.email,
        "total_score": ranked.score,
        "distance_km": ranked.distance_km,
        "eta_minutes": ranked.eta_minutes,
        "breakdown": breakdown,
        "top_factors": factor_contributions[:5],
        "reasons": reasons,
    }
