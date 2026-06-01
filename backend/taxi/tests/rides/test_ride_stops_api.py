"""
Unit tests for Multi-Stop Ride API endpoints.
Tests: POST /rides/{id}/stops/, DELETE /rides/{id}/stops/{stop_id}/,
       POST /rides/{id}/stops/{stop_id}/arrived/,
       POST /rides/{id}/stops/{stop_id}/departed/
"""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride, RideStop

User = get_user_model()


@pytest.fixture
def rider(db):
    user = User(
        email="rider@stops.test",
        first_name="Stop",
        last_name="Rider",
        user_type="rider",
    )
    user.set_password("Pass1234!")
    user.profile_picture = "test.jpg"
    user.phone_number = "+22200000001"
    user.save()
    return user


@pytest.fixture
def driver_user(db):
    user = User(
        email="driver@stops.test",
        first_name="Stop",
        last_name="Driver",
    )
    user.set_password("Pass1234!")
    user.save()
    DriverProfile.objects.create(user=user, status="approved", is_available=True)
    return user


@pytest.fixture
def other_user(db):
    user = User(
        email="other@stops.test",
        first_name="Other",
        last_name="User",
    )
    user.set_password("Pass1234!")
    user.save()
    return user


@pytest.fixture
def ride_requested(rider, driver_user):
    return Ride.objects.create(
        rider=rider,
        driver=driver_user,
        pickup="Pickup A",
        destination="Destination B",
        status="requested",
        fare=500,
    )


@pytest.fixture
def ride_in_progress(rider, driver_user):
    return Ride.objects.create(
        rider=rider,
        driver=driver_user,
        pickup="Pickup A",
        destination="Destination B",
        status="in_progress",
        fare=500,
    )


@pytest.fixture
def rider_client(rider):
    client = APIClient()
    client.force_authenticate(user=rider)
    return client


@pytest.fixture
def driver_client(driver_user):
    client = APIClient()
    client.force_authenticate(user=driver_user)
    return client


@pytest.fixture
def other_client(other_user):
    client = APIClient()
    client.force_authenticate(user=other_user)
    return client


class TestAddStop:
    """Tests for POST /rides/{id}/stops/"""

    @pytest.mark.django_db
    def test_add_stop_success(self, rider_client, ride_requested):
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {
                "location_name": "Market",
                "latitude": 18.08,
                "longitude": -15.96,
                "stop_order": 1,
            },
        )
        assert response.status_code == 201
        assert response.data["location_name"] == "Market"
        assert response.data["stop_order"] == 1
        assert response.data["latitude"] == 18.08
        assert response.data["longitude"] == -15.96

    @pytest.mark.django_db
    def test_add_stop_auto_order(self, rider_client, ride_requested):
        """When stop_order is not provided, auto-assign next order."""
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Stop 1", "latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 201
        assert response.data["stop_order"] == 1

        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Stop 2", "latitude": 18.09, "longitude": -15.97},
        )
        assert response.status_code == 201
        assert response.data["stop_order"] == 2

    @pytest.mark.django_db
    def test_add_stop_rejects_non_requested_status(self, rider_client, ride_in_progress):
        response = rider_client.post(
            f"/rides/{ride_in_progress.id}/stops/",
            {"location_name": "Market", "latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 400
        assert "requested" in response.data["detail"]

    @pytest.mark.django_db
    def test_add_stop_rejects_non_rider(self, driver_client, ride_requested):
        response = driver_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Market", "latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_add_stop_rejects_other_user(self, other_client, ride_requested):
        response = other_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Market", "latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_add_stop_missing_location_name(self, rider_client, ride_requested):
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 400
        assert "location_name" in response.data["detail"]

    @pytest.mark.django_db
    def test_add_stop_missing_coordinates(self, rider_client, ride_requested):
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Market"},
        )
        assert response.status_code == 400
        assert "latitude" in response.data["detail"]

    @pytest.mark.django_db
    def test_add_stop_invalid_coordinates(self, rider_client, ride_requested):
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Market", "latitude": "abc", "longitude": -15.96},
        )
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_add_stop_shifts_existing_orders(self, rider_client, ride_requested):
        """Inserting a stop in the middle shifts subsequent stops."""
        # Add two stops
        rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Stop 1", "latitude": 18.08, "longitude": -15.96, "stop_order": 1},
        )
        rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Stop 2", "latitude": 18.09, "longitude": -15.97, "stop_order": 2},
        )

        # Insert at position 1
        response = rider_client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "New First", "latitude": 18.07, "longitude": -15.95, "stop_order": 1},
        )
        assert response.status_code == 201
        assert response.data["stop_order"] == 1

        # Verify existing stops shifted
        stops = list(ride_requested.stops.order_by("stop_order"))
        assert len(stops) == 3
        assert stops[0].location_name == "New First"
        assert stops[0].stop_order == 1
        assert stops[1].location_name == "Stop 1"
        assert stops[1].stop_order == 2
        assert stops[2].location_name == "Stop 2"
        assert stops[2].stop_order == 3

    @pytest.mark.django_db
    def test_add_stop_unauthenticated(self, ride_requested):
        client = APIClient()
        response = client.post(
            f"/rides/{ride_requested.id}/stops/",
            {"location_name": "Market", "latitude": 18.08, "longitude": -15.96},
        )
        assert response.status_code == 401


class TestDeleteStop:
    """Tests for DELETE /rides/{id}/stops/{stop_id}/"""

    @pytest.mark.django_db
    def test_delete_stop_success(self, rider_client, ride_requested):
        stop = RideStop.objects.create(
            ride=ride_requested,
            stop_order=1,
            location_name="Market",
            latitude=18.08,
            longitude=-15.96,
        )
        response = rider_client.delete(
            f"/rides/{ride_requested.id}/stops/{stop.id}/"
        )
        assert response.status_code == 204
        assert not RideStop.objects.filter(id=stop.id).exists()

    @pytest.mark.django_db
    def test_delete_stop_reorders_remaining(self, rider_client, ride_requested):
        """Deleting a stop re-orders remaining stops."""
        stop1 = RideStop.objects.create(
            ride=ride_requested, stop_order=1, location_name="Stop 1",
            latitude=18.08, longitude=-15.96,
        )
        stop2 = RideStop.objects.create(
            ride=ride_requested, stop_order=2, location_name="Stop 2",
            latitude=18.09, longitude=-15.97,
        )
        stop3 = RideStop.objects.create(
            ride=ride_requested, stop_order=3, location_name="Stop 3",
            latitude=18.10, longitude=-15.98,
        )

        rider_client.delete(f"/rides/{ride_requested.id}/stops/{stop1.id}/")

        stop2.refresh_from_db()
        stop3.refresh_from_db()
        assert stop2.stop_order == 1
        assert stop3.stop_order == 2

    @pytest.mark.django_db
    def test_delete_stop_rejects_non_requested_status(self, rider_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = rider_client.delete(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/"
        )
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_delete_stop_rejects_non_rider(self, driver_client, ride_requested):
        stop = RideStop.objects.create(
            ride=ride_requested, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = driver_client.delete(
            f"/rides/{ride_requested.id}/stops/{stop.id}/"
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_delete_nonexistent_stop(self, rider_client, ride_requested):
        response = rider_client.delete(
            f"/rides/{ride_requested.id}/stops/99999/"
        )
        assert response.status_code == 404


class TestStopArrived:
    """Tests for POST /rides/{id}/stops/{stop_id}/arrived/"""

    @pytest.mark.django_db
    def test_mark_arrived_success(self, driver_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/arrived/"
        )
        assert response.status_code == 200
        assert response.data["arrived_at"] is not None

    @pytest.mark.django_db
    def test_mark_arrived_rejects_non_driver(self, rider_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = rider_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/arrived/"
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_mark_arrived_rejects_non_in_progress(self, driver_client, ride_requested):
        stop = RideStop.objects.create(
            ride=ride_requested, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = driver_client.post(
            f"/rides/{ride_requested.id}/stops/{stop.id}/arrived/"
        )
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_mark_arrived_rejects_already_arrived(self, driver_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96, arrived_at=timezone.now(),
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/arrived/"
        )
        assert response.status_code == 400
        assert "Already arrived" in response.data["detail"]

    @pytest.mark.django_db
    def test_mark_arrived_enforces_order(self, driver_client, ride_in_progress):
        """Cannot arrive at stop 2 if stop 1 hasn't departed."""
        RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Stop 1",
            latitude=18.08, longitude=-15.96,
            arrived_at=timezone.now(), departed_at=None,
        )
        stop2 = RideStop.objects.create(
            ride=ride_in_progress, stop_order=2, location_name="Stop 2",
            latitude=18.09, longitude=-15.97,
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop2.id}/arrived/"
        )
        assert response.status_code == 400
        assert "depart" in response.data["detail"].lower()

    @pytest.mark.django_db
    def test_mark_arrived_allows_after_previous_departed(self, driver_client, ride_in_progress):
        """Can arrive at stop 2 after stop 1 has departed."""
        now = timezone.now()
        RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Stop 1",
            latitude=18.08, longitude=-15.96,
            arrived_at=now, departed_at=now,
        )
        stop2 = RideStop.objects.create(
            ride=ride_in_progress, stop_order=2, location_name="Stop 2",
            latitude=18.09, longitude=-15.97,
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop2.id}/arrived/"
        )
        assert response.status_code == 200
        assert response.data["arrived_at"] is not None


class TestStopDeparted:
    """Tests for POST /rides/{id}/stops/{stop_id}/departed/"""

    @pytest.mark.django_db
    def test_mark_departed_success(self, driver_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96, arrived_at=timezone.now(),
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/departed/"
        )
        assert response.status_code == 200
        assert response.data["departed_at"] is not None

    @pytest.mark.django_db
    def test_mark_departed_rejects_non_driver(self, rider_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96, arrived_at=timezone.now(),
        )
        response = rider_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/departed/"
        )
        assert response.status_code == 403

    @pytest.mark.django_db
    def test_mark_departed_rejects_not_arrived(self, driver_client, ride_in_progress):
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/departed/"
        )
        assert response.status_code == 400
        assert "arrive" in response.data["detail"].lower()

    @pytest.mark.django_db
    def test_mark_departed_rejects_already_departed(self, driver_client, ride_in_progress):
        now = timezone.now()
        stop = RideStop.objects.create(
            ride=ride_in_progress, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96,
            arrived_at=now, departed_at=now,
        )
        response = driver_client.post(
            f"/rides/{ride_in_progress.id}/stops/{stop.id}/departed/"
        )
        assert response.status_code == 400
        assert "Already departed" in response.data["detail"]

    @pytest.mark.django_db
    def test_mark_departed_rejects_non_in_progress(self, driver_client, ride_requested):
        stop = RideStop.objects.create(
            ride=ride_requested, stop_order=1, location_name="Market",
            latitude=18.08, longitude=-15.96, arrived_at=timezone.now(),
        )
        response = driver_client.post(
            f"/rides/{ride_requested.id}/stops/{stop.id}/departed/"
        )
        assert response.status_code == 400
