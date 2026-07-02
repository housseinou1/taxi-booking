"""Geospatial helpers for delivery ETA and courier ranking."""

import math


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance in kilometers."""
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def estimate_travel_minutes(distance_km: float, avg_speed_kmh: float = 28.0) -> int:
    """Estimate travel time from distance."""
    distance = max(float(distance_km or 0), 0.1)
    minutes = (distance / avg_speed_kmh) * 60
    return max(3, int(round(minutes)))


def estimate_delivery_duration_minutes(distance_km: float, service_category: str = "package") -> int:
    """Estimate total delivery duration including pickup and handoff."""
    travel = estimate_travel_minutes(distance_km)
    category = (service_category or "package").lower()
    if category in ("food", "restaurant"):
        return travel + 8
    if category == "pharmacy":
        return travel + 10
    if category in ("grocery", "shopping", "market"):
        return travel + 15
    return travel + 12


def eta_minutes_to_target(
    courier_lat: float,
    courier_lng: float,
    target_lat: float,
    target_lng: float,
) -> int:
    """ETA from courier position to a target coordinate."""
    distance = haversine_km(courier_lat, courier_lng, target_lat, target_lng)
    return estimate_travel_minutes(distance)
