"""Tests for CEO Master Command Center (Phase 34)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class CeoMasterCommandTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="ceo-master@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.ops_manager = User.objects.create_user(
            email="ceo-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

        self.regular = User.objects.create_user(
            email="ceo-regular@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_ceo_role(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/ceo-master/")
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(self.regular)
        response = self.client.get("/operations/ceo-master/")
        self.assertEqual(response.status_code, 403)

    def test_ceo_can_load_master_dashboard(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/ceo-master/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "executive_overview",
            "financial_overview",
            "operations",
            "growth",
            "fleet",
            "ai_insights",
            "readiness",
        ):
            self.assertIn(key, data)

    def test_executive_overview_keys(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/ceo-master/overview/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "total_revenue_today",
            "total_revenue_week",
            "total_revenue_month",
            "active_riders",
            "active_drivers",
            "platform_health_score",
        ):
            self.assertIn(key, data)

    def test_financial_overview_keys(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/ceo-master/finance/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "wallet_balance",
            "pending_withdrawals",
            "merchant_settlements_pending",
            "partner_settlements_pending",
            "cash_flow",
        ):
            self.assertIn(key, data)

    def test_readiness_includes_launch_score(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/ceo-master/readiness/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("overall_launch_score", data)
        self.assertIn("statuses", data)

    def test_ceo_report_export_csv(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/ceo-master/reports/daily/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_freeze_platform_audited(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.post(
            "/operations/ceo-master/actions/freeze/",
            {"enabled": True, "reason": "Test freeze"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["maintenance_mode"])
