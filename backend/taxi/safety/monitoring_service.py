"""Trip safety monitoring: location pings, long stops, route deviation, safety checks."""

from __future__ import annotations

import math
from datetime import timedelta

from django.utils import timezone

from security.services.audit_service import log_audit

from .models import TripLocationPing, TripSafetyEvent

ACTIVE_RIDE_STATUSES = {
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
}

LONG_STOP_MINUTES = 8
LONG_STOP_RADIUS_METERS = 120
ROUTE_DEVIATION_KM = 2.5
SAFETY_CHECK_COOLDOWN_MINUTES = 20


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _open_event_exists(ride_id, user_id, event_type: str) -> bool:
    return TripSafetyEvent.objects.filter(
        ride_id=ride_id,
        user_id=user_id,
        event_type=event_type,
        status="open",
        created_at__gte=timezone.now() - timedelta(minutes=SAFETY_CHECK_COOLDOWN_MINUTES),
    ).exists()


def record_trip_ping(ride, user, *, latitude, longitude, accuracy=None, speed_mps=None):
    ping = TripLocationPing.objects.create(
        ride=ride,
        user=user,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=accuracy,
        speed_mps=speed_mps,
    )
    event = evaluate_trip_safety(ride, user, latitude, longitude)
    return ping, event


def evaluate_trip_safety(ride, user, latitude, longitude):
    if ride.status not in ACTIVE_RIDE_STATUSES:
        return None

    now = timezone.now()
    recent_pings = list(
        TripLocationPing.objects.filter(
            ride=ride,
            recorded_at__gte=now - timedelta(minutes=LONG_STOP_MINUTES + 2),
        ).order_by("recorded_at")[:40]
    )
    if len(recent_pings) >= 3:
        anchor = recent_pings[0]
        stopped = all(
            _haversine_km(anchor.latitude, anchor.longitude, ping.latitude, ping.longitude)
            * 1000
            <= LONG_STOP_RADIUS_METERS
            for ping in recent_pings[-3:]
        )
        span_minutes = (recent_pings[-1].recorded_at - recent_pings[0].recorded_at).total_seconds() / 60
        if stopped and span_minutes >= LONG_STOP_MINUTES and not _open_event_exists(
            ride.id, user.id, "long_stop"
        ):
            return _create_event(
                ride,
                user,
                "long_stop",
                "Trip paused longer than expected. Are you safe?",
                latitude,
                longitude,
                {"stop_minutes": round(span_minutes, 1)},
            )

    dest_lat = ride.destination_lat
    dest_lng = ride.destination_lng
    pickup_lat = ride.pickup_lat
    pickup_lng = ride.pickup_lng
    if None not in (latitude, longitude, dest_lat, dest_lng, pickup_lat, pickup_lng):
        direct_km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
        traveled_km = _haversine_km(pickup_lat, pickup_lng, latitude, longitude)
        off_route_km = _haversine_km(latitude, longitude, dest_lat, dest_lng)
        if (
            ride.status == "in_progress"
            and direct_km > 1
            and traveled_km > direct_km * 0.35
            and off_route_km > ROUTE_DEVIATION_KM
            and not _open_event_exists(ride.id, user.id, "route_deviation")
        ):
            return _create_event(
                ride,
                user,
                "route_deviation",
                "Your route looks unusual. Are you safe?",
                latitude,
                longitude,
                {"off_route_km": round(off_route_km, 2)},
            )
    return None


def _create_event(ride, user, event_type, message, latitude, longitude, metadata=None):
    event = TripSafetyEvent.objects.create(
        ride=ride,
        user=user,
        event_type=event_type,
        message=message,
        latitude=latitude,
        longitude=longitude,
        metadata=metadata or {},
    )
    log_audit(
        action="verification_event",
        entity_type="customer" if user.user_type == "rider" else "courier",
        entity_id=ride.id,
        summary=f"Trip safety event: {event_type}",
        actor=user,
        details={"ride_id": ride.id, "event_id": event.id, **(metadata or {})},
    )
    return event


def respond_to_safety_event(event: TripSafetyEvent, *, is_safe: bool, note=""):
    event.status = "responded_safe" if is_safe else "escalated"
    event.responded_at = timezone.now()
    if note:
        event.metadata = {**event.metadata, "response_note": note}
    event.save(update_fields=["status", "responded_at", "metadata"])
    log_audit(
        action="verification_event",
        entity_type="system",
        entity_id=event.ride_id,
        summary="Safety check responded",
        actor=event.user,
        details={"event_id": event.id, "is_safe": is_safe, "note": note},
    )
    return event
