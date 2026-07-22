"""Tests for Growth & Expansion Dashboard (Phase 26)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class GrowthExpansionTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="growth-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.ops_manager = User.objects.create_user(
            email="growth-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_ceo_role(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/growth/")
        self.assertEqual(response.status_code, 403)

    def test_ceo_can_load_dashboard(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/growth/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "growth_metrics",
            "revenue_growth",
            "marketing_performance",
            "geographic_expansion",
            "ceo_forecast",
        ):
            self.assertIn(key, data)
        self.assertIn("total_registered_riders", data["growth_metrics"])

    def test_growth_export_csv(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/growth/export/?export_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_growth_export_pdf(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/growth/export/?export_format=pdf")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
