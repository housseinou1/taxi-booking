"""
Tests for rider waiting fee policy.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride
from taxi.rides.services.waiting_service import calculate_waiting_fee, get_waiting_status

User = get_user_model()
client = APIClient()


def _create_driver(email="driver@waiting.test"):
    user = User(email=email, first_name="Test", last_name="Driver")
    user.set_password("Pass1234!")
    user.save()
    DriverProfile.objects.create(user=user, status="approved", is_available=True)
    return user


def _create_rider(email="rider@waiting.test"):
    user = User(email=email, first_name="Test", last_name="Rider", user_type="rider")
    user.set_password("Pass1234!")
    user.save()
    return user


def _login(email, password="Pass1234!"):
    response = client.post("/auth/login/", {"email": email, "password": password})
    return response.data["access"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "waited_seconds,expected_fee",
    [
        (0, Decimal("0.00")),
        (3 * 60, Decimal("0.00")),
        (3 * 60 + 1, Decimal("50.00")),
        (4 * 60 + 30, Decimal("100.00")),
        (8 * 60 + 1, Decimal("300.00")),
        (10 * 60, Decimal("350.00")),
    ],
)
def test_calculate_waiting_fee(waited_seconds, expected_fee):
    assert calculate_waiting_fee(waited_seconds) == expected_fee


@pytest.mark.django_db
def test_waiting_status_during_driver_arrived():
    driver = _create_driver("driver-status@test.com")
    rider = _create_rider("rider-status@test.com")
    arrived_at = timezone.now() - timedelta(minutes=4, seconds=10)
    ride = Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup="A",
        destination="B",
        status="driver_arrived",
        fare=Decimal("300.00"),
        driver_arrived_at=arrived_at,
    )

    status_payload = get_waiting_status(ride)

    assert status_payload["active"] is True
    assert status_payload["billing_started"] is True
    assert status_payload["chargeable_minutes"] == 2
    assert status_payload["estimated_fee"] == "100.00"


@pytest.mark.django_db
def test_start_ride_applies_waiting_fee_without_cap():
    driver = _create_driver("driver-fee@test.com")
    rider = _create_rider("rider-fee@test.com")
    arrived_at = timezone.now() - timedelta(minutes=10)
    ride = Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup="A",
        destination="B",
        status="driver_arrived",
        fare=Decimal("300.00"),
        driver_arrived_at=arrived_at,
    )

    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    verify = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert verify.status_code == 200
    # Freeze wait at exactly 10 minutes so login/verify latency cannot
    # add an extra chargeable minute to the fee assertion.
    start_at = arrived_at + timedelta(minutes=10)
    with patch("taxi.rides.views.now", return_value=start_at):
        response = client.post(
            f"/rides/start/{ride.id}/",
            {},
            format="json",
        )

    assert response.status_code == 200
    assert response.data["status"] == "in_progress"
    assert Decimal(response.data["waiting_fee"]) == Decimal("350.00")
    assert Decimal(response.data["fare"]) == Decimal("650.00")
    client.credentials()


@pytest.mark.django_db
def test_ride_serializer_exposes_waiting_status():
    from rest_framework.test import APIRequestFactory

    from taxi.rides.serializers import RideSerializer

    driver = _create_driver("driver-serializer@test.com")
    rider = _create_rider("rider-serializer@test.com")
    arrived_at = timezone.now() - timedelta(minutes=2)
    ride = Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup="A",
        destination="B",
        status="driver_arrived",
        fare=Decimal("300.00"),
        driver_arrived_at=arrived_at,
    )

    request = APIRequestFactory().get("/")
    request.user = rider
    payload = RideSerializer(ride, context={"request": request}).data

    assert payload["waiting_status"]["active"] is True
    assert payload["waiting_status"]["billing_started"] is False
    assert payload["waiting_status"]["free_minutes"] == 3
