"""RBAC matrix tests for all admin roles."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()

ROLE_FIXTURES = [
    ("ceo@test.local", "CEO", "ceo", "/admin/home/ceo", "finance", True),
    ("ops@test.local", "Operations Manager", "ops", "/admin/home/ops", "ops", False),
    ("support@test.local", "Support", "support", "/admin/home/support", "support", False),
    ("finance@test.local", "Finance", "finance", "/admin/home/finance", "finance", True),
    ("marketing@test.local", "Marketing", "marketing", "/admin/home/marketing", "marketing", False),
    ("analytics@test.local", "Analytics", "analytics", "/admin/home/analytics", "analytics", False),
    ("drivers@test.local", "HR", "driver_ops", "/admin/home/drivers", "drivers", False),
    ("sysadmin@test.local", "Platform Admin", "system_admin", "/admin/home/system", "system", False),
]


class AdminRbacMatrixTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.users = {}
        for email, group_name, *_rest in ROLE_FIXTURES:
            group, _ = Group.objects.get_or_create(name=group_name)
            user = User.objects.create_user(
                email=email,
                password="testpass123",
                is_staff=True,
            )
            user.groups.add(group)
            self.users[group_name] = user

    def test_role_matrix_payload(self):
        for email, group_name, role, home_route, module, can_refund in ROLE_FIXTURES:
            with self.subTest(role=role):
                user = self.users[group_name]
                self.client.force_authenticate(user=user)
                response = self.client.get("/operations/admin/me/permissions/")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["role"], role)
                self.assertEqual(data["home_route"], home_route)
                self.assertIn(module, data["modules"])
                self.assertIn("profile", data)
                self.assertIn("permissions_version", data)
                self.assertIn("feature_flags", data)
                self.assertIn("approval_limits", data)
                self.assertEqual(
                    data["actions"]["finance.approve_refund"],
                    can_refund,
                )

    def test_support_cannot_access_finance_path(self):
        from operations.admin_permissions_service import can_access_admin_path

        user = self.users["Support"]
        self.assertFalse(can_access_admin_path(user, "/admin/finance-ops"))
        self.assertTrue(can_access_admin_path(user, "/admin/support"))

    def test_permissions_etag(self):
        user = self.users["CEO"]
        self.client.force_authenticate(user=user)
        first = self.client.get("/operations/admin/me/permissions/")
        etag = first["ETag"]
        second = self.client.get(
            "/operations/admin/me/permissions/",
            HTTP_IF_NONE_MATCH=etag,
        )
        self.assertEqual(second.status_code, 304)
