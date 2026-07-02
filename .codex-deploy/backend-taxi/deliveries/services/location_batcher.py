"""Throttle high-frequency courier location websocket broadcasts."""

import time

from django.conf import settings
from django.core.cache import cache

from ..geo import haversine_km

CACHE_PREFIX = "delivery:loc:"
DEFAULT_TTL_SECONDS = 120


def _min_interval():
    return max(int(getattr(settings, "DELIVERY_LOCATION_MIN_INTERVAL_SECONDS", 15)), 5)


def _min_distance_km():
    meters = max(int(getattr(settings, "DELIVERY_LOCATION_MIN_DISTANCE_METERS", 50)), 10)
    return meters / 1000.0


def should_broadcast_location(delivery_id: int, lat: float, lng: float) -> bool:
    """Return True when enough time or distance has passed to broadcast again."""
    key = f"{CACHE_PREFIX}{delivery_id}"
    previous = cache.get(key)
    now = time.time()

    if not previous:
        cache.set(
            key,
            {"lat": lat, "lng": lng, "ts": now},
            timeout=DEFAULT_TTL_SECONDS,
        )
        return True

    moved_km = haversine_km(previous["lat"], previous["lng"], lat, lng)
    elapsed = now - float(previous.get("ts", 0))
    if moved_km >= _min_distance_km() or elapsed >= _min_interval():
        cache.set(
            key,
            {"lat": lat, "lng": lng, "ts": now},
            timeout=DEFAULT_TTL_SECONDS,
        )
        return True

    return False
