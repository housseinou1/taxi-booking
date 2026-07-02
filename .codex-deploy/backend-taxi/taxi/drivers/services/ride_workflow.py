"""
Ride Workflow Engine - Strict state machine for ride status transitions.

Enforces the valid transition map:
    requested → driver_arriving, cancelled
    driver_arriving → driver_arrived, cancelled
    driver_arrived → in_progress, cancelled
    in_progress → completed
    completed → (terminal)
    cancelled → (terminal)

Multi-stop support: when transitioning to "completed", all RideStop objects
for the ride must have both arrived_at and departed_at set.
"""

from dataclasses import dataclass
from typing import Optional

from django.utils import timezone


# Valid state transitions map
VALID_TRANSITIONS = {
    "requested": ["driver_arriving", "cancelled"],
    "driver_arriving": ["driver_arrived", "cancelled"],
    "driver_arrived": ["in_progress", "cancelled"],
    "in_progress": ["completed"],
    "completed": [],
    "cancelled": [],
}


@dataclass
class TransitionResult:
    """Result of a ride state transition attempt."""

    success: bool
    error: Optional[str] = None
    ride: Optional[object] = None


def validate_transition(current_status: str, new_status: str) -> bool:
    """
    Check whether a transition from current_status to new_status is valid.

    Args:
        current_status: The ride's current status.
        new_status: The desired target status.

    Returns:
        True if the transition is allowed, False otherwise.
    """
    allowed = VALID_TRANSITIONS.get(current_status, [])
    return new_status in allowed


def transition_ride(ride, new_status: str, actor=None) -> TransitionResult:
    """
    Attempt to transition a ride to a new status, enforcing the state machine.

    Args:
        ride: The Ride model instance.
        new_status: The desired target status.
        actor: The user performing the transition (optional, for audit).

    Returns:
        TransitionResult indicating success or failure with error detail.
    """
    current_status = ride.status

    # Validate the transition
    if not validate_transition(current_status, new_status):
        return TransitionResult(
            success=False,
            error=f"Invalid transition from '{current_status}' to '{new_status}'.",
        )

    # Multi-stop completion check: all stops must have arrived_at and departed_at
    if new_status == "completed":
        incomplete_stops = ride.stops.filter(
            arrived_at__isnull=True
        ) | ride.stops.filter(departed_at__isnull=True)

        if incomplete_stops.exists():
            incomplete_count = incomplete_stops.distinct().count()
            return TransitionResult(
                success=False,
                error=(
                    f"Cannot complete ride: {incomplete_count} stop(s) have not been "
                    f"fully visited. All stops must have arrived_at and departed_at set."
                ),
            )

    # Perform the transition
    ride.status = new_status

    # Set completed_at timestamp when completing
    if new_status == "completed":
        ride.completed_at = timezone.now()

    ride.save()

    return TransitionResult(success=True, ride=ride)


def handle_request_timeout(ride) -> TransitionResult:
    """
    Handle a ride request that has timed out (30-second countdown expired).

    Marks the ride as expired by removing the driver assignment (if any)
    and resetting to 'requested' status for reassignment to another driver.
    If the ride is no longer in 'requested' status (already accepted/cancelled),
    this is a no-op.

    This function handles the state transition logic. The actual timer scheduling
    and WebSocket broadcasting is handled by `taxi.rides.timeout`.

    Args:
        ride: The Ride model instance.

    Returns:
        TransitionResult indicating what happened.
    """
    if ride.status != "requested":
        return TransitionResult(
            success=False,
            error=f"Ride is no longer in 'requested' status (current: '{ride.status}').",
        )

    # Remove driver assignment so the ride can be reassigned
    ride.driver = None
    ride.save(update_fields=["driver"])

    return TransitionResult(
        success=True,
        ride=ride,
    )
