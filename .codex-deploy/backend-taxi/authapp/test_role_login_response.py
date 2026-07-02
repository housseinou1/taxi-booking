from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import User


class RoleLoginResponseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_admin_login_exposes_authoritative_admin_role(self):
        User.objects.create_superuser(
            email="admin@example.com",
            password="StrongPass123!",
            first_name="Admin",
            last_name="User",
        )

        response = self.client.post(
            "/auth/login/",
            {"email": "admin@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "admin")
        self.assertTrue(response.data["is_staff"])
        self.assertTrue(response.data["is_superuser"])
        self.assertFalse(response.data["is_driver"])
        self.assertFalse(response.data["is_rider"])
        self.assertIn("user_type", response.data)
        self.assertIn("permissions", response.data)

    def test_rider_login_exposes_rider_role(self):
        User.objects.create_user(
            email="rider@example.com",
            password="StrongPass123!",
            first_name="Rider",
            last_name="User",
            user_type="rider",
        )

        response = self.client.post(
            "/auth/login/",
            {"email": "rider@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "rider")
        self.assertFalse(response.data["is_staff"])
        self.assertFalse(response.data["is_superuser"])
