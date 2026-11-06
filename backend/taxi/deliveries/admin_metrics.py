"""Courier and delivery operational metrics for the admin overview (Task 7).

Read-only aggregate queries. No dependency on the admin view modules, so both
``admin_views`` and ``admin_operations_views`` can import it without a cycle.

Definitions (verified against the existing code paths):

``eligible_pool``  Approved couriers that may work: a courier registration
                   (DriverDeliverySettings), DriverProfile.status == "approved",
                   user.is_active, and not is_suspended. Same base as the existing
                   ``online`` overview figure, minus the delivery-mode requirement.
``busy``           Pool couriers assigned (Delivery.driver) to a delivery whose status is
                   in BUSY_DELIVERY_STATUSES — the exact list
                   notifications.get_eligible_courier_user_ids uses to skip couriers when
                   offering new jobs. ``delivery_exception`` is NOT busy there, so it is
                   not busy here; those couriers are reported separately.
``available``      Pool couriers with delivery_mode_enabled who are not busy, i.e. the
                   couriers the assignment engine can still offer work to.
``offline``        Pool couriers with delivery_mode_enabled = False who are not busy.
busy + available + offline == eligible_pool.

``pending_deliveries``  Deliveries in status "requested" (created, no courier has accepted).
"""

from __future__ import annotations

from django.db.models import Count, Q

from taxi.drivers.models import DriverProfile

from .models import Delivery, DriverDeliverySettings

# Mirrors the local ``active_statuses`` list in notifications.get_eligible_courier_user_ids.
BUSY_DELIVERY_STATUSES = ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"]


def build_courier_operations_metrics() -> dict:
    pool_settings = DriverDeliverySettings.objects.filter(
        is_suspended=False,
        driver__is_active=True,
        driver__driver_profile__status="approved",
    )
    busy_ids = Delivery.objects.filter(
        status__in=BUSY_DELIVERY_STATUSES, driver_id__isnull=False
    ).values("driver_id")
    exception_ids = Delivery.objects.filter(
        status="delivery_exception", driver_id__isnull=False
    ).values("driver_id")

    agg = pool_settings.aggregate(
        eligible_pool=Count("driver_id", distinct=True),
        busy=Count("driver_id", distinct=True, filter=Q(driver_id__in=busy_ids)),
        available=Count(
            "driver_id", distinct=True,
            filter=Q(delivery_mode_enabled=True) & ~Q(driver_id__in=busy_ids),
        ),
        offline=Count(
            "driver_id", distinct=True,
            filter=Q(delivery_mode_enabled=False) & ~Q(driver_id__in=busy_ids),
        ),
        in_exception=Count("driver_id", distinct=True, filter=Q(driver_id__in=exception_ids)),
    )
    suspended = DriverDeliverySettings.objects.filter(
        is_suspended=True,
        driver_id__in=DriverProfile.objects.filter(status="approved").values("user_id"),
    ).count()
    pending = Delivery.objects.filter(status="requested").aggregate(
        total=Count("id"),
        scheduled=Count("id", filter=Q(is_scheduled=True)),
    )
    return {
        "couriers": {
            "eligible_pool": agg["eligible_pool"] or 0,
            "busy": agg["busy"] or 0,
            "available": agg["available"] or 0,
            "offline": agg["offline"] or 0,
            "in_exception": agg["in_exception"] or 0,
            "approved_but_suspended": suspended,
        },
        "deliveries": {
            "pending": pending["total"] or 0,
            "pending_scheduled": pending["scheduled"] or 0,
        },
        "definitions": {
            "eligible_pool": "Approved, active, non-suspended couriers.",
            "busy": "Pool couriers assigned to an accepted / courier_arriving / picked_up / in_transit / delivering delivery.",
            "available": "Pool couriers with delivery mode on and not busy (can receive new offers).",
            "offline": "Pool couriers with delivery mode off and not busy.",
            "in_exception": "Pool couriers assigned to a delivery in delivery_exception (not counted as busy by assignment).",
            "pending": "Deliveries in status requested (no courier has accepted yet).",
        },
    }
