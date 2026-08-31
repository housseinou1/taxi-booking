"""Tests for admin shell permissions API."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class AdminPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo_group, _ = Group.objects.get_or_create(name="CEO")
        self.support_group, _ = Group.objects.get_or_create(name="Support")
        self.ops_group, _ = Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="ceo@test.local",
            password="testpass123",
            is_staff=True,
        )
        self.ceo.groups.add(self.ceo_group)

        self.support = User.objects.create_user(
            email="support@test.local",
            password="testpass123",
            is_staff=True,
        )
        self.support.groups.add(self.support_group)

        self.rider = User.objects.create_user(
            email="rider@test.local",
            password="testpass123",
            is_staff=False,
        )

    def test_ceo_permissions(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.get("/operations/admin/me/permissions/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["role"], "ceo")
        self.assertEqual(data["home_route"], "/admin/home/ceo")
        self.assertIn("finance", data["modules"])
        self.assertTrue(data["actions"]["ceo.broadcast"])
        self.assertIn("profile", data)
        self.assertIn("permissions_version", data)
        self.assertIn("feature_flags", data)
        self.assertIn("approval_limits", data)
        self.assertEqual(response["ETag"], f'"{data["permissions_version"]}"')

    def test_support_permissions(self):
        self.client.force_authenticate(user=self.support)
        response = self.client.get("/operations/admin/me/permissions/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["role"], "support")
        self.assertEqual(data["home_route"], "/admin/home/support")
        self.assertNotIn("finance", data["modules"])
        self.assertFalse(data["actions"]["finance.approve_refund"])

    def test_non_staff_forbidden(self):
        self.client.force_authenticate(user=self.rider)
        response = self.client.get("/operations/admin/me/permissions/")
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_unauthorized(self):
        response = self.client.get("/operations/admin/me/permissions/")
        self.assertIn(response.status_code, (401, 403))
