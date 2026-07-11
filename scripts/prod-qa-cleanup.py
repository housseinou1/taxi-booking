"""Clean stuck QA rides/deliveries on production (run inside django container)."""
from django.contrib.auth import get_user_model
from django.utils import timezone

from deliveries.models import Delivery
from taxi.rides.models import Ride

User = get_user_model()

RIDER_EMAIL = "qa-rider-profile-fix@test.local"
COURIER_EMAIL = "qa-driver-final-qa@test.local"
TARGET_RIDE_IDS = (49, 50, 51)

ACTIVE_RIDE_STATUSES = (
    "requested",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
    "scheduled",
)

ACTIVE_DELIVERY_STATUSES = (
    "requested",
    "accepted",
    "courier_arriving",
    "picked_up",
    "in_transit",
    "delivering",
    "delivery_exception",
)


def cancel_ride(ride, reason="QA cleanup"):
    before = ride.status
    if before in ("completed", "cancelled"):
        return None
    if before not in ACTIVE_RIDE_STATUSES:
        return None
    ride.status = "cancelled"
    ride.cancelled_at = timezone.now()
    ride.cancelled_by = "admin"
    ride.cancellation_reason = reason
    ride.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
        ]
    )
    return before


def cancel_delivery(delivery, reason="QA cleanup"):
    before = delivery.status
    if before in ("delivered", "cancelled"):
        return None
    if before not in ACTIVE_DELIVERY_STATUSES:
        return None
    delivery.status = "cancelled"
    delivery.save(update_fields=["status"])
    return before


def main():
    ride_actions = []
    delivery_actions = []

    for ride_id in TARGET_RIDE_IDS:
        ride = Ride.objects.filter(id=ride_id).first()
        if not ride:
            ride_actions.append(f"ride_{ride_id}=missing")
            continue
        before = cancel_ride(ride)
        if before:
            ride_actions.append(f"ride_{ride_id}={before}->cancelled")
        else:
            ride_actions.append(f"ride_{ride_id}={ride.status}(unchanged)")

    rider = User.objects.filter(email=RIDER_EMAIL).first()
    courier = User.objects.filter(email=COURIER_EMAIL).first()

    if rider:
        for ride in Ride.objects.filter(rider=rider, status__in=ACTIVE_RIDE_STATUSES).exclude(
            id__in=TARGET_RIDE_IDS
        ):
            before = cancel_ride(ride)
            if before:
                ride_actions.append(f"ride_{ride.id}={before}->cancelled")

    qa_users = [u for u in (rider, courier) if u]
    for user in qa_users:
        for delivery in Delivery.objects.filter(customer=user, status__in=ACTIVE_DELIVERY_STATUSES):
            before = cancel_delivery(delivery)
            if before:
                delivery_actions.append(f"delivery_{delivery.id}={before}->cancelled")

    if courier:
        for delivery in Delivery.objects.filter(driver=courier, status__in=ACTIVE_DELIVERY_STATUSES):
            before = cancel_delivery(delivery)
            if before:
                delivery_actions.append(f"delivery_{delivery.id}={before}->cancelled")

    # Orphaned QA deliveries: requested with no driver, QA rider customer, older than 1 hour
    if rider:
        cutoff = timezone.now() - timezone.timedelta(hours=1)
        for delivery in Delivery.objects.filter(
            customer=rider,
            status="requested",
            driver__isnull=True,
            created_at__lt=cutoff,
        ):
            before = cancel_delivery(delivery)
            if before:
                delivery_actions.append(f"orphan_delivery_{delivery.id}={before}->cancelled")

    print("rides_cleaned", len([a for a in ride_actions if "->cancelled" in a]))
    print("deliveries_cleaned", len(delivery_actions))
    for action in ride_actions:
        print("ride", action)
    for action in delivery_actions:
        print("delivery", action)
    if not ride_actions and not delivery_actions:
        print("nothing_to_clean")


main()
