"""Lyft-style rider no-show cancellation helpers."""

from __future__ import annotations

import math
from decimal import Decimal

from django.utils import timezone

from app_settings.pricing_service import (
    get_ride_no_show_policy,
    get_ride_waiting_policy,
)

# Canonical reason for Lyft-style rider no-show (plus nearby legacy aliases).
NO_SHOW_REASON_KEYS = {
    "rider no-show",
    "rider not answering calls",
    "wrong pickup / cannot locate rider",
    "rider refused to board",
    "rider not available",
    "waited too long",
    "wrong pickup location",
}

CANONICAL_NO_SHOW_REASON = "Rider no-show"


def normalize_cancel_reason(reason: str) -> str:
    return " ".join(str(reason or "").strip().lower().split())


def is_no_show_reason(reason: str) -> bool:
    return normalize_cancel_reason(reason) in NO_SHOW_REASON_KEYS


def waited_seconds_after_arrival(ride, at=None) -> int:
    if not getattr(ride, "driver_arrived_at", None):
        return 0
    reference = at or timezone.now()
    return max(0, int((reference - ride.driver_arrived_at).total_seconds()))


def free_wait_seconds(ride=None) -> int:
    return int(get_ride_waiting_policy(ride)["free_minutes"]) * 60


def max_wait_seconds(ride=None) -> int:
    policy = get_ride_waiting_policy(ride)
    return int(policy.get("max_wait_minutes", policy["free_minutes"])) * 60


def no_show_max_distance_m(ride=None) -> float:
    return float(get_ride_waiting_policy(ride).get("no_show_max_distance_m", 150))


def arrive_max_distance_m(ride=None) -> float:
    return float(get_ride_waiting_policy(ride).get("arrive_max_distance_m", 350))


def get_no_show_fee_policy(ride=None) -> dict:
    policy = get_ride_no_show_policy(ride)
    return {
        "rider_fee": Decimal(str(policy["rider_fee"])),
        "driver_compensation": Decimal(str(policy["driver_compensation"])),
    }


def haversine_meters(lat1, lng1, lat2, lng2) -> float:
    """Great-circle distance in meters."""
    a = _parse_geo_coord(lat1, lng1)
    b = _parse_geo_coord(lat2, lng2)
    if not a or not b:
        return float("inf")
    lat1, lng1 = a
    lat2, lng2 = b
    radius_m = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a_val = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius_m * math.atan2(math.sqrt(a_val), math.sqrt(1 - a_val))


def _parse_geo_coord(lat, lng):
    """Return (lat, lng) floats or None. Corrects common lat/lng swap."""
    if lat is None or lng is None or lat == "" or lng == "":
        return None
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None

    if abs(lat_f) > 90 and abs(lng_f) <= 90:
        lat_f, lng_f = lng_f, lat_f
    elif lat_f < 0 and lat_f > -25 and lng_f > 0 and lng_f < 30 and abs(lat_f) < 25:
        lat_f, lng_f = lng_f, lat_f

    if abs(lat_f) > 90 or abs(lng_f) > 180:
        return None
    if lat_f == 0 and lng_f == 0:
        return None
    return lat_f, lng_f


def distance_to_pickup_m(ride, lat, lng):
    pickup = _parse_geo_coord(ride.pickup_lat, ride.pickup_lng)
    driver = _parse_geo_coord(lat, lng)
    if not pickup or not driver:
        return None
    return haversine_meters(driver[0], driver[1], pickup[0], pickup[1])


def evaluate_no_show_eligibility(
    ride,
    reason: str,
    *,
    driver_lat=None,
    driver_lng=None,
    at=None,
) -> tuple[bool, dict]:
    """Return (eligible, details) for a Lyft-style rider no-show cancel.

    Requirements:
    - Reason is a no-show reason
    - Ride is driver_arrived with an arrival timestamp
    - Max wait timer has expired (after free wait + billable window)
    - Driver GPS is within no_show_max_distance_m of pickup
    """
    waited = waited_seconds_after_arrival(ride, at=at)
    free_secs = free_wait_seconds(ride)
    max_secs = max_wait_seconds(ride)
    max_dist = no_show_max_distance_m(ride)
    calls = int(getattr(ride, "rider_call_attempt_count", 0) or 0)

    has_coords = driver_lat is not None and driver_lng is not None
    distance_m = (
        distance_to_pickup_m(ride, driver_lat, driver_lng) if has_coords else None
    )
    gps_ok = has_coords and distance_m is not None and distance_m <= max_dist

    details = {
        "is_no_show_reason": is_no_show_reason(reason),
        "status_ok": ride.status == "driver_arrived",
        "waited_seconds": waited,
        "free_wait_seconds": free_secs,
        "max_wait_seconds": max_secs,
        "wait_ok": waited >= max_secs,
        "billing_started": waited > free_secs,
        "call_attempts": calls,
        "driver_lat": driver_lat,
        "driver_lng": driver_lng,
        "distance_to_pickup_m": round(distance_m, 1) if distance_m is not None else None,
        "max_distance_m": max_dist,
        "gps_ok": gps_ok,
        "gps_provided": has_coords,
    }
    eligible = (
        details["is_no_show_reason"]
        and details["status_ok"]
        and details["wait_ok"]
        and details["gps_ok"]
    )
    details["eligible"] = eligible
    if not details["is_no_show_reason"]:
        details["block_reason"] = "not_no_show_reason"
    elif not details["status_ok"]:
        details["block_reason"] = "must_arrive_first"
    elif not details["wait_ok"]:
        details["block_reason"] = "max_wait_not_reached"
    elif not details["gps_provided"]:
        details["block_reason"] = "gps_required"
    elif not details["gps_ok"]:
        details["block_reason"] = "too_far_from_pickup"
    else:
        details["block_reason"] = None
    return eligible, details


# Back-compat alias used by older imports/tests.
def no_show_waiver_eligible(ride, reason: str, at=None, **kwargs) -> tuple[bool, dict]:
    return evaluate_no_show_eligibility(
        ride,
        reason,
        driver_lat=kwargs.get("driver_lat"),
        driver_lng=kwargs.get("driver_lng"),
        at=at,
    )
