import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()

from taxi.routing import websocket_urlpatterns
from taxi.websocket_auth import JWTAuthMiddleware


application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,

        "websocket": AuthMiddlewareStack(
            JWTAuthMiddleware(
                URLRouter(
                    websocket_urlpatterns
                )
            )
        ),
    }
)
