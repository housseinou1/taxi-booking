import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def _serialize_ride_stops(ride):
    return [
        {
            "id": stop.id,
            "ride": stop.ride_id,
            "stop_order": stop.stop_order,
            "location_name": stop.location_name,
            "latitude": stop.latitude,
            "longitude": stop.longitude,
            "arrived_at": stop.arrived_at.isoformat() if stop.arrived_at else None,
            "departed_at": stop.departed_at.isoformat() if stop.departed_at else None,
        }
        for stop in ride.stops.order_by("stop_order")
    ]


def build_ride_update_message(ride, extra=None):
    message = {
        "type": "ride_status_update",
        "ride_id": ride.id,
        "status": ride.status,
        "rider_id": ride.rider_id,
        "driver_id": ride.driver_id,
    }
    stops = _serialize_ride_stops(ride)
    if stops:
        message["stops"] = stops
        message["stop_count"] = len(stops)
        message["has_stops"] = True
    if extra:
        message.update(extra)
    return message


def broadcast_ride_update(ride, extra=None):
    """Send ride status updates to shared, ride-specific, and rider groups."""
    message = build_ride_update_message(ride, extra=extra)

    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        async_to_sync(channel_layer.group_send)(
            "rides",
            {
                "type": "ride_update",
                "message": message,
            },
        )

        async_to_sync(channel_layer.group_send)(
            f"ride_{ride.id}",
            {
                "type": "ride_status_update",
                "message": message,
            },
        )

        if ride.rider_id:
            async_to_sync(channel_layer.group_send)(
                f"rider_{ride.rider_id}",
                {
                    "type": "ride_status_update",
                    "message": message,
                },
            )
    except Exception:
        logger.exception("Failed to broadcast ride update for ride %s", ride.id)
