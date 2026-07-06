"""
Sequential ride-offer assignment with 30-second driver timeout.
"""

from __future__ import annotations

import logging
from typing import Optional

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from taxi.drivers.models import DriverProfile
from taxi.drivers.services.ride_performance_service import (
    apply_decline_penalty,
    apply_missed_offer_penalty,
    record_ride_offer_sent,
)
from taxi.rides.models import Ride
from taxi.rides.timeout import (
    RIDE_REQUEST_TIMEOUT_SECONDS,
    cancel_ride_request_timeout,
    start_ride_request_timeout,
    _broadcast_ride_request,
)

logger = logging.getLogger(__name__)

DRIVER_ACTIVE_STATUSES = ["driver_arriving", "driver_arrived", "in_progress"]


def _eligible_drivers(ride: Ride, excluded_user_ids: Optional[list[int]] = None):
    active_driver_ids = Ride.objects.filter(
        status__in=DRIVER_ACTIVE_STATUSES,
        driver__isnull=False,
    ).values_list("driver_id", flat=True)

    profiles = DriverProfile.objects.filter(
        status="approved",
        is_available=True,
        user__is_active=True,
    ).exclude(user_id__in=active_driver_ids)

    if ride.city_id:
        profiles = profiles.filter(
            Q(user__city_id=ride.city_id) | Q(user__city__isnull=True)
        )

    excluded = set(excluded_user_ids or [])
    if ride.declined_driver_ids:
        excluded.update(ride.declined_driver_ids)

    if excluded:
        profiles = profiles.exclude(user_id__in=excluded)

    return profiles.order_by("id")


@transaction.atomic
def offer_ride_to_next_driver(ride: Ride) -> bool:
    """Offer a requested ride to the next eligible driver. Returns True if offered."""
    ride = Ride.objects.select_for_update().get(pk=ride.pk)

    if ride.status != "requested":
        return False

    if ride.driver_id is not None:
        return False

    next_profile = _eligible_drivers(ride).first()
    if next_profile is None:
        ride.offered_driver = None
        ride.offer_sent_at = None
        ride.save(update_fields=["offered_driver", "offer_sent_at"])
        logger.info("No eligible drivers for ride %s", ride.id)
        return False

    ride.offered_driver = next_profile.user
    ride.offer_sent_at = timezone.now()
    ride.save(update_fields=["offered_driver", "offer_sent_at"])

    record_ride_offer_sent(next_profile)
    _broadcast_ride_request(ride, next_profile.user_id)
    start_ride_request_timeout(ride.id, next_profile.user_id)

    try:
        from notifications.push import notify_new_ride_request

        notify_new_ride_request(next_profile.user, ride)
    except Exception:
        logger.exception("Failed to push ride offer %s to driver %s", ride.id, next_profile.user_id)

    logger.info(
        "Offered ride %s to driver %s",
        ride.id,
        next_profile.user_id,
    )
    return True


def clear_ride_offer(ride: Ride) -> None:
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.save(update_fields=["offered_driver", "offer_sent_at"])
    cancel_ride_request_timeout(ride.id)


@transaction.atomic
def handle_missed_offer(ride_id: int, driver_user_id: Optional[int]) -> None:
    ride = Ride.objects.select_for_update().get(pk=ride_id)

    if ride.status != "requested":
        return

    penalized_user_id = driver_user_id or ride.offered_driver_id
    if penalized_user_id:
        profile = DriverProfile.objects.filter(user_id=penalized_user_id).first()
        if profile:
            apply_missed_offer_penalty(profile)

    ride.driver = None
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.save(update_fields=["driver", "offered_driver", "offer_sent_at"])

    offer_ride_to_next_driver(ride)


@transaction.atomic
def handle_driver_decline(ride: Ride, driver_user) -> bool:
    ride = Ride.objects.select_for_update().get(pk=ride.pk)

    if ride.status != "requested":
        return False

    if ride.offered_driver_id and ride.offered_driver_id != driver_user.id:
        return False

    profile = DriverProfile.objects.filter(user=driver_user).first()
    if profile:
        apply_decline_penalty(profile)

    declined = list(ride.declined_driver_ids or [])
    if driver_user.id not in declined:
        declined.append(driver_user.id)
    ride.declined_driver_ids = declined
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.save(update_fields=["declined_driver_ids", "offered_driver", "offer_sent_at"])

    cancel_ride_request_timeout(ride.id)
    return offer_ride_to_next_driver(ride)


def ride_offer_payload(ride: Ride) -> dict:
    return {
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
