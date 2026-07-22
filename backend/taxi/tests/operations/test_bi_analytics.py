"""Tests for Business Intelligence & Data Warehouse (Phase 37)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class BiAnalyticsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Analytics")
        Group.objects.get_or_create(name="Compliance")

        self.ceo = User.objects.create_user(
            email="bi-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.analyst = User.objects.create_user(
            email="bi-analyst@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.analyst.groups.add(Group.objects.get(name="Analytics"))

        self.compliance_officer = User.objects.create_user(
            email="bi-compliance@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.compliance_officer.groups.add(Group.objects.get(name="Compliance"))

    def tearDown(self):
        self.qr_patch.stop()

    def test_overview_requires_analytics_role(self):
        self.client.force_authenticate(self.compliance_officer)
        response = self.client.get("/operations/bi/")
        self.assertEqual(response.status_code, 403)

    def test_analyst_can_load_overview(self):
        self.client.force_authenticate(self.analyst)
        response = self.client.get("/operations/bi/?period=monthly")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "subject_areas",
            "executive_analytics",
            "geographic_intelligence",
            "predictive_analytics",
            "data_quality",
            "data_governance",
        ):
            self.assertIn(key, data)

    def test_executive_analytics_keys(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/bi/executive-analytics/?period=monthly")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "revenue_mru",
            "gmv_mru",
            "ride_growth_pct",
            "customer_retention_pct",
            "avg_wait_time_minutes",
        ):
            self.assertIn(key, data)

    def test_invalid_subject_area_returns_400(self):
        self.client.force_authenticate(self.analyst)
        response = self.client.get("/operations/bi/subject-areas/invalid-area/")
        self.assertEqual(response.status_code, 400)

    def test_subject_area_rides(self):
        self.client.force_authenticate(self.analyst)
        response = self.client.get("/operations/bi/subject-areas/rides/?period=weekly")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["subject"], "rides")

    def test_bi_report_export_csv(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get(
            "/operations/bi/reports/executive_analytics/export/?export_format=csv&period=monthly"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_bi_report_export_pdf(self):
        self.client.force_authenticate(self.analyst)
        response = self.client.get(
            "/operations/bi/reports/predictive/export/?export_format=pdf&period=quarterly"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            "pdf" in response["Content-Type"] or "text/plain" in response["Content-Type"],
        )

    def test_invalid_report_type_returns_400(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/bi/reports/not_a_report/export/?export_format=csv")
        self.assertEqual(response.status_code, 400)
