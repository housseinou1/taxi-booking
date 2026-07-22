"""Tests for closed beta operations dashboard APIs."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class BetaDashboardTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            email="beta-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="CEO")
        self.staff.groups.add(Group.objects.get(name="CEO"))
        self.viewer = User.objects.create_user(
            email="beta-viewer@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_beta_dashboard_requires_executive_staff(self):
        response = self.client.get("/operations/beta/dashboard/")
        self.assertIn(response.status_code, (401, 403))

        self.client.force_authenticate(self.viewer)
        response = self.client.get("/operations/beta/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_beta_dashboard_returns_sections(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/beta/dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "overview",
            "live_kpis",
            "launch_blockers",
            "pilot_cohort",
            "ceo_summary",
            "infrastructure",
        ):
            self.assertIn(key, data)
        self.assertIn("active_riders_today", data["overview"])
        self.assertIn("seven_day", data["live_kpis"])
        self.assertIn("drivers", data["pilot_cohort"])

    def test_beta_ceo_report(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/beta/ceo-report/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("revenue", "trips", "deliveries", "fleet_health", "action_items"):
            self.assertIn(key, data)
        self.assertLessEqual(len(data["action_items"]), 5)
