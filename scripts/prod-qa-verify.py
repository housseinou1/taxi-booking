from django.contrib.auth import get_user_model
from deliveries.models import Delivery
from taxi.rides.models import Ride

User = get_user_model()
rider = User.objects.filter(email="qa-rider-profile-fix@test.local").first()
for ride_id in (49, 50, 51):
    row = Ride.objects.filter(id=ride_id).values_list("id", "status").first()
    print("ride", row)
if rider:
    for row in Delivery.objects.filter(customer=rider).order_by("-id")[:8].values_list("id", "status"):
        print("delivery", row)
    active = Delivery.objects.filter(
        customer=rider,
        status__in=(
            "requested",
            "accepted",
            "courier_arriving",
            "picked_up",
            "in_transit",
            "delivering",
            "delivery_exception",
        ),
    ).count()
    print("active_deliveries", active)
