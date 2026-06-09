import hashlib
import logging
import math
import time

from django.conf import settings
from django.core.cache import cache


logger = logging.getLogger("yala.abuse")


def client_ip(request):
    if getattr(settings, "YALA_TRUST_X_FORWARDED_FOR", False):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def rate_limit(request, scope, limit, window_seconds, identity=None):
    """Return retry-after seconds when a fixed-window abuse limit is exceeded."""
    identity = identity or (
        f"user:{request.user.pk}"
        if getattr(request, "user", None) and request.user.is_authenticated
        else f"ip:{client_ip(request)}"
    )
    digest = hashlib.sha256(str(identity).encode("utf-8")).hexdigest()[:24]
    bucket = int(time.time() // window_seconds)
    key = f"abuse:{scope}:{digest}:{bucket}"

    if cache.add(key, 1, timeout=window_seconds + 5):
        count = 1
    else:
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=window_seconds + 5)
            count = 1

    if count <= limit:
        return 0

    retry_after = max(1, window_seconds - int(time.time() % window_seconds))
    logger.warning("Rate limit exceeded: scope=%s identity=%s", scope, digest)
    return retry_after


def _haversine_km(lat1, lng1, lat2, lng2):
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    value = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lng / 2) ** 2
    )
    value = min(1.0, max(0.0, value))
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def validate_coordinates(lat, lng, enforce_service_area=True):
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        raise ValueError("Latitude and longitude must be valid numbers.")

    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise ValueError("Latitude or longitude is outside valid GPS bounds.")

    if enforce_service_area:
        bounds = getattr(
            settings,
            "YALA_SERVICE_AREA_BOUNDS",
            {"min_lat": 17.75, "max_lat": 18.40, "min_lng": -16.35, "max_lng": -15.65},
        )
        if not (
            bounds["min_lat"] <= lat <= bounds["max_lat"]
            and bounds["min_lng"] <= lng <= bounds["max_lng"]
        ):
            raise ValueError("Location is outside Yala's current service area.")

    return lat, lng


def validate_driver_location(profile, lat, lng):
    if profile.status != "approved":
        raise ValueError("Only approved drivers can update their location.")

    lat, lng = validate_coordinates(lat, lng)
    now = time.time()
    key = f"driver-location:{profile.user_id}"
    previous = cache.get(key)

    if previous:
        elapsed_hours = max((now - previous["time"]) / 3600, 1 / 3600)
        distance_km = _haversine_km(previous["lat"], previous["lng"], lat, lng)
        speed_kmh = distance_km / elapsed_hours
        max_speed = getattr(settings, "YALA_MAX_DRIVER_SPEED_KMH", 180)

        if speed_kmh > max_speed:
            logger.warning(
                "Implausible driver GPS movement: driver=%s speed_kmh=%.1f",
                profile.user_id,
                speed_kmh,
            )
            raise ValueError("Location update was rejected because the movement is not plausible.")

    cache.set(key, {"lat": lat, "lng": lng, "time": now}, timeout=3600)
    return lat, lng
