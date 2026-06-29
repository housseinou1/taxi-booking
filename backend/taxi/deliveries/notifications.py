"""Notify online couriers about new delivery requests."""

import logging
from datetime import timedelta

from django.utils import timezone

from .cities import DEFAULT_DELIVERY_CITY, courier_serves_city
from .courier_routing import courier_matches_required
from .models import Delivery, DriverDeliverySettings
from .vehicle_types import courier_can_carry_package

logger = logging.getLogger(__name__)


def _courier_accepts_delivery(settings_obj: DriverDeliverySettings, delivery: Delivery) -> bool:
    if not courier_serves_city(settings_obj, delivery.service_city):
        return False
    category = (delivery.service_category or "package").lower()
    if category in ("food", "restaurant") and not settings_obj.accepts_food:
        return False
    if category == "pharmacy" and not settings_obj.accepts_pharmacy:
        return False
    if delivery.is_fragile and not settings_obj.accepts_fragile:
        return False
    if not courier_matches_required(
        settings_obj.delivery_vehicle_type,
        delivery.courier_type_required,
        delivery.package_type,
    ):
        return False
    return courier_can_carry_package(settings_obj.delivery_vehicle_type, delivery.package_type)


def get_eligible_courier_user_ids(delivery: Delivery) -> list[int]:
    """Return approved couriers who are online and can take this delivery."""
    now = timezone.now()
    window = now + timedelta(minutes=15)
    if delivery.is_scheduled and delivery.scheduled_pickup_at and delivery.scheduled_pickup_at > window:
        return []

    active_statuses = ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"]
    busy_driver_ids = set(
        Delivery.objects.filter(status__in=active_statuses).values_list("driver_id", flat=True)
    )

    settings_qs = (
        DriverDeliverySettings.objects.filter(
            delivery_mode_enabled=True,
            driver__driver_profile__status="approved",
        )
        .select_related("driver", "driver__driver_profile")
    )

    eligible = []
    for settings_obj in settings_qs:
        driver_id = settings_obj.driver_id
        if driver_id in busy_driver_ids:
            continue
        if not _courier_accepts_delivery(settings_obj, delivery):
            continue
        eligible.append(driver_id)
    return eligible


def _delivery_offer_payload(delivery: Delivery) -> dict:
    return {
        "delivery_id": delivery.id,
        "pickup": delivery.pickup,
        "destination": delivery.destination,
        "fare": str(delivery.fare),
        "distance_km": str(delivery.distance_km),
        "package_type": delivery.package_type,
        "courier_type_required": delivery.courier_type_required or "motorcycle",
        "service_category": delivery.service_category or "package",
        "service_city": delivery.service_city or DEFAULT_DELIVERY_CITY,
        "is_fragile": bool(delivery.is_fragile),
        "is_scheduled": bool(delivery.is_scheduled),
        "is_urgent": bool(delivery.is_urgent),
        "estimated_duration_minutes": delivery.estimated_duration_minutes,
        "substitution_notes": delivery.substitution_notes or "",
    }


def broadcast_new_delivery_request(delivery: Delivery) -> int:
    """Start sequential nearest-courier assignment."""
    from .services.assignment_service import assignment_service

    return assignment_service.start_assignment(delivery)
