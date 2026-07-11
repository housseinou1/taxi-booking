"""Prepare production for driver release device QA (run inside django container)."""
from django.contrib.auth import get_user_model
from django.utils import timezone

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()

QA_DRIVER_EMAIL = "amadou.diallo@yala.mr"
QA_RIDER_EMAIL = "qa-rider-profile-fix@test.local"
NOUAKCHOTT_LAT = 18.0735
NOUAKCHOTT_LNG = -15.9582

ACTIVE_RIDE_STATUSES = (
    "requested",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_arrived",
    "in_progress",
    "scheduled",
)


def main() -> None:
    qa_user = User.objects.filter(email=QA_DRIVER_EMAIL).first()
    if not qa_user:
        raise SystemExit(f"Missing QA driver account: {QA_DRIVER_EMAIL}")

    offlined = (
        DriverProfile.objects.exclude(user=qa_user)
        .filter(is_available=True)
        .update(is_available=False)
    )
    print(f"offlined_other_drivers count={offlined}")

    profile, _ = DriverProfile.objects.get_or_create(user=qa_user)
    profile.status = "approved"
    profile.is_available = False
    profile.current_lat = NOUAKCHOTT_LAT
    profile.current_lng = NOUAKCHOTT_LNG
    profile.driver_lat = NOUAKCHOTT_LAT
    profile.driver_lng = NOUAKCHOTT_LNG
    profile.save(
        update_fields=[
            "status",
            "is_available",
            "current_lat",
            "current_lng",
            "driver_lat",
            "driver_lng",
        ]
    )
    print(
        f"qa_driver_ready profile_id={profile.id} user_id={qa_user.id} "
        f"online={profile.is_available} (device must tap Go Online)"
    )

    cancelled = 0
    for ride in Ride.objects.filter(driver=qa_user, status__in=ACTIVE_RIDE_STATUSES):
        ride.status = "cancelled"
        ride.cancelled_at = timezone.now()
        ride.cancelled_by = "admin"
        ride.cancellation_reason = "Driver release QA prep"
        ride.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancelled_by",
                "cancellation_reason",
            ]
        )
        cancelled += 1

    rider = User.objects.filter(email=QA_RIDER_EMAIL).first()
    if rider:
        for ride in Ride.objects.filter(
            rider=rider,
            status__in=ACTIVE_RIDE_STATUSES,
        ):
            ride.status = "cancelled"
            ride.cancelled_at = timezone.now()
            ride.cancelled_by = "admin"
            ride.cancellation_reason = "Driver release QA prep"
            ride.save(
                update_fields=[
                    "status",
                    "cancelled_at",
                    "cancelled_by",
                    "cancellation_reason",
                ]
            )
            cancelled += 1

    for ride in Ride.objects.filter(status="requested", driver__isnull=True):
        ride.status = "cancelled"
        ride.cancelled_at = timezone.now()
        ride.cancelled_by = "admin"
        ride.cancellation_reason = "Driver release QA prep"
        ride.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancelled_by",
                "cancellation_reason",
            ]
        )
        cancelled += 1

    print(f"cancelled_open_rides count={cancelled}")


main()
