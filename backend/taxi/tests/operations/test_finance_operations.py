"""Tests for Financial Operations & Reconciliation (Phase 24)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class FinanceOperationsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="Accountant")

        self.accountant = User.objects.create_user(
            email="finance-accountant@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.accountant.groups.add(Group.objects.get(name="Accountant"))

        self.regular = User.objects.create_user(
            email="finance-regular@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_finance_role(self):
        self.client.force_authenticate(self.regular)
        response = self.client.get("/operations/business/finance/operations/")
        self.assertEqual(response.status_code, 403)

    def test_accountant_can_load_dashboard(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get("/operations/business/finance/operations/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("reconciliation", "payment_providers", "withdrawals", "revenue_analytics", "accounting", "audit"):
            self.assertIn(key, data)
        self.assertIn("status", data["reconciliation"]["reconciliation"])

    def test_reconciliation_endpoint(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get("/operations/business/finance/operations/reconciliation/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("totals", data)
        self.assertIn("ride_revenue", data["totals"])

    def test_payment_providers_endpoint(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get("/operations/business/finance/operations/providers/")
        self.assertEqual(response.status_code, 200)
        providers = response.json()["providers"]
        self.assertEqual(len(providers), 5)
        self.assertEqual(providers[0]["key"], "bankily")

    def test_accounting_export_csv(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get(
            "/operations/business/finance/operations/export/?type=daily&export_format=csv"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_audit_trail_endpoint(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get("/operations/business/finance/operations/audit/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("entries", response.json())
