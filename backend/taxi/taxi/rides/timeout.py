"""
Ride Request Timeout Mechanism.

Implements a 30-second countdown for ride acceptance. If the driver doesn't
respond within 30 seconds, the ride is auto-expired and reassigned to another
available driver. The expiration is broadcast to the driver via WebSocket.

Requirements: 3.1, 3.9
"""

import logging
import threading
from typing import Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import close_old_connections, transaction

logger = logging.getLogger(__name__)

# Default timeout duration in seconds
RIDE_REQUEST_TIMEOUT_SECONDS = 30

# Registry of active timers keyed by ride_id for cancellation
_active_timers: dict[int, threading.Timer] = {}
_timer_lock = threading.Lock()


def start_ride_request_timeout(ride_id: int, driver_user_id: Optional[int] = None) -> None:
    """
    Start a 30-second countdown timer for a ride request.

    When the timer fires, the ride is expired and reassigned to another
    available driver. The expiration is broadcast to the assigned driver
    via WebSocket.

    Args:
        ride_id: The ID of the ride to monitor.
        driver_user_id: The user ID of the driver who received the request.
                        Used for targeted WebSocket notification.
    """
    # Cancel any existing timer for this ride
    cancel_ride_request_timeout(ride_id)

    timer = threading.Timer(
        RIDE_REQUEST_TIMEOUT_SECONDS,
        _handle_timeout,
        args=(ride_id, driver_user_id),
    )
    timer.daemon = True
    timer.name = f"ride_timeout_{ride_id}"

    with _timer_lock:
        _active_timers[ride_id] = timer

    timer.start()
    logger.info(
        "Started %ds timeout for ride %d (driver_user_id=%s)",
        RIDE_REQUEST_TIMEOUT_SECONDS,
        ride_id,
        driver_user_id,
    )


def cancel_ride_request_timeout(ride_id: int) -> bool:
    """
    Cancel an active timeout timer for a ride.

    Should be called when a driver accepts or explicitly declines a ride
    before the timeout fires.

    Args:
        ride_id: The ID of the ride whose timer should be cancelled.

    Returns:
        True if a timer was found and cancelled, False otherwise.
    """
    with _timer_lock:
        timer = _active_timers.pop(ride_id, None)

    if timer is not None:
        timer.cancel()
        logger.info("Cancelled timeout for ride %d", ride_id)
        return True

    return False


def _handle_timeout(ride_id: int, driver_user_id: Optional[int]) -> None:
    """
    Internal callback fired when the 30-second countdown expires.

    1. Marks the ride as expired (removes driver assignment, resets to requested)
    2. Broadcasts expiration to the driver via WebSocket
    3. Attempts to reassign the ride to another available driver
    """
    # Clean up the timer registry
    with _timer_lock:
        _active_timers.pop(ride_id, None)

    # Ensure fresh DB connections in this thread
    close_old_connections()

    try:
        from taxi.rides.models import Ride

        ride = Ride.objects.select_for_update().get(id=ride_id)
    except Exception:
        logger.warning("Timeout fired but ride %d not found", ride_id)
        close_old_connections()
        return

    # Only expire if the ride is still in 'requested' status
    # (driver hasn't accepted yet)
    if ride.status != "requested":
        logger.info(
            "Timeout for ride %d ignored - status is '%s' (already handled)",
            ride_id,
            ride.status,
        )
        close_old_connections()
        return

    expired_driver_user_id = driver_user_id or ride.offered_driver_id

    try:
        from taxi.rides.services.ride_assignment_service import handle_missed_offer

        handle_missed_offer(ride_id, expired_driver_user_id)
    except Exception as exc:
        logger.error("Failed to handle missed offer for ride %d: %s", ride_id, exc)

    if expired_driver_user_id:
        _broadcast_ride_expired(ride_id, expired_driver_user_id)

    close_old_connections()


def _broadcast_ride_expired(ride_id: int, driver_user_id: int) -> None:
    """
    Send a ride_request_expired message to the driver via WebSocket.

    Broadcasts to the driver-specific group `driver_{user_id}` and also
    to the shared 'rides' group for admin monitoring.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            logger.warning("No channel layer available for ride expiration broadcast")
            return

        message = {
            "type": "ride_request_expired",
            "ride_id": ride_id,
            "message": "Ride request has expired. You did not respond within 30 seconds.",
        }

        # Send to driver-specific group
        driver_group = f"driver_{driver_user_id}"
        async_to_sync(channel_layer.group_send)(
            driver_group,
            {
                "type": "ride_update",
                "message": message,
            },
        )

        # Also broadcast to the shared rides group for admin monitoring
        async_to_sync(channel_layer.group_send)(
            "rides",
            {
                "type": "ride_update",
                "message": {
                    "type": "ride_request_expired",
                    "ride_id": ride_id,
                    "driver_id": driver_user_id,
                    "status": "expired",
                },
            },
        )

        logger.info(
            "Broadcast ride expiration for ride %d to driver %d",
            ride_id,
            driver_user_id,
        )
    except Exception as exc:
        logger.error(
            "Failed to broadcast ride expiration for ride %d: %s",
            ride_id,
            exc,
        )


def _attempt_reassignment(ride, excluded_driver_user_id: Optional[int] = None) -> None:
    """
    Attempt to reassign an expired ride to another available driver.

    Finds the next available driver (excluding the one who timed out),
    assigns the ride, and starts a new timeout for the new driver.
    """
    try:
        from taxi.drivers.models import DriverProfile

        # Find available drivers excluding the one who timed out
        available_drivers = DriverProfile.objects.filter(
            status="approved",
            is_available=True,
        )

        if excluded_driver_user_id:
            available_drivers = available_drivers.exclude(
                user_id=excluded_driver_user_id
            )

        # Also exclude drivers who already have an active ride
        from taxi.rides.models import Ride

        active_driver_ids = Ride.objects.filter(
            status__in=["driver_arriving", "driver_arrived", "in_progress"],
        ).values_list("driver_id", flat=True)

        available_drivers = available_drivers.exclude(
            user_id__in=active_driver_ids
        )

        # Pick the first available driver (could be enhanced with proximity logic)
        next_driver = available_drivers.first()

        if next_driver is None:
            logger.info(
                "No available drivers for reassignment of ride %d", ride.id
            )
            return

        # Assign the ride to the new driver
        ride.driver = next_driver.user
        ride.save(update_fields=["driver"])

        logger.info(
            "Reassigned ride %d to driver %d",
            ride.id,
            next_driver.user_id,
        )

        # Broadcast the new ride request to the new driver
        _broadcast_ride_request(ride, next_driver.user_id)

        # Start a new timeout for the new driver
        start_ride_request_timeout(ride.id, next_driver.user_id)

    except Exception as exc:
        logger.error(
            "Failed to reassign ride %d: %s",
            ride.id,
            exc,
        )


def schedule_ride_request_broadcast(ride, driver_user_id: int) -> None:
    """
    Send a ride offer over WebSocket after the DB transaction commits.

    Without this, drivers can receive the WS event before /rides/available/
    includes the offer, and the app dismisses the request sheet immediately.
    """
    ride_id = ride.id

    def _send() -> None:
        try:
            from taxi.rides.models import Ride

            fresh = Ride.objects.filter(pk=ride_id).first()
            if (
                fresh
                and fresh.status == "requested"
                and fresh.offered_driver_id == driver_user_id
            ):
                _broadcast_ride_request(fresh, driver_user_id)
        except Exception:
            logger.exception(
                "Failed post-commit ride request broadcast for ride %s",
                ride_id,
            )

    transaction.on_commit(_send)


def _broadcast_ride_request(ride, driver_user_id: int) -> None:
    """
    Send a new ride request notification to a driver via WebSocket.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        message = {
            "type": "ride_request",
            "ride_id": ride.id,
            "pickup": ride.pickup,
            "destination": ride.destination,
            "pickup_lat": ride.pickup_lat,
            "pickup_lng": ride.pickup_lng,
            "destination_lat": ride.destination_lat,
            "destination_lng": ride.destination_lng,
            "fare": str(ride.fare),
            "distance_km": str(ride.distance_km),
            "countdown": RIDE_REQUEST_TIMEOUT_SECONDS,
            "rider_id": ride.rider_id,
        }

        driver_group = f"driver_{driver_user_id}"
        async_to_sync(channel_layer.group_send)(
            driver_group,
            {
                "type": "ride_request",
                "message": message,
            },
        )

        logger.info(
            "Sent ride request for ride %d to driver %d",
            ride.id,
            driver_user_id,
        )
    except Exception as exc:
        logger.error(
            "Failed to send ride request for ride %d to driver %d: %s",
            ride.id,
            driver_user_id,
            exc,
        )


def get_active_timeout_count() -> int:
    """Return the number of currently active timeout timers (for monitoring)."""
    with _timer_lock:
        return len(_active_timers)


def has_active_timeout(ride_id: int) -> bool:
    """Check if a ride has an active timeout timer."""
    with _timer_lock:
        return ride_id in _active_timers
