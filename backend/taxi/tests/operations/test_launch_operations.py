"""Tests for Phase 15 commercial launch preparation APIs."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from operations.models import OpsIncident

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class LaunchOperationsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            email="launch-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="CEO")
        self.staff.groups.add(Group.objects.get(name="CEO"))

        self.viewer = User.objects.create_user(
            email="launch-viewer@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_launch_hub_requires_executive_staff(self):
        response = self.client.get("/operations/launch/hub/")
        self.assertIn(response.status_code, (401, 403))

        self.client.force_authenticate(self.viewer)
        response = self.client.get("/operations/launch/hub/")
        self.assertEqual(response.status_code, 403)

    def test_launch_hub_returns_panels(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/launch/hub/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("control", "alerts", "incidents", "support", "onboarding", "finance", "kpis", "checklist"):
            self.assertIn(key, data)
        self.assertIn("platform_status", data["control"])
        self.assertIn("metrics", data["control"])

    def test_create_and_update_incident(self):
        self.client.force_authenticate(self.staff)
        create = self.client.post(
            "/operations/launch/incidents/",
            {"title": "Payment gateway slow", "severity": "high", "description": "Latency spike"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        incident_id = create.json()["id"]
        self.assertTrue(OpsIncident.objects.filter(id=incident_id).exists())

        detail = self.client.get(f"/operations/launch/incidents/{incident_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertGreaterEqual(len(detail.json()["timeline"]), 1)

        update = self.client.patch(
            f"/operations/launch/incidents/{incident_id}/",
            {"status": "investigating", "root_cause": "Redis latency"},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["status"], "investigating")

    def test_incident_export(self):
        self.client.force_authenticate(self.staff)
        incident = OpsIncident.objects.create(
            reference="INC-TEST-001",
            title="Test export",
            severity="low",
            created_by=self.staff,
        )
        response = self.client.get(f"/operations/launch/incidents/{incident.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_support_queue_and_checklist(self):
        self.client.force_authenticate(self.staff)
        support = self.client.get("/operations/launch/support/")
        self.assertEqual(support.status_code, 200)
        self.assertIn("queue", support.json())

        checklist = self.client.get("/operations/launch/checklist/")
        self.assertEqual(checklist.status_code, 200)
        self.assertIn("progress", checklist.json())

    def test_finance_reconciliation_export(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/launch/finance/export/?export_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
