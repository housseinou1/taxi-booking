"""
Tests for the driver_arrived ride status transition.
"""
import hashlib

import pytest
from django.utils import timezone
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
    digest = hashlib.sha1(email.encode("utf-8")).hexdigest()
    ip_last_octet = 1 + (int(digest[:2], 16) % 250)
    r = client.post(
        "/auth/login/",
        {"email": email, "password": password},
        REMOTE_ADDR=f"10.77.0.{ip_last_octet}",
    )
    return r.data["access"]


PICKUP_LAT = 18.085
PICKUP_LNG = -15.955


@pytest.mark.django_db
def test_arrived_valid_transition():
    """driver_arriving → driver_arrived should succeed."""
    driver = _create_driver()
    rider = _create_rider()
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arriving", fare=300,
        pickup_lat=PICKUP_LAT, pickup_lng=PICKUP_LNG,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/arrived/{ride.id}/",
        {"lat": PICKUP_LAT, "lng": PICKUP_LNG},
    )
    assert response.status_code == 200
    assert response.data["status"] == "driver_arrived"
    client.credentials()


@pytest.mark.django_db
def test_arrived_requires_driver_gps():
    """driver_arrived requires real driver GPS instead of silent fallback."""
    driver = _create_driver("d-gps-required@test.com")
    rider = _create_rider("r-gps-required@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arriving", fare=300,
        pickup_lat=PICKUP_LAT, pickup_lng=PICKUP_LNG,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/arrived/{ride.id}/")
    assert response.status_code == 400
    assert "location" in response.data["detail"].lower()
    client.credentials()


@pytest.mark.django_db
def test_arrived_blocks_far_driver_gps():
    """driver_arrived blocks coordinates outside the 350m arrive geofence."""
    driver = _create_driver("d-far-gps@test.com")
    rider = _create_rider("r-far-gps@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arriving", fare=300,
        pickup_lat=PICKUP_LAT, pickup_lng=PICKUP_LNG,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/arrived/{ride.id}/",
        {"lat": 18.2, "lng": -15.8},
    )
    assert response.status_code == 400
    assert response.data["distance_m"] > response.data["max_distance_m"]
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
def test_verify_pin_keeps_driver_arrived():
    """PIN verification must not start the trip."""
    driver = _create_driver("d7@test.com")
    rider = _create_rider("r6@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["status"] == "driver_arrived"
    assert response.data["pickup_pin_verified"] is True
    client.credentials()


@pytest.mark.django_db
def test_start_requires_verified_pin():
    """Start ride should fail until PIN is verified."""
    driver = _create_driver("d8@test.com")
    rider = _create_rider("r7@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(f"/rides/start/{ride.id}/", {}, format="json")
    assert response.status_code == 400
    assert "verify" in response.data["detail"].lower()
    client.credentials()


@pytest.mark.django_db
def test_driver_can_cancel_after_pin_verified():
    """Driver may cancel after PIN verification but before trip starts."""
    driver = _create_driver("d9@test.com")
    rider = _create_rider("r8@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    verify = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert verify.status_code == 200
    cancel = client.post(
        f"/rides/cancel/{ride.id}/",
        {"reason": "Vehicle issue"},
        format="json",
    )
    assert cancel.status_code == 200
    assert cancel.data["status"] == "cancelled"
    client.credentials()


@pytest.mark.django_db
def test_wrong_pickup_pin_rejected():
    driver = _create_driver("d-pin-wrong@test.com")
    rider = _create_rider("r-pin-wrong@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": "0000"},
        format="json",
    )
    assert response.status_code == 400
    ride.refresh_from_db()
    assert ride.pickup_pin_verified_at is None
    client.credentials()


@pytest.mark.django_db
def test_verify_pin_rejected_after_ride_started():
    driver = _create_driver("d-pin-expired@test.com")
    rider = _create_rider("r-pin-expired@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
        pickup_pin_verified_at=timezone.now(),
    )
    ride.status = "in_progress"
    ride.save(update_fields=["status"])
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert response.status_code == 400
    assert "expired" in response.data["detail"].lower()
    client.credentials()


@pytest.mark.django_db
def test_duplicate_start_is_idempotent():
    driver = _create_driver("d-dup-start@test.com")
    rider = _create_rider("r-dup-start@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
        pickup_pin_verified_at=timezone.now(),
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    first = client.post(f"/rides/start/{ride.id}/", {}, format="json")
    second = client.post(f"/rides/start/{ride.id}/", {}, format="json")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["status"] == "in_progress"
    assert second.data["status"] == "in_progress"
    client.credentials()


@pytest.mark.django_db
def test_start_after_arrived():
    """driver_arrived → in_progress should succeed after PIN verification."""
    driver = _create_driver("d6@test.com")
    rider = _create_rider("r5@test.com")
    ride = Ride.objects.create(
        rider=rider, driver=driver, pickup="A", destination="B",
        status="driver_arrived", fare=300,
    )
    token = _login(driver.email)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    verify = client.post(
        f"/rides/verify-pin/{ride.id}/",
        {"pickup_pin": ride.pickup_pin},
        format="json",
    )
    assert verify.status_code == 200
    response = client.post(
        f"/rides/start/{ride.id}/",
        {},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["status"] == "in_progress"
    assert response.data["pickup_pin_verified"] is True
    client.credentials()
