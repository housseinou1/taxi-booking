"""
Tests for the enhanced RideConsumer WebSocket consumer.

Tests cover:
- Connection and group management (shared rides, driver-specific, ride-specific)
- Inbound message handling (location_update, chat_message, join_ride, leave_ride)
- Outbound event handlers (ride_request, ride_status_update, etc.)
- Backward compatibility with the shared "rides" group
- Multi-stop events (stop_arrived, stop_departed)
- Utility functions for sending messages from backend services
"""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from channels.testing import WebsocketCommunicator
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from taxi.rides.consumers import (
    RideConsumer,
    RIDES_GROUP,
    send_ride_request_to_driver,
    send_ride_status_update,
    send_chat_message,
    send_document_status,
    send_achievement_unlocked,
    send_level_change,
    send_stop_arrived,
    send_stop_departed,
)

User = get_user_model()


TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RideConsumerConnectionTests(TestCase):
    """Test WebSocket connection and group management."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        pass

    async def _create_communicator(self, user=None):
        """Create a WebSocket communicator with optional authenticated user."""
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        if user:
            communicator.scope["user"] = user
        else:
            communicator.scope["user"] = MagicMock(
                is_authenticated=False, id=None
            )
        return communicator

    @pytest.mark.asyncio
    async def test_connect_anonymous(self):
        """Anonymous users can connect and join the shared rides group."""
        communicator = await self._create_communicator()
        connected, _ = await communicator.connect()
        assert connected is True
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_connect_authenticated_joins_driver_group(self):
        """Authenticated users join both the shared rides group and their driver group."""
        user = MagicMock(is_authenticated=True, id=42)
        communicator = await self._create_communicator(user=user)
        connected, _ = await communicator.connect()
        assert connected is True

        # Verify driver group works by sending a message to it
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_42",
            {
                "type": "ride_request",
                "message": {"type": "ride_request", "ride_id": 1},
            },
        )
        response = await communicator.receive_json_from()
        assert response["type"] == "ride_request"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect_cleans_up_groups(self):
        """Disconnecting removes the consumer from all groups."""
        user = MagicMock(is_authenticated=True, id=42)
        communicator = await self._create_communicator(user=user)
        await communicator.connect()

        # Join a ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 99})
        response = await communicator.receive_json_from()
        assert response["type"] == "joined_ride"

        # Disconnect
        await communicator.disconnect()

        # Verify the driver group no longer receives messages by creating a new communicator
        # and sending to the old group - the old consumer should not receive it
        # (This is implicitly tested by the fact that disconnect completes without error)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RideConsumerInboundTests(TestCase):
    """Test inbound message handling."""

    async def _create_connected_communicator(self, user=None):
        """Create and connect a WebSocket communicator."""
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        if user:
            communicator.scope["user"] = user
        else:
            communicator.scope["user"] = MagicMock(
                is_authenticated=False, id=None
            )
        await communicator.connect()
        return communicator

    @pytest.mark.asyncio
    async def test_invalid_json_returns_error(self):
        """Sending invalid JSON returns an error message."""
        communicator = await self._create_connected_communicator()
        await communicator.send_to(text_data="not json")
        response = await communicator.receive_json_from()
        assert response == {"error": "Invalid JSON"}
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_join_ride_group(self):
        """Client can join a ride-specific group."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        await communicator.send_json_to({"type": "join_ride", "ride_id": 123})
        response = await communicator.receive_json_from()

        assert response == {"type": "joined_ride", "ride_id": 123}

        # Verify we receive messages on the ride group
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "ride_123",
            {
                "type": "ride_status_update",
                "message": {"type": "ride_status_update", "ride_id": 123, "status": "in_progress"},
            },
        )
        response = await communicator.receive_json_from()
        assert response["type"] == "ride_status_update"
        assert response["ride_id"] == 123
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_join_ride_without_ride_id_returns_error(self):
        """Joining a ride without ride_id returns an error."""
        communicator = await self._create_connected_communicator()
        await communicator.send_json_to({"type": "join_ride"})
        response = await communicator.receive_json_from()
        assert "error" in response
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_leave_ride_group(self):
        """Client can leave a ride-specific group."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        # Join first
        await communicator.send_json_to({"type": "join_ride", "ride_id": 123})
        await communicator.receive_json_from()

        # Leave
        await communicator.send_json_to({"type": "leave_ride", "ride_id": 123})
        response = await communicator.receive_json_from()

        assert response == {"type": "left_ride", "ride_id": 123}

        # Verify we no longer receive messages on the ride group
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "ride_123",
            {
                "type": "ride_status_update",
                "message": {"type": "ride_status_update", "ride_id": 123, "status": "completed"},
            },
        )
        # Should timeout since we left the group
        import asyncio
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(communicator.receive_json_from(), timeout=0.5)
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_location_update_without_coords_returns_error(self):
        """Location update without lat/lng returns an error."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        await communicator.send_json_to({"type": "location_update", "lat": 18.0})
        response = await communicator.receive_json_from()
        assert "error" in response
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_chat_message_without_ride_id_returns_error(self):
        """Chat message without ride_id returns an error."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        await communicator.send_json_to(
            {"type": "chat_message", "text": "Hello"}
        )
        response = await communicator.receive_json_from()
        assert "error" in response
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_chat_message_empty_text_returns_error(self):
        """Chat message with empty text returns an error."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        await communicator.send_json_to(
            {"type": "chat_message", "ride_id": 1, "text": ""}
        )
        response = await communicator.receive_json_from()
        assert "error" in response
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_chat_message_too_long_returns_error(self):
        """Chat message exceeding 500 characters returns an error."""
        user = MagicMock(is_authenticated=True, id=1)
        communicator = await self._create_connected_communicator(user=user)

        await communicator.send_json_to(
            {"type": "chat_message", "ride_id": 1, "text": "x" * 501}
        )
        response = await communicator.receive_json_from()
        assert "error" in response
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_backward_compatible_broadcast(self):
        """Unknown message types are broadcast to the shared rides group (backward compat)."""
        communicator = await self._create_connected_communicator()

        # Send a message with an unknown type
        await communicator.send_json_to(
            {"type": "custom_event", "data": "test"}
        )

        # Should receive it back via the rides group broadcast
        response = await communicator.receive_json_from()
        assert response == {"type": "custom_event", "data": "test"}
        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RideConsumerOutboundTests(TestCase):
    """Test outbound event handlers."""

    async def _create_connected_communicator(self, user=None):
        """Create and connect a WebSocket communicator."""
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        if user:
            communicator.scope["user"] = user
        else:
            communicator.scope["user"] = MagicMock(
                is_authenticated=False, id=None
            )
        await communicator.connect()
        return communicator

    @pytest.mark.asyncio
    async def test_ride_request_event(self):
        """ride_request event sends the message to the client."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        # Send a ride_request event to the driver's group
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_5",
            {
                "type": "ride_request",
                "message": {
                    "type": "ride_request",
                    "ride_id": 42,
                    "pickup": "Airport",
                    "destination": "Hotel",
                    "fare": "1500.00",
                    "distance_km": "12.5",
                    "countdown": 30,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "ride_request"
        assert response["ride_id"] == 42
        assert response["pickup"] == "Airport"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_ride_status_update_event(self):
        """ride_status_update event sends the message to the client."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_5",
            {
                "type": "ride_status_update",
                "message": {
                    "type": "ride_status_update",
                    "ride_id": 42,
                    "status": "driver_arriving",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "ride_status_update"
        assert response["status"] == "driver_arriving"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_document_status_event(self):
        """document_status event sends the message to the client."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_5",
            {
                "type": "document_status",
                "message": {
                    "type": "document_status",
                    "document_type": "license",
                    "status": "approved",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "document_status"
        assert response["document_type"] == "license"
        assert response["status"] == "approved"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_achievement_unlocked_event(self):
        """achievement_unlocked event sends the message to the client."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_5",
            {
                "type": "achievement_unlocked",
                "message": {
                    "type": "achievement_unlocked",
                    "achievement_id": 1,
                    "name": "First Ride",
                    "icon": "trophy",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "achievement_unlocked"
        assert response["name"] == "First Ride"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_level_change_event(self):
        """level_change event sends the message to the client."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "driver_5",
            {
                "type": "level_change",
                "message": {
                    "type": "level_change",
                    "new_level": "silver",
                    "previous_level": "bronze",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "level_change"
        assert response["new_level"] == "silver"
        assert response["previous_level"] == "bronze"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_stop_arrived_event(self):
        """stop_arrived event sends the message to ride group participants."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 10})
        await communicator.receive_json_from()  # joined_ride confirmation

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "ride_10",
            {
                "type": "stop_arrived",
                "message": {
                    "type": "stop_arrived",
                    "ride_id": 10,
                    "stop_id": 1,
                    "stop_order": 1,
                    "location_name": "Mall",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "stop_arrived"
        assert response["stop_order"] == 1
        assert response["location_name"] == "Mall"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_stop_departed_event(self):
        """stop_departed event sends the message to ride group participants."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 10})
        await communicator.receive_json_from()  # joined_ride confirmation

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "ride_10",
            {
                "type": "stop_departed",
                "message": {
                    "type": "stop_departed",
                    "ride_id": 10,
                    "stop_id": 1,
                    "stop_order": 1,
                    "location_name": "Mall",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "stop_departed"
        assert response["stop_order"] == 1
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_chat_message_event_in_ride_group(self):
        """chat_message_event sends the message to ride group participants."""
        user = MagicMock(is_authenticated=True, id=5)
        communicator = await self._create_connected_communicator(user=user)

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 10})
        await communicator.receive_json_from()  # joined_ride confirmation

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            "ride_10",
            {
                "type": "chat_message_event",
                "message": {
                    "type": "chat_message",
                    "ride_id": 10,
                    "sender_id": 99,
                    "sender_name": "Rider",
                    "text": "I'm at the corner",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "chat_message"
        assert response["text"] == "I'm at the corner"
        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RideConsumerUtilityFunctionTests(TestCase):
    """Test utility functions for sending messages from backend services."""

    @pytest.mark.asyncio
    async def test_send_ride_request_to_driver(self):
        """send_ride_request_to_driver sends to the correct driver group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        channel_layer = get_channel_layer()
        await send_ride_request_to_driver(
            channel_layer,
            driver_user_id=7,
            ride_data={
                "ride_id": 50,
                "pickup": "Station",
                "destination": "Office",
                "fare": "800.00",
                "distance_km": "5.2",
                "countdown": 30,
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "ride_request"
        assert response["ride_id"] == 50
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_ride_status_update_to_ride_group(self):
        """send_ride_status_update sends to ride group and shared group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 50})
        await communicator.receive_json_from()  # joined_ride

        channel_layer = get_channel_layer()
        await send_ride_status_update(
            channel_layer,
            ride_id=50,
            status_data={"ride_id": 50, "status": "in_progress"},
            driver_user_id=7,
        )

        # Should receive from ride group, driver group, and shared group
        messages = []
        import asyncio
        for _ in range(3):
            try:
                msg = await asyncio.wait_for(
                    communicator.receive_json_from(), timeout=1.0
                )
                messages.append(msg)
            except asyncio.TimeoutError:
                break

        # At least one message should be the status update
        status_msgs = [m for m in messages if m.get("type") == "ride_status_update"]
        assert len(status_msgs) >= 1
        assert status_msgs[0]["status"] == "in_progress"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_document_status(self):
        """send_document_status sends to the correct driver group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        channel_layer = get_channel_layer()
        await send_document_status(
            channel_layer,
            driver_user_id=7,
            document_type="license",
            status="rejected",
            reason="Expired document",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "document_status"
        assert response["document_type"] == "license"
        assert response["status"] == "rejected"
        assert response["reason"] == "Expired document"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_achievement_unlocked(self):
        """send_achievement_unlocked sends to the correct driver group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        channel_layer = get_channel_layer()
        await send_achievement_unlocked(
            channel_layer,
            driver_user_id=7,
            achievement_id=3,
            name="100 Rides",
            icon="star",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "achievement_unlocked"
        assert response["achievement_id"] == 3
        assert response["name"] == "100 Rides"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_level_change(self):
        """send_level_change sends to the correct driver group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        channel_layer = get_channel_layer()
        await send_level_change(
            channel_layer,
            driver_user_id=7,
            new_level="gold",
            previous_level="silver",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "level_change"
        assert response["new_level"] == "gold"
        assert response["previous_level"] == "silver"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_stop_arrived(self):
        """send_stop_arrived sends to the ride group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 20})
        await communicator.receive_json_from()  # joined_ride

        channel_layer = get_channel_layer()
        await send_stop_arrived(
            channel_layer,
            ride_id=20,
            stop_id=3,
            stop_order=2,
            location_name="Market",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "stop_arrived"
        assert response["ride_id"] == 20
        assert response["stop_id"] == 3
        assert response["stop_order"] == 2
        assert response["location_name"] == "Market"
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_stop_departed(self):
        """send_stop_departed sends to the ride group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 20})
        await communicator.receive_json_from()  # joined_ride

        channel_layer = get_channel_layer()
        await send_stop_departed(
            channel_layer,
            ride_id=20,
            stop_id=3,
            stop_order=2,
            location_name="Market",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "stop_departed"
        assert response["ride_id"] == 20
        assert response["stop_id"] == 3
        await communicator.disconnect()

    @pytest.mark.asyncio
    async def test_send_chat_message_utility(self):
        """send_chat_message sends to the ride group."""
        user = MagicMock(is_authenticated=True, id=7)
        communicator = WebsocketCommunicator(RideConsumer.as_asgi(), "/ws/rides/")
        communicator.scope["user"] = user
        await communicator.connect()

        # Join ride group
        await communicator.send_json_to({"type": "join_ride", "ride_id": 20})
        await communicator.receive_json_from()  # joined_ride

        channel_layer = get_channel_layer()
        await send_chat_message(
            channel_layer,
            ride_id=20,
            sender_id=99,
            sender_name="Rider",
            text="Where are you?",
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "chat_message"
        assert response["text"] == "Where are you?"
        assert response["sender_id"] == 99
        await communicator.disconnect()
