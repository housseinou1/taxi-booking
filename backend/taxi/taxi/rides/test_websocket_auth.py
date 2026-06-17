from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User
from taxi.rides.consumers import RideConsumer
from taxi.websocket_auth import JWTAuthMiddleware


TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class WebSocketJWTAuthTests(TransactionTestCase):
    def test_access_token_joins_driver_specific_group(self):
        driver = User.objects.create_user(
            email="socket-driver@example.com",
            password="StrongPass123",
            user_type="driver",
        )
        token = str(RefreshToken.for_user(driver).access_token)

        async def verify_delivery():
            communicator = WebsocketCommunicator(
                JWTAuthMiddleware(RideConsumer.as_asgi()),
                f"/ws/rides/?token={token}",
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await get_channel_layer().group_send(
                f"driver_{driver.id}",
                {
                    "type": "ride_request",
                    "message": {
                        "type": "ride_request",
                        "ride_id": 99,
                    },
                },
            )

            response = await communicator.receive_json_from()
            self.assertEqual(response["type"], "ride_request")
            self.assertEqual(response["ride_id"], 99)
            await communicator.disconnect()

        async_to_sync(verify_delivery)()
