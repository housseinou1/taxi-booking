"""
Smart sequential ride-offer assignment with 30-second driver timeout.

Uses rules-based matching (distance/ETA weighted) and expanding search
radius: 2 → 5 → 10 → city km.
"""

from __future__ import annotations

import logging
from typing import Optional

from django.db import transaction
from django.utils import timezone

from taxi.drivers.models import DriverProfile
from taxi.drivers.services.ride_performance_service import (
    apply_decline_penalty,
    apply_missed_offer_penalty,
    record_ride_offer_sent,
)
from taxi.rides.models import DispatchOfferLog, Ride
from taxi.rides.services.driver_dispatch_service import (
    max_dispatch_round,
    select_best_driver,
)
from taxi.rides.timeout import (
    RIDE_REQUEST_TIMEOUT_SECONDS,
    cancel_ride_request_timeout,
    start_ride_request_timeout,
    _broadcast_ride_request,
)

logger = logging.getLogger(__name__)


def _log_dispatch(
    ride: Ride,
    *,
    driver=None,
    ranked=None,
    result: str,
    radius_km: Optional[float] = None,
    dispatch_round: Optional[int] = None,
) -> None:
    try:
        DispatchOfferLog.objects.create(
            ride=ride,
            driver=driver,
            dispatch_round=dispatch_round or ride.dispatch_round or 1,
            search_radius_km=radius_km
            if radius_km is not None
            else ride.search_radius_km,
            distance_km=getattr(ranked, "distance_km", None),
            eta_minutes=getattr(ranked, "eta_minutes", None),
            score=getattr(ranked, "score", None),
            score_breakdown=getattr(ranked, "breakdown", None) or {},
            result=result,
        )
    except Exception:
        logger.exception("Failed to write dispatch log for ride %s", ride.id)


def _mark_no_driver(ride: Ride, radius_km: float) -> None:
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.dispatch_status = "no_driver_found"
    ride.search_radius_km = radius_km
    ride.dispatch_round = max_dispatch_round()
    ride.save(
        update_fields=[
            "offered_driver",
            "offer_sent_at",
            "dispatch_status",
            "search_radius_km",
            "dispatch_round",
        ]
    )
    _log_dispatch(ride, result="no_driver", radius_km=radius_km)
    try:
        from taxi.rides.broadcast import broadcast_ride_update

        broadcast_ride_update(
            ride,
            extra={
                "dispatch_status": ride.dispatch_status,
                "dispatch_round": ride.dispatch_round,
                "search_radius_km": ride.search_radius_km,
                "no_driver_found": True,
            },
        )
    except Exception:
        logger.exception("Failed to broadcast no-driver for ride %s", ride.id)


@transaction.atomic
def offer_ride_to_next_driver(ride: Ride, *, require_documents: bool = True) -> bool:
    """Offer a requested ride to the best eligible driver. Returns True if offered."""
    ride = Ride.objects.select_for_update().get(pk=ride.pk)

    if ride.status != "requested":
        return False

    if ride.driver_id is not None:
        return False

    if not ride.search_started_at:
        ride.search_started_at = timezone.now()
        ride.dispatch_status = "searching"
        ride.dispatch_round = max(ride.dispatch_round or 1, 1)
        ride.save(
            update_fields=["search_started_at", "dispatch_status", "dispatch_round"]
        )

    ranked, radius_km, used_round = select_best_driver(
        ride,
        dispatch_round=ride.dispatch_round or 1,
        require_documents=require_documents,
    )

    if ranked is None:
        logger.info("No eligible drivers for ride %s after expanding search", ride.id)
        _mark_no_driver(ride, radius_km)
        return False

    next_profile = ranked.profile
    ride.offered_driver = next_profile.user
    ride.offer_sent_at = timezone.now()
    ride.dispatch_status = "offered"
    ride.dispatch_round = used_round
    ride.search_radius_km = radius_km
    ride.save(
        update_fields=[
            "offered_driver",
            "offer_sent_at",
            "dispatch_status",
            "dispatch_round",
            "search_radius_km",
        ]
    )

    record_ride_offer_sent(next_profile)
    _log_dispatch(
        ride,
        driver=next_profile.user,
        ranked=ranked,
        result="offered",
        radius_km=radius_km,
        dispatch_round=used_round,
    )
    _broadcast_ride_request(ride, next_profile.user_id)
    start_ride_request_timeout(ride.id, next_profile.user_id)

    try:
        from notifications.push import notify_new_ride_request

        notify_new_ride_request(next_profile.user, ride)
    except Exception:
        logger.exception(
            "Failed to push ride offer %s to driver %s", ride.id, next_profile.user_id
        )

    logger.info(
        "Offered ride %s to driver %s (score=%.3f dist=%.2fkm round=%s radius=%.1f)",
        ride.id,
        next_profile.user_id,
        ranked.score,
        ranked.distance_km,
        used_round,
        radius_km,
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
        declined = list(ride.declined_driver_ids or [])
        if penalized_user_id not in declined:
            declined.append(penalized_user_id)
        ride.declined_driver_ids = declined
        _log_dispatch(
            ride,
            driver=profile.user if profile else None,
            result="expired",
        )

    ride.driver = None
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.dispatch_status = "searching"
    ride.save(
        update_fields=[
            "driver",
            "offered_driver",
            "offer_sent_at",
            "declined_driver_ids",
            "dispatch_status",
        ]
    )

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
    ride.dispatch_status = "searching"
    ride.save(
        update_fields=[
            "declined_driver_ids",
            "offered_driver",
            "offer_sent_at",
            "dispatch_status",
        ]
    )
    _log_dispatch(ride, driver=driver_user, result="declined")

    cancel_ride_request_timeout(ride.id)
    return offer_ride_to_next_driver(ride)


def mark_dispatch_assigned(ride: Ride, driver_user) -> None:
    ride.dispatch_status = "assigned"
    ride.save(update_fields=["dispatch_status"])
    _log_dispatch(ride, driver=driver_user, result="accepted")


def ride_offer_payload(ride: Ride) -> dict:
    eta = None
    distance_to_pickup = None
    if ride.offered_driver_id:
        try:
            from taxi.rides.services.driver_dispatch_service import haversine_km

            profile = ride.offered_driver.driver_profile
            if profile.current_lat is not None and profile.current_lng is not None:
                distance_to_pickup = round(
                    haversine_km(
                        profile.current_lat,
                        profile.current_lng,
                        ride.pickup_lat,
                        ride.pickup_lng,
                    ),
                    2,
                )
                from taxi.rides.services.driver_dispatch_service import AVG_CITY_SPEED_KMH

                eta = round((distance_to_pickup / AVG_CITY_SPEED_KMH) * 60.0, 1)
        except Exception:
            pass

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
        "dispatch_round": ride.dispatch_round,
        "search_radius_km": ride.search_radius_km,
        "estimated_pickup_km": distance_to_pickup,
        "estimated_pickup_minutes": eta,
    }
