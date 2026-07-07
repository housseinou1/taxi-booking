from django.contrib.auth import get_user_model
from django.utils import timezone

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()
user = User.objects.filter(email="qa-driver-final-qa@test.local").first()
if not user:
    raise SystemExit("qa driver missing")
user.phone_verified_at = timezone.now()
user.save(update_fields=["phone_verified_at"])
profile, _ = DriverProfile.objects.get_or_create(user=user)
profile.status = "approved"
profile.is_available = True
profile.save(update_fields=["status", "is_available"])

rider = User.objects.filter(email="qa-rider-profile-fix@test.local").first()
if rider:
    open_rides = Ride.objects.filter(
        rider=rider,
        status__in=["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"],
    )
    for ride in open_rides:
        ride.status = "cancelled"
        ride.cancelled_by = "admin"
        ride.cancellation_reason = "QA cleanup"
        ride.cancelled_at = timezone.now()
        ride.save(update_fields=["status", "cancelled_by", "cancellation_reason", "cancelled_at"])
    print("cancelled_open_rides", open_rides.count())

print("driver_ready", user.id, profile.status)
