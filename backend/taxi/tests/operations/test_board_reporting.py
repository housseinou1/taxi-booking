"""Tests for Board & Investor Reporting Suite (Phase 35)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class BoardReportingTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Board")
        Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="board-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.board_member = User.objects.create_user(
            email="board-member@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.board_member.groups.add(Group.objects.get(name="Board"))

        self.ops_manager = User.objects.create_user(
            email="board-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

    def tearDown(self):
        self.qr_patch.stop()

    def test_suite_requires_board_or_ceo_role(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/board-reports/")
        self.assertEqual(response.status_code, 403)

    def test_board_member_can_load_suite(self):
        self.client.force_authenticate(self.board_member)
        response = self.client.get("/operations/board-reports/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "executive_summary",
            "business_kpis",
            "financial_report",
            "operational_report",
            "growth_report",
            "risk_dashboard",
            "strategic_planning",
        ):
            self.assertIn(key, data)

    def test_ceo_can_load_business_kpis(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/board-reports/business-kpis/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "revenue_mru",
            "gmv_mru",
            "completed_rides",
            "active_riders",
            "revenue_growth_pct",
        ):
            self.assertIn(key, data)

    def test_financial_report_includes_partner_share(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/board-reports/financial/?period=monthly")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("partner_revenue_share_mru", data["income_summary"])
        self.assertIn("cash_flow_summary", data)

    def test_risk_dashboard_includes_mitigation(self):
        self.client.force_authenticate(self.board_member)
        response = self.client.get("/operations/board-reports/risk/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("mitigation_status", data)
        self.assertIn("categories", data)

    def test_board_report_export_csv(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/board-reports/executive/export/?export_format=csv&period=weekly")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_board_report_export_excel(self):
        self.client.force_authenticate(self.board_member)
        response = self.client.get("/operations/board-reports/full/export/?export_format=excel&period=monthly")
        self.assertEqual(response.status_code, 200)
        content_type = response["Content-Type"]
        self.assertTrue(
            "spreadsheetml" in content_type or "text/csv" in content_type,
            msg=f"Unexpected content type: {content_type}",
        )

    def test_board_report_export_pdf(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/board-reports/financial/export/?export_format=pdf&period=quarterly")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            "pdf" in response["Content-Type"] or "text/plain" in response["Content-Type"],
        )
