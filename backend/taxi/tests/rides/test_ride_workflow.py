"""
Unit tests for the RideWorkflowEngine service.
Tests validate_transition(), transition_ride(), handle_request_timeout(),
and multi-stop completion enforcement.
"""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride, RideStop
from taxi.drivers.services.ride_workflow import (
    VALID_TRANSITIONS,
    validate_transition,
    transition_ride,
    handle_request_timeout,
    TransitionResult,
)

User = get_user_model()


@pytest.fixture
def rider(db):
    user = User(
        email="rider@workflow.test",
        first_name="Test",
        last_name="Rider",
        user_type="rider",
    )
    user.set_password("Pass1234!")
    user.profile_picture = "test.jpg"
    user.phone_number = "+22200000000"
    user.save()
    return user


@pytest.fixture
def driver_user(db):
    user = User(
        email="driver@workflow.test",
        first_name="Test",
        last_name="Driver",
    )
    user.set_password("Pass1234!")
    user.save()
    DriverProfile.objects.create(user=user, status="approved", is_available=True)
    return user


@pytest.fixture
def ride(rider, driver_user):
    return Ride.objects.create(
        rider=rider,
        driver=driver_user,
        pickup="Pickup A",
        destination="Destination B",
        status="requested",
        fare=500,
    )


class TestValidateTransition:
    """Tests for validate_transition()."""

    def test_requested_to_driver_arriving_valid(self):
        assert validate_transition("requested", "driver_arriving") is True

    def test_requested_to_cancelled_valid(self):
        assert validate_transition("requested", "cancelled") is True

    def test_driver_arriving_to_driver_arrived_valid(self):
        assert validate_transition("driver_arriving", "driver_arrived") is True

    def test_driver_arriving_to_cancelled_valid(self):
        assert validate_transition("driver_arriving", "cancelled") is True

    def test_driver_arrived_to_in_progress_valid(self):
        assert validate_transition("driver_arrived", "in_progress") is True

    def test_driver_arrived_to_cancelled_valid(self):
        assert validate_transition("driver_arrived", "cancelled") is True

    def test_in_progress_to_completed_valid(self):
        assert validate_transition("in_progress", "completed") is True

    def test_completed_is_terminal(self):
        assert validate_transition("completed", "requested") is False
        assert validate_transition("completed", "cancelled") is False
        assert validate_transition("completed", "in_progress") is False

    def test_cancelled_is_terminal(self):
        assert validate_transition("cancelled", "requested") is False
        assert validate_transition("cancelled", "driver_arriving") is False

    def test_requested_to_completed_invalid(self):
        assert validate_transition("requested", "completed") is False

    def test_requested_to_in_progress_invalid(self):
        assert validate_transition("requested", "in_progress") is False

    def test_in_progress_to_cancelled_invalid(self):
        assert validate_transition("in_progress", "cancelled") is False

    def test_driver_arriving_to_in_progress_invalid(self):
        assert validate_transition("driver_arriving", "in_progress") is False

    def test_unknown_status_returns_false(self):
        assert validate_transition("unknown", "completed") is False

    def test_same_status_transition_invalid(self):
        for status in VALID_TRANSITIONS:
            assert validate_transition(status, status) is False


class TestTransitionRide:
    """Tests for transition_ride()."""

    @pytest.mark.django_db
    def test_valid_transition_requested_to_arriving(self, ride, driver_user):
        result = transition_ride(ride, "driver_arriving", actor=driver_user)
        assert result.success is True
        assert result.error is None
        ride.refresh_from_db()
        assert ride.status == "driver_arriving"

    @pytest.mark.django_db
    def test_valid_transition_arriving_to_arrived(self, ride, driver_user):
        ride.status = "driver_arriving"
        ride.save()
        result = transition_ride(ride, "driver_arrived", actor=driver_user)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "driver_arrived"

    @pytest.mark.django_db
    def test_valid_transition_arrived_to_in_progress(self, ride, driver_user):
        ride.status = "driver_arrived"
        ride.save()
        result = transition_ride(ride, "in_progress", actor=driver_user)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "in_progress"

    @pytest.mark.django_db
    def test_valid_transition_in_progress_to_completed(self, ride, driver_user):
        ride.status = "in_progress"
        ride.save()
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "completed"
        assert ride.completed_at is not None

    @pytest.mark.django_db
    def test_invalid_transition_returns_error(self, ride, driver_user):
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is False
        assert "Invalid transition" in result.error
        ride.refresh_from_db()
        assert ride.status == "requested"

    @pytest.mark.django_db
    def test_cancellation_from_arriving(self, ride, driver_user):
        ride.status = "driver_arriving"
        ride.save()
        result = transition_ride(ride, "cancelled", actor=driver_user)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "cancelled"

    @pytest.mark.django_db
    def test_cancellation_from_arrived(self, ride, driver_user):
        ride.status = "driver_arrived"
        ride.save()
        result = transition_ride(ride, "cancelled", actor=driver_user)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "cancelled"

    @pytest.mark.django_db
    def test_cancellation_from_in_progress_rejected(self, ride, driver_user):
        ride.status = "in_progress"
        ride.save()
        result = transition_ride(ride, "cancelled", actor=driver_user)
        assert result.success is False
        assert "Invalid transition" in result.error
        ride.refresh_from_db()
        assert ride.status == "in_progress"


class TestMultiStopCompletion:
    """Tests for multi-stop ride completion enforcement."""

    @pytest.mark.django_db
    def test_completion_allowed_when_no_stops(self, ride, driver_user):
        """Rides without stops can be completed normally."""
        ride.status = "in_progress"
        ride.save()
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is True

    @pytest.mark.django_db
    def test_completion_blocked_when_stop_not_arrived(self, ride, driver_user):
        """Cannot complete if a stop has no arrived_at."""
        ride.status = "in_progress"
        ride.save()
        RideStop.objects.create(
            ride=ride,
            stop_order=1,
            location_name="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            arrived_at=None,
            departed_at=timezone.now(),
        )
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is False
        assert "stop(s) have not been fully visited" in result.error

    @pytest.mark.django_db
    def test_completion_blocked_when_stop_not_departed(self, ride, driver_user):
        """Cannot complete if a stop has no departed_at."""
        ride.status = "in_progress"
        ride.save()
        RideStop.objects.create(
            ride=ride,
            stop_order=1,
            location_name="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            arrived_at=timezone.now(),
            departed_at=None,
        )
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is False
        assert "stop(s) have not been fully visited" in result.error

    @pytest.mark.django_db
    def test_completion_allowed_when_all_stops_visited(self, ride, driver_user):
        """Can complete when all stops have arrived_at and departed_at."""
        ride.status = "in_progress"
        ride.save()
        now = timezone.now()
        RideStop.objects.create(
            ride=ride,
            stop_order=1,
            location_name="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            arrived_at=now,
            departed_at=now,
        )
        RideStop.objects.create(
            ride=ride,
            stop_order=2,
            location_name="Stop 2",
            latitude=18.09,
            longitude=-15.97,
            arrived_at=now,
            departed_at=now,
        )
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is True

    @pytest.mark.django_db
    def test_completion_blocked_partial_stops(self, ride, driver_user):
        """If one of multiple stops is incomplete, completion is blocked."""
        ride.status = "in_progress"
        ride.save()
        now = timezone.now()
        RideStop.objects.create(
            ride=ride,
            stop_order=1,
            location_name="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            arrived_at=now,
            departed_at=now,
        )
        RideStop.objects.create(
            ride=ride,
            stop_order=2,
            location_name="Stop 2",
            latitude=18.09,
            longitude=-15.97,
            arrived_at=None,
            departed_at=None,
        )
        result = transition_ride(ride, "completed", actor=driver_user)
        assert result.success is False


class TestHandleRequestTimeout:
    """Tests for handle_request_timeout()."""

    @pytest.mark.django_db
    def test_timeout_removes_driver_from_requested_ride(self, ride):
        assert ride.status == "requested"
        result = handle_request_timeout(ride)
        assert result.success is True
        ride.refresh_from_db()
        assert ride.status == "requested"  # Stays requested for reassignment
        assert ride.driver is None  # Driver removed

    @pytest.mark.django_db
    def test_timeout_noop_if_already_accepted(self, ride):
        ride.status = "driver_arriving"
        ride.save()
        result = handle_request_timeout(ride)
        assert result.success is False
        assert "no longer in 'requested' status" in result.error
        ride.refresh_from_db()
        assert ride.status == "driver_arriving"

    @pytest.mark.django_db
    def test_timeout_noop_if_cancelled(self, ride):
        ride.status = "cancelled"
        ride.save()
        result = handle_request_timeout(ride)
        assert result.success is False
        ride.refresh_from_db()
        assert ride.status == "cancelled"
