from django.contrib.auth import get_user_model
from django.utils import timezone

from taxi.rides.models import Ride

User = get_user_model()
driver = User.objects.filter(email="qa-driver-final-qa@test.local").first()
rider = User.objects.filter(email="qa-rider-profile-fix@test.local").first()
if not driver or not rider:
    raise SystemExit("missing qa users")

Ride.objects.filter(
    rider=rider,
    status__in=["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"],
).update(
    status="cancelled",
    cancelled_by="admin",
    cancellation_reason="QA cleanup",
    cancelled_at=timezone.now(),
)

ride = Ride.objects.create(
    rider=rider,
    driver=driver,
    pickup="QA Pickup",
    destination="QA Destination",
    distance_km=8,
    fare=250,
    status="driver_arrived",
)
print("ride_id", ride.id)
