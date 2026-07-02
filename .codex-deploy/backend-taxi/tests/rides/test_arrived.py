"""
Tests for the driver_arrived ride status transition.
"""
import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()
client = APIClient()


def _create_driver(email="driver@arrived.test"):
    user = User(email=email, first_name="Test", last_name="Driver")
    user.set_password("Pass1234!")
    user.save()
    DriverProfile.objects.create(user=user, status="approved", is_available=True)
    return user


def _create_rider(email="rider@arrived.test"):
    user = User(email=email, first_name="Test", last_name="Rider", user_type="rider")
    user.set_password("Pass1234!")
    user.profile_picture = "test.jpg"
    user.phone_number = "+22200000000"
    user.save()
    return user


def _login(email, password="Pass1234!"):
    r = client.post("/auth/login/", {"email": email, "password": password})
    return r.data["access"]


@pytest.mark.django_db
def test_arrived_valid_transition():
    """driver_arriving → driver_arrived should succeed."""
    driver = _create_driver()
    rider = _create_rider()
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arriving", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/arrived/{ride.id}/")
    assert response.status_code == 200
    assert response.data["status"] == "driver_arrived"
    client.credentials()


@pytest.mark.django_db
def test_arrived_from_requested_blocked():
    """requested → driver_arrived should be blocked."""
    driver = _create_driver("d2@test.com")
    rider = _create_rider("r2@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="requested", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/arrived/{ride.id}/")
    assert response.status_code == 400
    client.credentials()


@pytest.mark.django_db
def test_arrived_from_completed_blocked():
    """completed → driver_arrived should be blocked."""
    driver = _create_driver("d3@test.com")
    rider = _create_rider("r3@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="completed", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/arrived/{ride.id}/")
    assert response.status_code == 400
    client.credentials()


@pytest.mark.django_db
def test_arrived_wrong_driver_blocked():
    """A different driver cannot mark arrived."""
    driver1 = _create_driver("d4@test.com")
    driver2 = _create_driver("d5@test.com")
    rider = _create_rider("r4@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver1, pickup="A", destination="B",
        status="driver_arriving", fare=300,
    )
    token = _login(driver2.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/arrived/{ride.id}/")
    assert response.status_code == 404  # wrong driver
    client.credentials()


@pytest.mark.django_db
def test_start_after_arrived():
    """driver_arrived → in_progress should succeed."""
    driver = _create_driver("d6@test.com")
    rider = _create_rider("r5@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/start/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["status"] == "in_progress"
    assert response.data["pickup_pin_verified"] is True
    client.credentials()
