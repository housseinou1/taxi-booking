from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride


pytestmark = pytest.mark.django_db
User = get_user_model()


def _ride(rider, pickup, lat, lng, status="requested", hours_ago=0):
    ride = Ride.objects.create(
        rider=rider,
        pickup=pickup,
        destination="Destination",
        pickup_lat=lat,
        pickup_lng=lng,
        destination_lat=18.10,
        destination_lng=-15.95,
        status=status,
    )
    Ride.objects.filter(id=ride.id).update(created_at=now() - timedelta(hours=hours_ago))
    return ride


def test_admin_heatmap_aggregates_demand_coverage_and_peak_hours():
    admin = User.objects.create_user(email="admin@heatmap.test", password="test", is_staff=True)
    rider = User.objects.create_user(email="rider@heatmap.test", password="test")
    driver = User.objects.create_user(email="driver@heatmap.test", password="test")
    DriverProfile.objects.create(
        user=driver,
        status="approved",
        is_available=True,
        current_lat=18.071,
        current_lng=-15.959,
    )
    _ride(rider, "Sebkha", 18.0735, -15.9582, status="completed")
    _ride(rider, "Sebkha", 18.0740, -15.9580, status="cancelled")

    client = APIClient()
    client.force_authenticate(admin)
    response = client.get("/rides/analytics/admin/activity-heatmap/?period=daily")

    assert response.status_code == 200
    assert response.data["summary"]["ride_requests"] == 2
    assert response.data["summary"]["available_drivers"] == 1
    assert response.data["zones"][0]["label"] == "Sebkha"
    assert response.data["zones"][0]["requests"] == 2
    assert len(response.data["peak_hours"]) == 24


def test_non_admin_cannot_view_activity_heatmap():
    rider = User.objects.create_user(email="rider-only@heatmap.test", password="test")
    client = APIClient()
    client.force_authenticate(rider)
    response = client.get("/rides/analytics/admin/activity-heatmap/")
    assert response.status_code == 403
