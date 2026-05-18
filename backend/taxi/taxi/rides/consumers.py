import json

from channels.generic.websocket import AsyncWebsocketConsumer


class RideConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_group_name = "rides"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        print("WebSocket connected")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        print("WebSocket disconnected")

    async def receive(self, text_data):
        data = json.loads(text_data)

        message_type = data.get("type")

        # DRIVER LIVE LOCATION
        if message_type == "driver_location":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "send_driver_location",
                    "lat": data.get("lat"),
                    "lng": data.get("lng"),
                }
            )

        # RIDE STATUS UPDATE
        elif message_type == "ride_status_update":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "send_ride_status",
                    "ride": data.get("ride"),
                }
            )

        # NEW RIDE REQUEST
        elif message_type == "new_ride_request":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "send_new_ride",
                    "ride": data.get("ride"),
                }
            )

    async def send_driver_location(self, event):
        await self.send(text_data=json.dumps({
            "type": "driver_location",
            "lat": event["lat"],
            "lng": event["lng"],
        }))

    async def send_ride_status(self, event):
        await self.send(text_data=json.dumps({
            "type": "ride_status_update",
            "ride": event["ride"],
        }))

    async def send_new_ride(self, event):
        await self.send(text_data=json.dumps({
            "type": "new_ride_request",
            "ride": event["ride"],
        }))