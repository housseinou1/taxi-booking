"""Tests for admin client audit endpoint."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from security.models import AuditLog

User = get_user_model()


class AdminClientAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name="Support")
        self.staff = User.objects.create_user(
            email="support@test.local",
            password="testpass123",
            is_staff=True,
        )
        self.staff.groups.add(group)

    def test_log_permission_denied(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            "/operations/admin/audit/client-event/",
            {
                "event": "permission_denied",
                "details": {
                    "pathname": "/admin/finance-ops",
                    "required_module": "finance",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        log = AuditLog.objects.latest("created_at")
        self.assertEqual(log.action, "admin_action")
        self.assertEqual(log.details.get("event"), "permission_denied")
        self.assertEqual(log.details.get("pathname"), "/admin/finance-ops")

    def test_rejects_unknown_event(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            "/operations/admin/audit/client-event/",
            {"event": "not_allowed", "details": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
