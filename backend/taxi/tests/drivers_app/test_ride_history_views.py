"""
Tests for Ride History API endpoint.

Endpoint tested:
- GET /drivers/me/rides/?page=1&status=&date_from=&date_to=

Paginated ride history (20 per page) with date range and status filters.
Includes multi-stop data in responses.

Requirements: 13.1, 13.2, 13.6
"""

import pytest
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride, RideStop

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
RIDE_HISTORY_URL = "/drivers/me/rides/"


def _register_driver():
    """Register a driver user and return (payload, token)."""
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
    }
    reg = client.post(REGISTER_URL, payload)
    assert reg.status_code == 201, f"Registration failed: {reg.data}"

    login = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login.status_code == 200, f"Login failed: {login.data}"

    token = login.data["access"]
    return payload, token


def _register_rider():
    """Register a rider user and return the User instance."""
    from authapp.models import User

    email = faker.email()
    user = User(
        email=email,
        first_name=faker.first_name(),
        last_name=faker.last_name(),
        user_type="rider",
        phone_number=faker.numerify("+222########"),
    )
    user.set_password(f"Test@{faker.numerify('####')}Ab")
    user.save()
    return user


def _get_authenticated_client(token):
    """Return a client with auth credentials set."""
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


def _create_ride(driver_user, rider_user, status="completed", days_ago=0, fare="500.00"):
    """Create a ride for the driver."""
    created_time = timezone.now() - timedelta(days=days_ago)
    ride = Ride.objects.create(
        rider=rider_user,
        driver=driver_user,
        pickup="Pickup Location",
        destination="Destination",
        status=status,
        fare=Decimal(fare),
        driver_earning=Decimal("400.00"),
        distance_km=Decimal("5.50"),
        completed_at=created_time if status == "completed" else None,
    )
    # Override created_at since auto_now_add doesn't allow setting it directly
    Ride.objects.filter(pk=ride.pk).update(created_at=created_time)
    ride.refresh_from_db()
    return ride


@pytest.mark.django_db
class TestDriverRideHistoryView:
    """Tests for GET /drivers/me/rides/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(RIDE_HISTORY_URL)
        assert response.status_code == 401

    def test_no_profile_returns_404(self):
        # Register a rider (no driver profile)
        from authapp.models import User

        email = faker.email()
        user = User(
            email=email,
            first_name="Test",
            last_name="Rider",
            user_type="rider",
        )
        user.set_password("Test@1234Ab")
        user.save()

        login = client.post(LOGIN_URL, {
            "email": email,
            "password": "Test@1234Ab",
        })
        token = login.data["access"]
        c = _get_authenticated_client(token)

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 404

    def test_empty_ride_history(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        data = response.data
        assert data["count"] == 0
        assert data["total_pages"] == 1
        assert data["current_page"] == 1
        assert data["page_size"] == 20
        assert data["results"] == []

    def test_returns_rides_for_driver(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="completed", days_ago=2)

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        data = response.data
        assert data["count"] == 2
        assert len(data["results"]) == 2

    def test_rides_ordered_by_created_at_descending(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        ride_old = _create_ride(driver_user, rider, status="completed", days_ago=5)
        ride_new = _create_ride(driver_user, rider, status="completed", days_ago=1)

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        results = response.data["results"]
        assert results[0]["id"] == ride_new.id
        assert results[1]["id"] == ride_old.id

    def test_pagination_at_20_per_page(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Create 25 rides
        for i in range(25):
            _create_ride(driver_user, rider, status="completed", days_ago=i)

        # Page 1 should have 20 rides
        response = c.get(f"{RIDE_HISTORY_URL}?page=1")
        assert response.status_code == 200
        data = response.data
        assert len(data["results"]) == 20
        assert data["count"] == 25
        assert data["total_pages"] == 2
        assert data["current_page"] == 1

        # Page 2 should have 5 rides
        response = c.get(f"{RIDE_HISTORY_URL}?page=2")
        assert response.status_code == 200
        data = response.data
        assert len(data["results"]) == 5
        assert data["current_page"] == 2

    def test_filter_by_status(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="completed", days_ago=2)
        _create_ride(driver_user, rider, status="cancelled", days_ago=3)

        # Filter by completed
        response = c.get(f"{RIDE_HISTORY_URL}?status=completed")
        assert response.status_code == 200
        assert response.data["count"] == 2
        for ride in response.data["results"]:
            assert ride["status"] == "completed"

        # Filter by cancelled
        response = c.get(f"{RIDE_HISTORY_URL}?status=cancelled")
        assert response.status_code == 200
        assert response.data["count"] == 1
        assert response.data["results"][0]["status"] == "cancelled"

    def test_filter_by_date_range(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="completed", days_ago=5)
        _create_ride(driver_user, rider, status="completed", days_ago=10)

        # Filter to only include rides from last 3 days
        date_from = (timezone.now() - timedelta(days=3)).strftime("%Y-%m-%d")
        date_to = timezone.now().strftime("%Y-%m-%d")

        response = c.get(f"{RIDE_HISTORY_URL}?date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_filter_by_date_from_only(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="completed", days_ago=10)
        _create_ride(driver_user, rider, status="completed", days_ago=20)

        # Only rides from last 5 days
        date_from = (timezone.now() - timedelta(days=5)).strftime("%Y-%m-%d")

        response = c.get(f"{RIDE_HISTORY_URL}?date_from={date_from}")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_combined_status_and_date_filter(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="cancelled", days_ago=2)
        _create_ride(driver_user, rider, status="completed", days_ago=10)

        date_from = (timezone.now() - timedelta(days=5)).strftime("%Y-%m-%d")

        response = c.get(f"{RIDE_HISTORY_URL}?status=completed&date_from={date_from}")
        assert response.status_code == 200
        assert response.data["count"] == 1
        assert response.data["results"][0]["status"] == "completed"

    def test_ride_includes_multi_stop_data(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        ride = _create_ride(driver_user, rider, status="completed", days_ago=1)

        # Add stops
        now = timezone.now()
        RideStop.objects.create(
            ride=ride,
            stop_order=1,
            location_name="Stop A",
            latitude=18.08,
            longitude=-15.96,
            arrived_at=now - timedelta(hours=1),
            departed_at=now - timedelta(minutes=50),
        )
        RideStop.objects.create(
            ride=ride,
            stop_order=2,
            location_name="Stop B",
            latitude=18.09,
            longitude=-15.97,
            arrived_at=now - timedelta(minutes=40),
            departed_at=now - timedelta(minutes=30),
        )

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        result = response.data["results"][0]
        assert result["has_stops"] is True
        assert result["stop_count"] == 2
        assert len(result["stops"]) == 2
        assert result["stops"][0]["stop_order"] == 1
        assert result["stops"][0]["location_name"] == "Stop A"
        assert result["stops"][1]["stop_order"] == 2
        assert result["stops"][1]["location_name"] == "Stop B"

    def test_ride_without_stops(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        result = response.data["results"][0]
        assert result["has_stops"] is False
        assert result["stop_count"] == 0
        assert result["stops"] == []

    def test_ride_data_fields(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1, fare="750.50")

        response = c.get(RIDE_HISTORY_URL)
        assert response.status_code == 200

        result = response.data["results"][0]
        assert "id" in result
        assert "pickup" in result
        assert "destination" in result
        assert "fare" in result
        assert "status" in result
        assert "created_at" in result
        assert "rider_name" in result
        assert "stops" in result
        assert result["fare"] == "750.50"
        assert result["status"] == "completed"

    def test_invalid_page_defaults_to_1(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(f"{RIDE_HISTORY_URL}?page=abc")
        assert response.status_code == 200
        assert response.data["current_page"] == 1

    def test_does_not_return_other_drivers_rides(self):
        payload1, token1 = _register_driver()
        payload2, token2 = _register_driver()

        from authapp.models import User
        driver1 = User.objects.get(email=payload1["email"])
        driver2 = User.objects.get(email=payload2["email"])
        rider = _register_rider()

        _create_ride(driver1, rider, status="completed", days_ago=1)
        _create_ride(driver2, rider, status="completed", days_ago=1)

        c1 = _get_authenticated_client(token1)
        response = c1.get(RIDE_HISTORY_URL)
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_empty_status_filter_returns_all(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_ride(driver_user, rider, status="completed", days_ago=1)
        _create_ride(driver_user, rider, status="cancelled", days_ago=2)

        response = c.get(f"{RIDE_HISTORY_URL}?status=")
        assert response.status_code == 200
        assert response.data["count"] == 2
