"""Dispatch intervention actions for the operations center."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from deliveries.models import Delivery
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from taxi.rides.services.ride_assignment_service import (
    handle_driver_decline,
    mark_dispatch_assigned,
    offer_ride_to_next_driver,
)

logger = logging.getLogger(__name__)
User = get_user_model()

ACTIVE_RIDE_STATUSES = {"requested", "driver_arriving", "driver_arrived", "in_progress"}
PRE_TRIP_STATUSES = {"requested", "driver_arriving", "driver_arrived"}


@transaction.atomic
def force_assign_driver(ride: Ride, driver_user, actor) -> Ride:
    ride = Ride.objects.select_for_update().get(pk=ride.pk)
    if ride.status not in PRE_TRIP_STATUSES:
        raise ValueError("Ride can only be force-assigned before trip starts.")

    profile = DriverProfile.objects.filter(user=driver_user, status="approved").first()
    if not profile:
        raise ValueError("Driver profile not found or not approved.")

    if ride.driver_id and ride.driver_id != driver_user.id:
        previous_driver = ride.driver
        ride.driver = None
        ride.status = "requested"
        ride.save(update_fields=["driver", "status"])
        handle_driver_decline(ride, previous_driver)

    ride = Ride.objects.select_for_update().get(pk=ride.pk)
    ride.driver = driver_user
    ride.offered_driver = None
    ride.offer_sent_at = None
    ride.status = "driver_arriving"
    ride.dispatch_status = "assigned"
    ride.save()

    mark_dispatch_assigned(ride, driver_user)

    from taxi.rides.broadcast import broadcast_ride_update

    broadcast_ride_update(ride, extra={"ops_action": "force_assign", "actor_id": actor.id})
    return ride


@transaction.atomic
def reassign_ride(ride: Ride, new_driver_id: int | None, actor) -> Ride:
    ride = Ride.objects.select_for_update().get(pk=ride.pk)
    if ride.status not in PRE_TRIP_STATUSES:
        raise ValueError("Ride can only be reassigned before trip starts.")

    if ride.driver_id:
        previous = ride.driver
        ride.driver = None
        ride.status = "requested"
        ride.dispatch_status = "searching"
        ride.save(update_fields=["driver", "status", "dispatch_status"])
        handle_driver_decline(ride, previous)
        ride = Ride.objects.select_for_update().get(pk=ride.pk)

    if new_driver_id:
        driver = User.objects.get(pk=new_driver_id)
        return force_assign_driver(ride, driver, actor)

    offer_ride_to_next_driver(ride)
    from taxi.rides.broadcast import broadcast_ride_update

    broadcast_ride_update(ride, extra={"ops_action": "reassign", "actor_id": actor.id})
    return Ride.objects.get(pk=ride.pk)


@transaction.atomic
def pause_driver(driver_user, actor, *, paused: bool = True) -> DriverProfile:
    profile = DriverProfile.objects.select_for_update().get(user=driver_user)
    profile.is_available = not paused
    profile.save(update_fields=["is_available"])
    return profile


@transaction.atomic
def reassign_delivery(delivery: Delivery, new_driver_id: int | None, actor) -> Delivery:
    delivery = Delivery.objects.select_for_update().get(pk=delivery.pk)
    if delivery.status not in {
        "requested",
        "accepted",
        "courier_arriving",
        "picked_up",
        "in_transit",
        "delivering",
    }:
        raise ValueError("Delivery cannot be reassigned in its current status.")

    declined = list(delivery.declined_driver_ids or [])
    if delivery.driver_id and delivery.driver_id not in declined:
        declined.append(delivery.driver_id)
    delivery.declined_driver_ids = declined
    delivery.driver = None
    delivery.status = "requested"
    delivery.save(update_fields=["declined_driver_ids", "driver", "status"])

    if new_driver_id:
        delivery.driver_id = new_driver_id
        delivery.status = "accepted"
        delivery.save(update_fields=["driver", "status"])
    else:
        from deliveries.services.assignment_service import DeliveryAssignmentService

        DeliveryAssignmentService()._offer_to_next(delivery)

    from deliveries.broadcast import broadcast_delivery_status

    broadcast_delivery_status(delivery)
    return delivery
