"""Geofence-based nearby notifications for active deliveries."""

import logging

from django.conf import settings

from ..geo import haversine_km

logger = logging.getLogger(__name__)


def _radius_km():
    return max(float(getattr(settings, "DELIVERY_GEOFENCE_RADIUS_KM", 0.5)), 0.1)


def check_nearby_geofence(delivery, courier_lat: float, courier_lng: float):
    """Notify customer once when courier enters the pickup or dropoff geofence."""
    if not delivery.customer_id:
        return

    radius = _radius_km()
    status = delivery.status
    updates = []

    if status in {"accepted", "courier_arriving"} and not delivery.near_pickup_notified:
        distance = haversine_km(
            courier_lat, courier_lng, delivery.pickup_lat, delivery.pickup_lng
        )
        if distance <= radius:
            try:
                from notifications.push import notify_delivery_courier_nearby

                notify_delivery_courier_nearby(
                    delivery.customer,
                    delivery,
                    zone="pickup",
                )
                delivery.near_pickup_notified = True
                updates.append("near_pickup_notified")
            except Exception:
                logger.exception("Pickup geofence push failed for delivery %s", delivery.id)

    if status in {"picked_up", "in_transit", "delivering"} and not delivery.near_dropoff_notified:
        distance = haversine_km(
            courier_lat,
            courier_lng,
            delivery.destination_lat,
            delivery.destination_lng,
        )
        if distance <= radius:
            try:
                from notifications.push import notify_delivery_courier_nearby

                notify_delivery_courier_nearby(
                    delivery.customer,
                    delivery,
                    zone="dropoff",
                )
                delivery.near_dropoff_notified = True
                updates.append("near_dropoff_notified")
            except Exception:
                logger.exception("Dropoff geofence push failed for delivery %s", delivery.id)

    if updates:
        delivery.save(update_fields=updates)
