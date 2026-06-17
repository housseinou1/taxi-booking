from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

@database_sync_to_async
def _user_from_access_token(token):
    try:
        from authapp.models import User

        user_id = AccessToken(token).get("user_id")
        return User.objects.get(id=user_id, is_active=True)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Authenticate WebSocket clients that pass a SimpleJWT access token."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        query = parse_qs(scope.get("query_string", b"").decode())
        token = query.get("token", [None])[0]

        if token:
            scope["user"] = await _user_from_access_token(token)

        return await self.inner(scope, receive, send)
