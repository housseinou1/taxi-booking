import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

RIDES_GROUP = "rides"


class RideConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time ride updates.
    All connected clients join the shared 'rides' group and receive
    broadcast messages whenever a ride status changes.
    """

    async def connect(self):
        self.room_group_name = RIDES_GROUP
        try:
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name,
            )
            await self.accept()
            logger.debug("WebSocket connected: %s", self.channel_name)
        except Exception as exc:
            logger.error("WebSocket connect error: %s", exc)
            await self.close(code=1011)

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
            )
            logger.debug("WebSocket disconnected: %s (code=%s)", self.channel_name, close_code)
        except Exception as exc:
            logger.error("WebSocket disconnect error: %s", exc)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON"}))
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "ride_update",
                "message": data,
            },
        )

    async def ride_update(self, event):
        """Handler called when a message is sent to the rides group."""
        try:
            await self.send(text_data=json.dumps(event["message"]))
        except Exception as exc:
            logger.error("WebSocket send error: %s", exc)
