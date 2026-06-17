from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User


class TokenRefreshEndpointTests(APITestCase):
    def test_refresh_token_returns_new_access_token(self):
        user = User.objects.create_user(
            email="refresh-rider@example.com",
            password="StrongPass123",
        )
        refresh = RefreshToken.for_user(user)

        response = self.client.post(
            "/auth/token/refresh/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
