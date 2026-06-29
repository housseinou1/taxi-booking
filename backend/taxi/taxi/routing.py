from django.urls import re_path

from taxi.rides.consumers import RideConsumer

websocket_urlpatterns = [
    # Matches both ws/rides/ and ws/rides (with or without trailing slash)
    re_path(r"^ws/rides/?$", RideConsumer.as_asgi()),
    # Delivery WebSocket endpoint (uses same consumer for now)
    re_path(r"^ws/deliveries/?$", RideConsumer.as_asgi()),
]
