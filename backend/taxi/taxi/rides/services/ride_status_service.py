"""
RideStatusService — Share ride state machine and real-time notifications.

Manages valid status transitions for ShareRideSession instances and
broadcasts updates to all session participants via Django Channels.
"""

import json
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


class RideStatusService:
    """Manages Share ride state transitions and broadcasts."""

    # All possible statuses for a Share ride session
    SHARE_RIDE_STATUSES = [
        "requested",
        "matching",
        "driver_assigned",
        "driver_arriving",
        "passenger_pickup",
        "additional_pickup",
        "in_progress",
        "drop_off_stop",
        "completed",
        "cancelled",
    ]

    # Valid state transitions: current_status → [allowed_next_statuses]
    VALID_TRANSITIONS = {
        "requested": ["matching", "cancelled"],
        "matching": ["driver_assigned", "cancelled"],
        "driver_assigned": ["driver_arriving", "cancelled"],
        "driver_arriving": ["passenger_pickup", "cancelled"],
        "passenger_pickup": ["additional_pickup", "in_progress"],
        "additional_pickup": ["in_progress", "passenger_pickup"],
        "in_progress": ["drop_off_stop", "completed"],
        "drop_off_stop": ["in_progress", "completed"],
        "completed": [],
        "cancelled": [],
    }

    def __init__(self):
        self._channel_layer = None

    @property
    def channel_layer(self):
        """Lazy-load the channel layer to avoid import-time side effects."""
        if self._channel_layer is None:
            self._channel_layer = get_channel_layer()
        return self._channel_layer

    def transition(self, session, new_status):
        """
        Validate and apply a status transition on a ShareRideSession.

        Checks that the transition from the session's current status to
        new_status is allowed by the state machine. If valid, updates the
        session status and persists the change.

        Args:
            session: A ShareRideSession instance.
            new_status: The target status string.

        Returns:
            bool: True if the transition was valid and applied, False otherwise.
        """
        current_status = session.status

        if current_status not in self.VALID_TRANSITIONS:
            logger.error(
                "Session #%d has unknown status '%s'.",
                session.id,
                current_status,
            )
            return False

        allowed = self.VALID_TRANSITIONS[current_status]

        if new_status not in allowed:
            logger.warning(
                "Invalid transition for session #%d: '%s' → '%s'. "
                "Allowed: %s",
                session.id,
                current_status,
                new_status,
                allowed,
            )
            return False

        # Apply the transition
        session.status = new_status
        update_fields = ["status"]

        # Set completed_at timestamp when session completes
        if new_status == "completed":
            from django.utils import timezone

            session.completed_at = timezone.now()
            update_fields.append("completed_at")

        session.save(update_fields=update_fields)

        logger.info(
            "Session #%d transitioned: '%s' → '%s'",
            session.id,
            current_status,
            new_status,
        )

        # Broadcast the status update to all participants
        self.broadcast_status_update(session)

        return True

    def broadcast_status_update(self, session):
        """
        Send a status update to all session participants via WebSocket.

        Broadcasts to the session group (session_{id}) so all connected
        passengers and the driver receive the update simultaneously.

        Args:
            session: A ShareRideSession instance.
        """
        group_name = f"session_{session.id}"

        message = {
            "type": "share_status_update",
            "message": {
                "type": "share_status_update",
                "session_id": session.id,
                "status": session.status,
                "passengers_count": session.passengers_count,
            },
        }

        try:
            async_to_sync(self.channel_layer.group_send)(group_name, message)
            logger.debug(
                "Broadcast status update to group '%s': status=%s",
                group_name,
                session.status,
            )
        except Exception as exc:
            logger.error(
                "Failed to broadcast status update for session #%d: %s",
                session.id,
                exc,
            )

        # Also notify the driver directly if assigned
        if session.driver_id:
            driver_group = f"driver_{session.driver_id}"
            driver_message = {
                "type": "share_status_update",
                "message": {
                    "type": "share_status_update",
                    "session_id": session.id,
                    "status": session.status,
                    "passengers_count": session.passengers_count,
                },
            }
            try:
                async_to_sync(self.channel_layer.group_send)(
                    driver_group, driver_message
                )
            except Exception as exc:
                logger.error(
                    "Failed to notify driver #%d for session #%d: %s",
                    session.driver_id,
                    session.id,
                    exc,
                )

    def notify_passenger(self, ride, message):
        """
        Send a targeted notification to a specific passenger via WebSocket.

        Uses the rider-specific group (rider_{user_id}) to deliver
        passenger-specific events like pickup/dropoff alerts or fare updates.

        Args:
            ride: A Ride instance (must have a rider FK).
            message: Dict payload to send to the passenger.
                     Should include a 'type' key for the event type.
        """
        if not ride.rider_id:
            logger.warning(
                "Cannot notify passenger for ride #%d — no rider assigned.",
                ride.id,
            )
            return

        # Use rider-specific group for targeted delivery
        rider_group = f"rider_{ride.rider_id}"

        event = {
            "type": "share_passenger_notification",
            "message": {
                "ride_id": ride.id,
                "session_id": ride.share_session_id,
                **message,
            },
        }

        try:
            async_to_sync(self.channel_layer.group_send)(rider_group, event)
            logger.debug(
                "Notified passenger (rider #%d) for ride #%d: type=%s",
                ride.rider_id,
                ride.id,
                message.get("type", "unknown"),
            )
        except Exception as exc:
            logger.error(
                "Failed to notify passenger (rider #%d) for ride #%d: %s",
                ride.rider_id,
                ride.id,
                exc,
            )

    def is_valid_transition(self, current_status, new_status):
        """
        Check if a transition is valid without applying it.

        Args:
            current_status: The current session status.
            new_status: The proposed new status.

        Returns:
            bool: True if the transition is allowed.
        """
        allowed = self.VALID_TRANSITIONS.get(current_status, [])
        return new_status in allowed

    def get_allowed_transitions(self, current_status):
        """
        Get the list of valid next statuses from the current status.

        Args:
            current_status: The current session status.

        Returns:
            list: Allowed next statuses, or empty list if status is terminal.
        """
        return self.VALID_TRANSITIONS.get(current_status, [])

    def is_terminal_status(self, status):
        """
        Check if a status is terminal (no further transitions possible).

        Args:
            status: The status to check.

        Returns:
            bool: True if the status is 'completed' or 'cancelled'.
        """
        return status in ("completed", "cancelled", "rider_no_show")
