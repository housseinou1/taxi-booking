"""Tests for Launch Operations Command Center (Phase 25)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class LaunchCommandTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="Operations Manager")

        self.ops_manager = User.objects.create_user(
            email="command-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

        self.regular = User.objects.create_user(
            email="command-regular@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_ops_role(self):
        self.client.force_authenticate(self.regular)
        response = self.client.get("/operations/command/")
        self.assertEqual(response.status_code, 403)

    def test_ops_manager_can_load_dashboard(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/command/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("live_operations", "heat_map", "alerts", "ceo_summary", "incidents", "audit"):
            self.assertIn(key, data)
        self.assertIn("permissions", data)

    def test_ceo_summary_export_csv(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/command/ceo/export/?export_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_create_ops_incident(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.post(
            "/operations/command/incidents/",
            {"title": "Test command incident", "severity": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("reference", response.json())

    def test_onboarding_pause_toggle(self):
        self.client.force_authenticate(self.ops_manager)
        pause = self.client.post(
            "/operations/command/onboarding/pause/",
            {"enabled": True, "reason": "Beta cap"},
            format="json",
        )
        self.assertEqual(pause.status_code, 200)
        self.assertTrue(pause.json().get("enabled"))

        resume = self.client.post(
            "/operations/command/onboarding/pause/",
            {"enabled": False, "reason": "Resume"},
            format="json",
        )
        self.assertEqual(resume.status_code, 200)
        self.assertFalse(resume.json().get("enabled"))
