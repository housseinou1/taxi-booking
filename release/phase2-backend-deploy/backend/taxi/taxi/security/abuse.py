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


def increment_abuse_counter(scope, identity, limit, window_seconds):
    """Increment a counter and return retry-after seconds when limit is exceeded."""
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
    logger.warning("Abuse counter exceeded: scope=%s identity=%s", scope, digest)
    return retry_after


def is_abuse_locked(scope, identity, limit, window_seconds):
    """Return retry-after seconds when the abuse counter is at or above limit."""
    digest = hashlib.sha256(str(identity).encode("utf-8")).hexdigest()[:24]
    bucket = int(time.time() // window_seconds)
    key = f"abuse:{scope}:{digest}:{bucket}"
    count = cache.get(key, 0) or 0
    if count < limit:
        return 0
    return max(1, window_seconds - int(time.time() % window_seconds))


PIN_ATTEMPT_LIMIT = 5
PIN_ATTEMPT_WINDOW_SECONDS = 600

CANCEL_ABUSE_LIMIT = 3
CANCEL_ABUSE_WINDOW_SECONDS = 86400  # 24 hours

MULTI_ACCOUNT_DEVICE_LIMIT = 3


def record_cancellation(user_id):
    """Increment per-user ride/delivery cancellation counter. Returns True if abuse threshold exceeded."""
    identity = f"user:{user_id}"
    retry = increment_abuse_counter("cancellation", identity, CANCEL_ABUSE_LIMIT, CANCEL_ABUSE_WINDOW_SECONDS)
    return retry > 0


def check_device_multi_account(device_id):
    """Return True if a single device_id has been used to register/login > MULTI_ACCOUNT_DEVICE_LIMIT accounts."""
    if not device_id:
        return False
    digest = hashlib.sha256(str(device_id).encode()).hexdigest()[:24]
    key = f"device-accounts:{digest}"
    count = cache.get(key, 0) or 0
    return count >= MULTI_ACCOUNT_DEVICE_LIMIT


def record_device_account(device_id):
    """Increment unique-accounts-per-device counter (TTL = 30 days)."""
    if not device_id:
        return
    digest = hashlib.sha256(str(device_id).encode()).hexdigest()[:24]
    key = f"device-accounts:{digest}"
    if not cache.add(key, 1, timeout=2592000):
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=2592000)


def pin_lockout_retry(scope, identity):
    return is_abuse_locked(scope, identity, PIN_ATTEMPT_LIMIT, PIN_ATTEMPT_WINDOW_SECONDS)


def record_pin_failure(scope, identity):
    return increment_abuse_counter(
        scope,
        identity,
        PIN_ATTEMPT_LIMIT,
        PIN_ATTEMPT_WINDOW_SECONDS,
    )


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
            try:
                from security.services.fraud_service import flag_fake_location

                flag_fake_location(profile.user, speed_kmh=speed_kmh, distance_km=distance_km)
            except Exception:
                logger.exception("Failed to create fake_location fraud flag for driver=%s", profile.user_id)
            raise ValueError("Location update was rejected because the movement is not plausible.")

    cache.set(key, {"lat": lat, "lng": lng, "time": now}, timeout=3600)
    return lat, lng
