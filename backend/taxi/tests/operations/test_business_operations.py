"""Tests for Phase 20 Business Operations Platform APIs."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class BusinessOperationsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            email="biz-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="CEO")
        self.staff.groups.add(Group.objects.get(name="CEO"))
        self.viewer = User.objects.create_user(
            email="biz-viewer@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_business_hub_requires_executive_staff(self):
        response = self.client.get("/operations/business/hub/")
        self.assertIn(response.status_code, (401, 403))

        self.client.force_authenticate(self.viewer)
        response = self.client.get("/operations/business/hub/")
        self.assertEqual(response.status_code, 403)

    def test_business_hub_returns_all_modules(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/operations/business/hub/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("finance", "crm", "marketing", "incentives", "partners", "corporate", "compliance", "bi"):
            self.assertIn(key, data)

    def test_finance_center_and_export(self):
        self.client.force_authenticate(self.staff)
        finance = self.client.get("/operations/business/finance/")
        self.assertEqual(finance.status_code, 200)
        self.assertIn("daily_revenue", finance.json())
        self.assertIn("monthly_profit_loss", finance.json())

        export_csv = self.client.get("/operations/business/finance/export/")
        self.assertEqual(export_csv.status_code, 200)
        self.assertIn("text/csv", export_csv["Content-Type"])

        export_xlsx = self.client.get("/operations/business/finance/export/?export_format=xlsx")
        self.assertEqual(export_xlsx.status_code, 200)

    def test_crm_dashboard_and_profile_update(self):
        self.client.force_authenticate(self.staff)
        rider = User.objects.create_user(
            email="crm-rider@test.local",
            password="Pass123!",
            user_type="rider",
        )
        crm = self.client.get("/operations/business/crm/")
        self.assertEqual(crm.status_code, 200)
        self.assertIn("profiles", crm.json())

        detail = self.client.get(f"/operations/business/crm/profiles/{rider.id}/")
        self.assertEqual(detail.status_code, 200)

        update = self.client.patch(
            f"/operations/business/crm/profiles/{rider.id}/",
            {"is_vip": True, "vip_tier": "gold"},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        self.assertTrue(update.json()["crm"]["is_vip"])

    def test_marketing_incentives_partners_corporate(self):
        self.client.force_authenticate(self.staff)
        for path in (
            "/operations/business/marketing/",
            "/operations/business/marketing/analytics/",
            "/operations/business/incentives/",
            "/operations/business/partners/",
            "/operations/business/corporate/",
        ):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, msg=path)

    def test_create_marketing_campaign(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/operations/business/marketing/campaigns/",
            {"name": "Nouakchott Launch Push", "channel": "push", "audience": "all_riders"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["name"], "Nouakchott Launch Push")

    def test_compliance_and_bi(self):
        self.client.force_authenticate(self.staff)
        compliance = self.client.get("/operations/business/compliance/")
        self.assertEqual(compliance.status_code, 200)
        self.assertIn("summary", compliance.json())

        export = self.client.get("/operations/business/compliance/export/")
        self.assertEqual(export.status_code, 200)

        bi = self.client.get("/operations/business/bi/")
        self.assertEqual(bi.status_code, 200)
        self.assertIn("ceo_report", bi.json())
        self.assertIn("growth_trends", bi.json())
