import json
import logging
import time

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

RIDES_GROUP = "rides"

# Maximum interval (in seconds) for broadcasting driver location to session groups
LOCATION_BROADCAST_INTERVAL_SECONDS = 5


class RideConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time ride updates.

    Supports four types of groups:
    - "rides" (shared): All connected clients join for admin monitoring (backward compatible)
    - "driver_{user_id}": Driver-specific group for targeted ride requests and notifications
    - "ride_{ride_id}": Ride-specific group for status updates between driver and rider
    - "session_{session_id}": Share ride session group for multi-passenger broadcasts

    Inbound message types (client → server):
        - location_update: Driver sends GPS coordinates
        - ride_accept: Driver accepts a ride request
        - chat_message: Driver/rider sends a chat message
        - join_ride: Join a ride-specific group
        - leave_ride: Leave a ride-specific group
        - join_session: Join a Share ride session group
        - leave_session: Leave a Share ride session group

    Outbound message types (server → client):
        - ride_request: New ride request for driver
        - ride_status_update: Ride status changed
        - chat_message: Chat message from other party
        - document_status: Document approval/rejection notification
        - achievement_unlocked: New achievement earned
        - level_change: Driver level changed
        - location_update: Driver location broadcast to rider
        - stop_arrived: Driver arrived at a multi-stop location
        - stop_departed: Driver departed from a multi-stop location
        - share_status_update: Share session status changed
        - share_matched: Passengers matched in a session
        - share_driver_assigned: Driver assigned to Share session
        - share_passenger_added: New passenger joined active session
        - share_passenger_removed: Passenger cancelled from session
        - share_session_completed: Share session completed
        - share_your_pickup: Specific passenger pickup notification
        - share_your_dropoff: Specific passenger dropoff notification
        - share_fare_updated: Fare recalculation for specific passenger
        - share_ride_request: New Share session request for driver
        - share_stops_updated: Stop sequence changed for driver
        - share_passenger_notification: Generic targeted passenger message
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.driver_group = None
        self.rider_group = None
        self.ride_groups = set()
        self.session_groups = set()
        # Timestamp of last location broadcast to session groups (throttle)
        self._last_session_location_broadcast = 0.0

    async def connect(self):
        self.user = self.scope.get("user")

        # Always join the shared rides group for backward compatibility
        await self.channel_layer.group_add(RIDES_GROUP, self.channel_name)

        # If authenticated, join user-specific groups
        if self.user and self.user.is_authenticated:
            self.driver_group = f"driver_{self.user.id}"
            await self.channel_layer.group_add(
                self.driver_group, self.channel_name
            )

            # Join rider-specific group for targeted passenger notifications
            self.rider_group = f"rider_{self.user.id}"
            await self.channel_layer.group_add(
                self.rider_group, self.channel_name
            )

            logger.debug(
                "WebSocket connected: %s (user=%s, driver_group=%s, rider_group=%s)",
                self.channel_name,
                self.user.id,
                self.driver_group,
                self.rider_group,
            )
        else:
            logger.debug(
                "WebSocket connected (anonymous): %s", self.channel_name
            )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave the shared rides group
        await self.channel_layer.group_discard(RIDES_GROUP, self.channel_name)

        # Leave driver-specific group
        if self.driver_group:
            await self.channel_layer.group_discard(
                self.driver_group, self.channel_name
            )

        # Leave rider-specific group
        if self.rider_group:
            await self.channel_layer.group_discard(
                self.rider_group, self.channel_name
            )

        # Leave all ride-specific groups
        for ride_group in list(self.ride_groups):
            await self.channel_layer.group_discard(
                ride_group, self.channel_name
            )

        # Leave all session-specific groups
        for session_group in list(self.session_groups):
            await self.channel_layer.group_discard(
                session_group, self.channel_name
            )

        self.ride_groups.clear()
        self.session_groups.clear()
        logger.debug(
            "WebSocket disconnected: %s (code=%s)", self.channel_name, close_code
        )

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON"}))
            return

        msg_type = data.get("type")

        if msg_type == "location_update":
            await self._handle_location_update(data)
        elif msg_type == "chat_message":
            await self._handle_chat_message(data)
        elif msg_type == "join_ride":
            await self._handle_join_ride(data)
        elif msg_type == "leave_ride":
            await self._handle_leave_ride(data)
        elif msg_type == "join_session":
            await self._handle_join_session(data)
        elif msg_type == "leave_session":
            await self._handle_leave_session(data)
        else:
            # Backward compatibility: broadcast to shared rides group
            await self.channel_layer.group_send(
                RIDES_GROUP,
                {
                    "type": "ride_update",
                    "message": data,
                },
            )

    # ─── Inbound message handlers ────────────────────────────────────────

    async def _handle_location_update(self, data):
        """Handle driver location update and broadcast to ride group and session groups.

        Location updates are always forwarded to ride-specific groups immediately.
        For Share session groups, broadcasts are throttled to at most once every
        LOCATION_BROADCAST_INTERVAL_SECONDS (5 seconds) to reduce network overhead
        when multiple passengers are tracking the same driver.
        """
        lat = data.get("lat")
        lng = data.get("lng")

        if lat is None or lng is None:
            await self.send(
                text_data=json.dumps(
                    {"error": "location_update requires 'lat' and 'lng'"}
                )
            )
            return

        # Update driver location in database
        if self.user and self.user.is_authenticated:
            try:
                lat, lng = await self._update_driver_location(lat, lng)
            except ValueError as exc:
                await self.send(text_data=json.dumps({"error": str(exc)}))
                return

        location_message = {
            "type": "location_update",
            "driver_id": self.user.id if self.user else None,
            "lat": lat,
            "lng": lng,
        }

        # Broadcast location to all ride groups this driver is in (no throttle)
        for ride_group in self.ride_groups:
            await self.channel_layer.group_send(
                ride_group,
                {
                    "type": "driver_location",
                    "message": location_message,
                },
            )

        # Broadcast location to Share session groups with 5-second throttle
        if self.session_groups:
            now = time.time()
            elapsed = now - self._last_session_location_broadcast
            if elapsed >= LOCATION_BROADCAST_INTERVAL_SECONDS:
                self._last_session_location_broadcast = now
                for session_group in self.session_groups:
                    await self.channel_layer.group_send(
                        session_group,
                        {
                            "type": "driver_location",
                            "message": location_message,
                        },
                    )

    async def _handle_chat_message(self, data):
        """Handle chat message and broadcast to ride group."""
        ride_id = data.get("ride_id")
        text = data.get("text", "")

        if not ride_id:
            await self.send(
                text_data=json.dumps(
                    {"error": "chat_message requires 'ride_id'"}
                )
            )
            return

        if not text or len(text) > 500:
            await self.send(
                text_data=json.dumps(
                    {"error": "chat_message 'text' must be 1-500 characters"}
                )
            )
            return

        ride_group = f"ride_{ride_id}"

        # Broadcast chat message to the ride group
        await self.channel_layer.group_send(
            ride_group,
            {
                "type": "chat_message_event",
                "message": {
                    "type": "chat_message",
                    "ride_id": ride_id,
                    "sender_id": self.user.id if self.user else None,
                    "sender_name": (
                        self.user.get_full_name()
                        if self.user and self.user.is_authenticated
                        else "Unknown"
                    ),
                    "text": text,
                },
            },
        )

    async def _handle_join_ride(self, data):
        """Join a ride-specific group for real-time updates."""
        ride_id = data.get("ride_id")
        if not ride_id:
            await self.send(
                text_data=json.dumps(
                    {"error": "join_ride requires 'ride_id'"}
                )
            )
            return

        ride_group = f"ride_{ride_id}"
        await self.channel_layer.group_add(ride_group, self.channel_name)
        self.ride_groups.add(ride_group)

        logger.debug(
            "User %s joined ride group: %s",
            self.user.id if self.user else "anonymous",
            ride_group,
        )

        await self.send(
            text_data=json.dumps(
                {"type": "joined_ride", "ride_id": ride_id}
            )
        )

    async def _handle_leave_ride(self, data):
        """Leave a ride-specific group."""
        ride_id = data.get("ride_id")
        if not ride_id:
            await self.send(
                text_data=json.dumps(
                    {"error": "leave_ride requires 'ride_id'"}
                )
            )
            return

        ride_group = f"ride_{ride_id}"
        await self.channel_layer.group_discard(ride_group, self.channel_name)
        self.ride_groups.discard(ride_group)

        logger.debug(
            "User %s left ride group: %s",
            self.user.id if self.user else "anonymous",
            ride_group,
        )

        await self.send(
            text_data=json.dumps(
                {"type": "left_ride", "ride_id": ride_id}
            )
        )

    async def _handle_join_session(self, data):
        """Join a Share ride session group for multi-passenger real-time updates."""
        session_id = data.get("session_id")
        if not session_id:
            await self.send(
                text_data=json.dumps(
                    {"error": "join_session requires 'session_id'"}
                )
            )
            return

        session_group = f"session_{session_id}"
        await self.channel_layer.group_add(session_group, self.channel_name)
        self.session_groups.add(session_group)

        logger.debug(
            "User %s joined session group: %s",
            self.user.id if self.user else "anonymous",
            session_group,
        )

        await self.send(
            text_data=json.dumps(
                {"type": "joined_session", "session_id": session_id}
            )
        )

    async def _handle_leave_session(self, data):
        """Leave a Share ride session group."""
        session_id = data.get("session_id")
        if not session_id:
            await self.send(
                text_data=json.dumps(
                    {"error": "leave_session requires 'session_id'"}
                )
            )
            return

        session_group = f"session_{session_id}"
        await self.channel_layer.group_discard(session_group, self.channel_name)
        self.session_groups.discard(session_group)

        logger.debug(
            "User %s left session group: %s",
            self.user.id if self.user else "anonymous",
            session_group,
        )

        await self.send(
            text_data=json.dumps(
                {"type": "left_session", "session_id": session_id}
            )
        )

    # ─── Outbound event handlers (channel layer → client) ────────────────

    async def ride_update(self, event):
        """
        Backward-compatible handler for the shared 'rides' group.
        Called when a message is sent to the rides group with type 'ride_update'.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (ride_update): %s", exc)

    async def ride_request(self, event):
        """
        Send a new ride request to the driver.
        Triggered when a ride is assigned to this driver.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (ride_request): %s", exc)

    async def ride_status_update(self, event):
        """
        Send a ride status update to driver/rider.
        Triggered when ride transitions between states.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (ride_status_update): %s", exc)

    async def chat_message_event(self, event):
        """
        Send a chat message to the ride participants.
        Triggered when a chat message is sent in a ride group.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (chat_message_event): %s", exc)

    async def document_status(self, event):
        """
        Send document status notification to the driver.
        Triggered when an admin approves/rejects a document.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (document_status): %s", exc)

    async def achievement_unlocked(self, event):
        """
        Send achievement notification to the driver.
        Triggered when a driver earns a new achievement.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (achievement_unlocked): %s", exc)

    async def level_change(self, event):
        """
        Send level change notification to the driver.
        Triggered when a driver's level changes (promotion or demotion).
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (level_change): %s", exc)

    async def driver_location(self, event):
        """
        Send driver location update to ride participants (rider).
        Triggered when a driver sends a location update.
        """
        try:
            # Don't echo location back to the driver who sent it
            message = event["message"]
            if (
                self.user
                and self.user.is_authenticated
                and message.get("driver_id") == self.user.id
            ):
                return
            await self.send(text_data=json.dumps(message))
        except Exception as exc:
            logger.error("WebSocket send error (driver_location): %s", exc)

    async def stop_arrived(self, event):
        """
        Send stop arrival notification to ride participants.
        Triggered when a driver arrives at a multi-stop location.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (stop_arrived): %s", exc)

    async def stop_departed(self, event):
        """
        Send stop departure notification to ride participants.
        Triggered when a driver departs from a multi-stop location.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (stop_departed): %s", exc)

    # ─── Share session outbound event handlers ────────────────────────────

    async def share_status_update(self, event):
        """
        Send Share session status update to all session participants.
        Triggered when the session transitions between states.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_status_update): %s", exc)

    async def share_matched(self, event):
        """
        Notify all session participants that passengers have been matched.
        Triggered when the MatchingService groups compatible rides.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_matched): %s", exc)

    async def share_driver_assigned(self, event):
        """
        Notify all passengers in a session that a driver has been assigned.
        Triggered when a driver accepts the Share session.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_driver_assigned): %s", exc)

    async def share_passenger_added(self, event):
        """
        Notify session participants that a new passenger has joined.
        Triggered when a new ride is added to an active session.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_passenger_added): %s", exc)

    async def share_passenger_removed(self, event):
        """
        Notify session participants that a passenger has cancelled.
        Triggered when a passenger cancels their ride in the session.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_passenger_removed): %s", exc)

    async def share_session_completed(self, event):
        """
        Notify all session participants that the session is completed.
        Triggered when all passengers have been dropped off.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_session_completed): %s", exc)

    # ─── Share passenger-specific outbound event handlers ─────────────────

    async def share_your_pickup(self, event):
        """
        Notify a specific passenger that their pickup is happening.
        Sent to the rider-specific group when the driver arrives at their stop.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_your_pickup): %s", exc)

    async def share_your_dropoff(self, event):
        """
        Notify a specific passenger that their dropoff is happening.
        Sent to the rider-specific group when the driver arrives at their destination.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_your_dropoff): %s", exc)

    async def share_fare_updated(self, event):
        """
        Notify a specific passenger of a fare recalculation.
        Sent to the rider-specific group after a cancellation triggers repricing.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_fare_updated): %s", exc)

    # ─── Share driver-specific outbound event handlers ────────────────────

    async def share_ride_request(self, event):
        """
        Send a new Share session request to the driver.
        Sent to the driver-specific group when a session needs a driver.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_ride_request): %s", exc)

    async def share_stops_updated(self, event):
        """
        Notify the driver that the stop sequence has changed.
        Sent to the driver-specific group when passengers are added/removed.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_stops_updated): %s", exc)

    # ─── Share generic passenger notification handler ─────────────────────

    async def share_passenger_notification(self, event):
        """
        Generic handler for targeted passenger messages.
        Sent to the rider-specific group for any Share-related notification.
        """
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error (share_passenger_notification): %s", exc)

    # ─── Database helpers ─────────────────────────────────────────────────

    @database_sync_to_async
    def _update_driver_location(self, lat, lng):
        """Update the driver's current location in the database."""
        from taxi.drivers.models import DriverProfile
        from taxi.security.abuse import validate_driver_location

        try:
            profile = DriverProfile.objects.get(user=self.user)
            profile.current_lat, profile.current_lng = validate_driver_location(
                profile, lat, lng
            )
            profile.driver_lat = profile.current_lat
            profile.driver_lng = profile.current_lng
            profile.save(update_fields=["current_lat", "current_lng", "driver_lat", "driver_lng"])
            return profile.current_lat, profile.current_lng
        except DriverProfile.DoesNotExist:
            logger.warning(
                "DriverProfile not found for user %s during location update",
                self.user.id,
            )
            raise ValueError("An approved driver profile is required.")


# ─── Utility functions for sending messages from backend services ─────────


async def send_ride_request_to_driver(channel_layer, driver_user_id, ride_data):
    """
    Send a ride request to a specific driver via their driver group.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the target driver.
        ride_data: Dict with ride_id, pickup, destination, fare, distance_km, countdown.
    """
    group_name = f"driver_{driver_user_id}"
    message = {
        "type": "ride_request",
        "message": {
            "type": "ride_request",
            **ride_data,
        },
    }
    await channel_layer.group_send(group_name, message)


async def send_ride_status_update(channel_layer, ride_id, status_data, driver_user_id=None):
    """
    Broadcast a ride status update to the ride group and optionally the driver group.

    Args:
        channel_layer: The Django Channels channel layer instance.
        ride_id: The ride ID.
        status_data: Dict with ride_id, status, and any additional fields.
        driver_user_id: Optional driver user ID for driver-specific notification.
    """
    message = {
        "type": "ride_status_update",
        "message": {
            "type": "ride_status_update",
            **status_data,
        },
    }

    # Send to ride-specific group
    ride_group = f"ride_{ride_id}"
    await channel_layer.group_send(ride_group, message)

    # Also send to driver-specific group if provided
    if driver_user_id:
        driver_group = f"driver_{driver_user_id}"
        await channel_layer.group_send(driver_group, message)

    # Broadcast to shared rides group for admin monitoring
    await channel_layer.group_send(
        RIDES_GROUP,
        {
            "type": "ride_update",
            "message": {
                "type": "ride_status_update",
                **status_data,
            },
        },
    )


async def send_chat_message(channel_layer, ride_id, sender_id, sender_name, text):
    """
    Send a chat message to the ride group.

    Args:
        channel_layer: The Django Channels channel layer instance.
        ride_id: The ride ID.
        sender_id: The user ID of the sender.
        sender_name: Display name of the sender.
        text: The message text (max 500 characters).
    """
    ride_group = f"ride_{ride_id}"
    await channel_layer.group_send(
        ride_group,
        {
            "type": "chat_message_event",
            "message": {
                "type": "chat_message",
                "ride_id": ride_id,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "text": text,
            },
        },
    )


async def send_document_status(channel_layer, driver_user_id, document_type, status, reason=None):
    """
    Send a document status notification to a specific driver.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the driver.
        document_type: The type of document (license, national_id, etc.).
        status: The new status (approved, rejected).
        reason: Optional rejection reason.
    """
    driver_group = f"driver_{driver_user_id}"
    message_data = {
        "type": "document_status",
        "document_type": document_type,
        "status": status,
    }
    if reason:
        message_data["reason"] = reason

    await channel_layer.group_send(
        driver_group,
        {
            "type": "document_status",
            "message": message_data,
        },
    )


async def send_achievement_unlocked(channel_layer, driver_user_id, achievement_id, name, icon):
    """
    Send an achievement notification to a specific driver.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the driver.
        achievement_id: The achievement ID.
        name: The achievement name.
        icon: The achievement icon identifier.
    """
    driver_group = f"driver_{driver_user_id}"
    await channel_layer.group_send(
        driver_group,
        {
            "type": "achievement_unlocked",
            "message": {
                "type": "achievement_unlocked",
                "achievement_id": achievement_id,
                "name": name,
                "icon": icon,
            },
        },
    )


async def send_level_change(channel_layer, driver_user_id, new_level, previous_level):
    """
    Send a level change notification to a specific driver.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the driver.
        new_level: The new driver level.
        previous_level: The previous driver level.
    """
    driver_group = f"driver_{driver_user_id}"
    await channel_layer.group_send(
        driver_group,
        {
            "type": "level_change",
            "message": {
                "type": "level_change",
                "new_level": new_level,
                "previous_level": previous_level,
            },
        },
    )


async def send_stop_arrived(channel_layer, ride_id, stop_id, stop_order, location_name):
    """
    Broadcast stop arrival to the ride group (notifies rider).

    Args:
        channel_layer: The Django Channels channel layer instance.
        ride_id: The ride ID.
        stop_id: The stop ID.
        stop_order: The order of the stop.
        location_name: The name of the stop location.
    """
    ride_group = f"ride_{ride_id}"
    await channel_layer.group_send(
        ride_group,
        {
            "type": "stop_arrived",
            "message": {
                "type": "stop_arrived",
                "ride_id": ride_id,
                "stop_id": stop_id,
                "stop_order": stop_order,
                "location_name": location_name,
            },
        },
    )


async def send_stop_departed(channel_layer, ride_id, stop_id, stop_order, location_name):
    """
    Broadcast stop departure to the ride group (notifies rider).

    Args:
        channel_layer: The Django Channels channel layer instance.
        ride_id: The ride ID.
        stop_id: The stop ID.
        stop_order: The order of the stop.
        location_name: The name of the stop location.
    """
    ride_group = f"ride_{ride_id}"
    await channel_layer.group_send(
        ride_group,
        {
            "type": "stop_departed",
            "message": {
                "type": "stop_departed",
                "ride_id": ride_id,
                "stop_id": stop_id,
                "stop_order": stop_order,
                "location_name": location_name,
            },
        },
    )

# ─── Share ride utility functions for sending messages from backend services ──


async def send_share_session_update(channel_layer, session_id, event_type, message_data):
    """
    Broadcast a Share session event to all session participants.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        event_type: The event type string (e.g., 'share_status_update',
                    'share_matched', 'share_driver_assigned', etc.).
        message_data: Dict payload to send to all session members.
    """
    session_group = f"session_{session_id}"
    await channel_layer.group_send(
        session_group,
        {
            "type": event_type,
            "message": {
                "type": event_type,
                "session_id": session_id,
                **message_data,
            },
        },
    )


async def send_share_matched(channel_layer, session_id, passengers_count, other_passengers):
    """
    Notify all session participants that passengers have been matched.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        passengers_count: Total number of passengers in the session.
        other_passengers: List of other passenger first names.
    """
    await send_share_session_update(
        channel_layer,
        session_id,
        "share_matched",
        {
            "passengers_count": passengers_count,
            "other_passengers": other_passengers,
        },
    )


async def send_share_driver_assigned(channel_layer, session_id, driver_info):
    """
    Notify all passengers that a driver has been assigned to the session.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        driver_info: Dict with name, photo_url, vehicle, plate, rating, eta_minutes.
    """
    await send_share_session_update(
        channel_layer,
        session_id,
        "share_driver_assigned",
        {"driver": driver_info},
    )


async def send_share_passenger_added(channel_layer, session_id, passenger_name, new_stops, updated_etas):
    """
    Notify session participants that a new passenger has joined.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        passenger_name: First name of the new passenger.
        new_stops: Updated list of stops.
        updated_etas: Updated ETA information for all stops.
    """
    await send_share_session_update(
        channel_layer,
        session_id,
        "share_passenger_added",
        {
            "passenger_name": passenger_name,
            "new_stops": new_stops,
            "updated_etas": updated_etas,
        },
    )


async def send_share_passenger_removed(channel_layer, session_id, updated_stops, updated_fares):
    """
    Notify session participants that a passenger has cancelled.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        updated_stops: Updated list of stops after removal.
        updated_fares: Updated fare information for remaining passengers.
    """
    await send_share_session_update(
        channel_layer,
        session_id,
        "share_passenger_removed",
        {
            "updated_stops": updated_stops,
            "updated_fares": updated_fares,
        },
    )


async def send_share_session_completed(channel_layer, session_id, total_earnings, individual_fare, savings):
    """
    Notify all session participants that the session is completed.

    Args:
        channel_layer: The Django Channels channel layer instance.
        session_id: The ShareRideSession ID.
        total_earnings: Total driver earnings for the session.
        individual_fare: Per-passenger fare amount.
        savings: Amount saved compared to Economy.
    """
    await send_share_session_update(
        channel_layer,
        session_id,
        "share_session_completed",
        {
            "total_earnings": total_earnings,
            "individual_fare": individual_fare,
            "savings": savings,
        },
    )


async def send_share_passenger_pickup(channel_layer, rider_user_id, session_id, ride_id, message="Driver is here"):
    """
    Notify a specific passenger that their pickup is happening.

    Args:
        channel_layer: The Django Channels channel layer instance.
        rider_user_id: The user ID of the passenger.
        session_id: The ShareRideSession ID.
        ride_id: The specific ride ID.
        message: Pickup message text.
    """
    rider_group = f"rider_{rider_user_id}"
    await channel_layer.group_send(
        rider_group,
        {
            "type": "share_your_pickup",
            "message": {
                "type": "share_your_pickup",
                "session_id": session_id,
                "ride_id": ride_id,
                "message": message,
            },
        },
    )


async def send_share_passenger_dropoff(channel_layer, rider_user_id, session_id, ride_id, message="Arriving at your destination"):
    """
    Notify a specific passenger that their dropoff is happening.

    Args:
        channel_layer: The Django Channels channel layer instance.
        rider_user_id: The user ID of the passenger.
        session_id: The ShareRideSession ID.
        ride_id: The specific ride ID.
        message: Dropoff message text.
    """
    rider_group = f"rider_{rider_user_id}"
    await channel_layer.group_send(
        rider_group,
        {
            "type": "share_your_dropoff",
            "message": {
                "type": "share_your_dropoff",
                "session_id": session_id,
                "ride_id": ride_id,
                "message": message,
            },
        },
    )


async def send_share_fare_updated(channel_layer, rider_user_id, session_id, ride_id, new_fare, new_savings):
    """
    Notify a specific passenger of a fare recalculation.

    Args:
        channel_layer: The Django Channels channel layer instance.
        rider_user_id: The user ID of the passenger.
        session_id: The ShareRideSession ID.
        ride_id: The specific ride ID.
        new_fare: The recalculated fare amount.
        new_savings: The new savings amount.
    """
    rider_group = f"rider_{rider_user_id}"
    await channel_layer.group_send(
        rider_group,
        {
            "type": "share_fare_updated",
            "message": {
                "type": "share_fare_updated",
                "session_id": session_id,
                "ride_id": ride_id,
                "new_fare": new_fare,
                "new_savings": new_savings,
            },
        },
    )


async def send_share_ride_request_to_driver(channel_layer, driver_user_id, session_id, passengers_count, stops, total_earnings, countdown=30):
    """
    Send a new Share session request to a driver.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the target driver.
        session_id: The ShareRideSession ID.
        passengers_count: Number of passengers in the session.
        stops: List of stop dicts with type, location, lat, lng.
        total_earnings: Estimated total driver earnings.
        countdown: Seconds for driver to accept (default 30).
    """
    driver_group = f"driver_{driver_user_id}"
    await channel_layer.group_send(
        driver_group,
        {
            "type": "share_ride_request",
            "message": {
                "type": "share_ride_request",
                "session_id": session_id,
                "passengers_count": passengers_count,
                "stops": stops,
                "total_earnings": total_earnings,
                "countdown": countdown,
            },
        },
    )


async def send_share_stops_updated(channel_layer, driver_user_id, session_id, stops, passenger_count):
    """
    Notify the driver that the stop sequence has changed.

    Args:
        channel_layer: The Django Channels channel layer instance.
        driver_user_id: The user ID of the driver.
        session_id: The ShareRideSession ID.
        stops: Updated list of stop dicts.
        passenger_count: Current number of passengers.
    """
    driver_group = f"driver_{driver_user_id}"
    await channel_layer.group_send(
        driver_group,
        {
            "type": "share_stops_updated",
            "message": {
                "type": "share_stops_updated",
                "session_id": session_id,
                "stops": stops,
                "passenger_count": passenger_count,
            },
        },
    )
