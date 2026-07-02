"""Broadcast delivery events over Channels."""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .websocket import (
    send_delivery_assigned,
    send_delivery_location_update,
    send_delivery_status_update,
)

logger = logging.getLogger(__name__)


def _get_channel_layer():
    return get_channel_layer()


def broadcast_delivery_status(delivery, status=None):
    channel_layer = _get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(send_delivery_status_update)(
            channel_layer,
            delivery.id,
            status or delivery.status,
            rider_id=delivery.customer_id,
            driver_id=delivery.driver_id,
        )
        terminal_status = status or delivery.status
        if terminal_status in {"delivered", "cancelled", "delivery_exception"}:
            from .websocket import send_delivery_chat_closed

            async_to_sync(send_delivery_chat_closed)(
                channel_layer,
                delivery.id,
                terminal_status,
            )
    except Exception:
        logger.exception("Failed to broadcast delivery status for %s", delivery.id)


def broadcast_delivery_assigned(delivery):
    channel_layer = _get_channel_layer()
    if not channel_layer or not delivery.driver_id:
        return

    from .courier_routing import get_courier_type_label
    from .vehicle_types import get_delivery_vehicle_label

    settings = getattr(delivery.driver, "delivery_settings", None)
    profile = getattr(delivery.driver, "driver_profile", None)
    vehicle_type = settings.delivery_vehicle_type if settings else "motorcycle"

    driver_data = {
        "driver_name": f"{delivery.driver.first_name} {delivery.driver.last_name}".strip(),
        "driver_photo": "",
        "vehicle": get_courier_type_label(vehicle_type),
        "courier_vehicle_type": vehicle_type,
        "courier_vehicle_label": get_delivery_vehicle_label(vehicle_type),
        "plate_number": (profile.plate_number or profile.vehicle_plate if profile else "") or "",
        "driver_phone": delivery.driver.phone_number or "",
        "driver_rating": str(settings.delivery_rating if settings else "5.0"),
        "driver_lat": profile.current_lat if profile else None,
        "driver_lng": profile.current_lng if profile else None,
    }

    try:
        async_to_sync(send_delivery_assigned)(
            channel_layer,
            delivery.id,
            delivery.customer_id,
            driver_data,
        )
    except Exception:
        logger.exception("Failed to broadcast delivery assigned for %s", delivery.id)


def broadcast_courier_location(delivery, lat, lng, eta_minutes=None):
    from .services.location_batcher import should_broadcast_location

    if not should_broadcast_location(delivery.id, lat, lng):
        return

    channel_layer = _get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(send_delivery_location_update)(
            channel_layer,
            delivery.id,
            lat,
            lng,
            eta_minutes=eta_minutes,
        )
    except Exception:
        logger.exception("Failed to broadcast courier location for %s", delivery.id)
