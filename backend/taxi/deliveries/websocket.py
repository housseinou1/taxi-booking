"""WebSocket utility functions for delivery real-time updates.

Uses the existing channel layer infrastructure. Delivery events are broadcast
to `delivery_{delivery_id}` groups (rider + driver) and `driver_{user_id}`
groups for new delivery requests.

These functions can be called from Django views/services using:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    async_to_sync(send_delivery_status_update)(channel_layer, ...)
"""

import json
import logging

logger = logging.getLogger(__name__)


async def send_delivery_status_update(channel_layer, delivery_id, status, rider_id=None, driver_id=None):
    """Broadcast delivery status change to all parties.

    Args:
        channel_layer: The Django Channels channel layer instance.
        delivery_id: The delivery ID.
        status: The new delivery status.
        rider_id: The rider's user ID (for targeted notification).
        driver_id: The driver's user ID (for targeted notification).
    """
    message = {
        "type": "delivery_status_update",
        "delivery_id": delivery_id,
        "status": status,
    }

    # Broadcast to delivery-specific group
    delivery_group = f"delivery_{delivery_id}"
    await channel_layer.group_send(
        delivery_group,
        {"type": "delivery_event", "message": message},
    )

    # Also send to rider-specific group
    if rider_id:
        rider_group = f"rider_{rider_id}"
        await channel_layer.group_send(
            rider_group,
            {"type": "delivery_event", "message": message},
        )

    # Also send to driver-specific group
    if driver_id:
        driver_group = f"driver_{driver_id}"
        await channel_layer.group_send(
            driver_group,
            {"type": "delivery_event", "message": message},
        )


async def send_delivery_location_update(channel_layer, delivery_id, lat, lng, eta_minutes=None):
    """Broadcast driver location during active delivery.

    Args:
        channel_layer: The Django Channels channel layer instance.
        delivery_id: The delivery ID.
        lat: Driver latitude.
        lng: Driver longitude.
        eta_minutes: Estimated time of arrival in minutes.
    """
    message = {
        "type": "delivery_location_update",
        "delivery_id": delivery_id,
        "lat": lat,
        "lng": lng,
        "eta_minutes": eta_minutes,
    }

    delivery_group = f"delivery_{delivery_id}"
    await channel_layer.group_send(
        delivery_group,
        {"type": "delivery_event", "message": message},
    )


async def send_delivery_assigned(channel_layer, delivery_id, rider_id, driver_data):
    """Notify rider that a driver has been assigned to their delivery.

    Args:
        channel_layer: The Django Channels channel layer instance.
        delivery_id: The delivery ID.
        rider_id: The rider's user ID.
        driver_data: Dict with driver_name, driver_photo, vehicle, plate_number.
    """
    message = {
        "type": "delivery_assigned",
        "delivery_id": delivery_id,
        **driver_data,
    }

    # Send to delivery group
    delivery_group = f"delivery_{delivery_id}"
    await channel_layer.group_send(
        delivery_group,
        {"type": "delivery_event", "message": message},
    )

    # Send to rider-specific group
    rider_group = f"rider_{rider_id}"
    await channel_layer.group_send(
        rider_group,
        {"type": "delivery_event", "message": message},
    )


async def send_delivery_new_request(channel_layer, driver_user_ids, delivery_data):
    """Broadcast new delivery request to available drivers.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_ids: List of driver user IDs to notify.
        delivery_data: Dict with delivery details (id, pickup, destination, fare, etc).
    """
    message = {
        "type": "delivery_new_request",
        **delivery_data,
    }

    for driver_id in driver_user_ids:
        driver_group = f"driver_{driver_id}"
        await channel_layer.group_send(
            driver_group,
            {"type": "delivery_event", "message": message},
        )


async def send_delivery_stop_completed(channel_layer, delivery_id, rider_id, stop_data):
    """Notify rider that a delivery stop has been completed.

    Args:
        channel_layer: The Django Channels channel layer instance.
        delivery_id: The delivery ID.
        rider_id: The rider's user ID.
        stop_data: Dict with stop_id, stop_order, remaining_stops.
    """
    message = {
        "type": "delivery_stop_completed",
        "delivery_id": delivery_id,
        **stop_data,
    }

    delivery_group = f"delivery_{delivery_id}"
    await channel_layer.group_send(
        delivery_group,
        {"type": "delivery_event", "message": message},
    )

    rider_group = f"rider_{rider_id}"
    await channel_layer.group_send(
        rider_group,
        {"type": "delivery_event", "message": message},
    )
