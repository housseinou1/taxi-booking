"""Canonical fleet metrics — the single source of truth for driver/courier counts.

WHY THIS MODULE EXISTS
=====================
Couriers are **not** a separate table: a delivery courier is a ``DriverProfile``
row plus a ``deliveries.DriverDeliverySettings`` row. Any metric that counts
``DriverProfile`` without excluding courier profiles therefore silently mixes the
ride-hailing fleet with the delivery fleet.

That produced exactly the two inconsistencies reported from the live console:

- "62 drivers" (ride drivers) vs "104 total drivers" (``DriverProfile`` rows,
  which include 42 courier profiles plus pending/rejected applications).
- "2 online" (approved *ride* drivers available now) vs "13 online"
  (``is_available=True`` across both domains: 2 drivers + 11 couriers).

Every dashboard must therefore read its numbers from this module, and every
number here has one documented definition. Verified against the pilot database:

    DriverProfile rows ......... 104   (62 ride drivers + 42 couriers)
    ride drivers ............... 62    approved 58, online 2
    couriers ................... 42    approved 39, online 11
    is_available=True (all) .... 13    -> the misleading "13 online"

DEFINITIONS
===========
``drivers_total``    Ride-hailing drivers only: ``DriverProfile`` rows whose user has
                     no ``DriverDeliverySettings`` row (couriers excluded).
``drivers_approved`` Same population, ``status="approved"``.
``drivers_online``   Same population, ``status="approved"`` and ``is_available=True``
                     (the driver is online and idle, i.e. dispatchable).
``drivers_pending``  Same population, awaiting review
                     (``status in ("pending", "pending_review")``).
``couriers_total``   Delivery couriers: ``DriverProfile`` rows whose user *has* a
                     ``DriverDeliverySettings`` row.
``couriers_approved``Same population, ``status="approved"``.
``couriers_online``  Same population, ``delivery_mode_enabled`` and not
                     ``is_suspended`` and profile ``approved`` and user active —
                     identical to the courier "online" rule used by the CEO
                     directory's ``_domain_status`` so the two never disagree.
``couriers_suspended`` ``is_suspended=True`` delivery settings.

Read-only: nothing here mutates state.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from taxi.drivers.models import DriverProfile

User = get_user_model()

#: Human-readable definitions, shipped with the API so the UI can explain each
#: figure instead of showing an unexplained number.
FLEET_METRIC_DEFINITIONS = {
    "drivers_total": "Ride-hailing drivers (delivery couriers excluded).",
    "drivers_approved": "Ride-hailing drivers with an approved application.",
    "drivers_online": "Approved ride drivers currently online and dispatchable.",
    "drivers_pending": "Ride-hailing driver applications awaiting review.",
    "couriers_total": "Delivery couriers (driver profiles with delivery settings).",
    "couriers_approved": "Delivery couriers with an approved application.",
    "couriers_online": "Approved couriers with delivery mode on and not suspended.",
    "couriers_suspended": "Couriers suspended from receiving delivery work.",
}


def courier_user_ids() -> QuerySet:
    """User ids that are couriers (they own a ``DriverDeliverySettings`` row)."""
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.values_list("driver_id", flat=True)


def driver_profiles() -> QuerySet:
    """Ride-hailing driver profiles (couriers excluded)."""
    return DriverProfile.objects.exclude(user_id__in=courier_user_ids())


def courier_profiles() -> QuerySet:
    """Delivery courier profiles (couriers only)."""
    return DriverProfile.objects.filter(user_id__in=courier_user_ids())


def couriers_online_count() -> int:
    """Online couriers, using the same rule as the CEO directory."""
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.filter(
        delivery_mode_enabled=True,
        is_suspended=False,
        driver__driver_profile__status="approved",
        driver__is_active=True,
    ).count()


def _scoped_couriers_online(couriers: QuerySet) -> int:
    """Online couriers within an optional pre-filtered courier profile queryset."""
    from deliveries.models import DriverDeliverySettings

    user_ids = list(couriers.values_list("user_id", flat=True))
    if not user_ids:
        return 0
    return DriverDeliverySettings.objects.filter(
        driver_id__in=user_ids,
        delivery_mode_enabled=True,
        is_suspended=False,
        driver__driver_profile__status="approved",
        driver__is_active=True,
    ).count()


def _scoped_courier_suspended(couriers: QuerySet) -> int:
    from deliveries.models import DriverDeliverySettings

    user_ids = list(couriers.values_list("user_id", flat=True))
    if not user_ids:
        return 0
    return DriverDeliverySettings.objects.filter(driver_id__in=user_ids, is_suspended=True).count()


def fleet_metrics(city_id=None) -> dict:
    """All canonical fleet figures in one read-only payload.

    Returns ``{"drivers": {...}, "couriers": {...}, "definitions": {...}}`` so a
    caller can render a number *and* explain it without guessing.

    ``city_id`` scopes to ``User.city_id`` (``locations.City``).
    """
    drivers = driver_profiles()
    couriers = courier_profiles()
    if city_id:
        drivers = drivers.filter(user__city_id=city_id)
        couriers = couriers.filter(user__city_id=city_id)
    courier_ids = courier_user_ids()

    couriers_online = _scoped_couriers_online(couriers) if city_id else couriers_online_count()
    couriers_suspended = _scoped_courier_suspended(couriers) if city_id else _courier_suspended_count()

    return {
        "drivers": {
            "total": drivers.count(),
            "approved": drivers.filter(status="approved").count(),
            "online": drivers.filter(status="approved", is_available=True).count(),
            "pending": drivers.filter(status__in=["pending", "pending_review"]).count(),
            "available_any_status": drivers.filter(is_available=True).count(),
        },
        "couriers": {
            "total": couriers.count(),
            "approved": couriers.filter(status="approved").count(),
            "online": couriers_online,
            "suspended": couriers_suspended,
            "available_any_status": couriers.filter(is_available=True).count(),
        },
        # The figure that caused the confusion: both domains combined.
        "combined": {
            "driver_profiles_total": DriverProfile.objects.count(),
            "available_any_status": DriverProfile.objects.filter(is_available=True).count(),
            "courier_user_ids": len(list(courier_ids)),
        },
        "definitions": dict(FLEET_METRIC_DEFINITIONS),
    }


def _courier_suspended_count() -> int:
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.filter(is_suspended=True).count()
