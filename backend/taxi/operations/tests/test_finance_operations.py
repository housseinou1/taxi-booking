from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIRequestFactory, force_authenticate

from operations.finance_operations_views import (
    finance_accounting_report,
    finance_audit_trail,
    finance_operations_dashboard,
    finance_payment_providers,
    finance_reconciliation,
    finance_revenue_analytics,
    finance_withdrawals,
)

User = get_user_model()


class FinanceOperationsPermissionsTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.regular_user = User.objects.create_user(
            email="rider@test.local",
            password="pass",
            user_type="rider",
        )
        self.staff_user = User.objects.create_user(
            email="finance@test.local",
            password="pass",
            user_type="admin",
            is_staff=True,
        )

    def _get(self, view, params=None, user=None):
        request = self.factory.get(view.__name__, params or {})
        if user:
            force_authenticate(request, user=user)
        return view(request)

    def test_finance_endpoints_require_auth(self):
        for view in [
            finance_operations_dashboard,
            finance_reconciliation,
            finance_payment_providers,
            finance_withdrawals,
            finance_revenue_analytics,
            finance_accounting_report,
            finance_audit_trail,
        ]:
            response = self._get(view)
            self.assertIn(
                response.status_code,
                (401, 403),
                f"{view.__name__} should require authentication",
            )

    def test_regular_user_denied(self):
        for view in [
            finance_operations_dashboard,
            finance_reconciliation,
            finance_payment_providers,
            finance_withdrawals,
            finance_revenue_analytics,
            finance_accounting_report,
            finance_audit_trail,
        ]:
            response = self._get(view, user=self.regular_user)
            self.assertEqual(
                response.status_code,
                403,
                f"{view.__name__} should deny regular users",
            )

    def test_staff_user_allowed(self):
        for view in [
            finance_operations_dashboard,
            finance_reconciliation,
            finance_payment_providers,
            finance_withdrawals,
            finance_revenue_analytics,
            finance_accounting_report,
            finance_audit_trail,
        ]:
            response = self._get(view, user=self.staff_user)
            self.assertEqual(
                response.status_code,
                200,
                f"{view.__name__} should allow finance staff",
            )


class FinanceOperationsDashboardTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            email="finance@test.local",
            password="pass",
            user_type="admin",
            is_staff=True,
        )

    def test_dashboard_returns_expected_keys(self):
        request = self.factory.get("/operations/business/finance/operations/")
        force_authenticate(request, user=self.user)
        response = finance_operations_dashboard(request)
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIn("reconciliation", data)
        self.assertIn("payment_providers", data)
        self.assertIn("withdrawals", data)
        self.assertIn("revenue_analytics", data)
        self.assertIn("accounting", data)
        self.assertIn("audit", data)

    def test_reconciliation_status_values(self):
        request = self.factory.get("/operations/business/finance/operations/reconciliation/")
        force_authenticate(request, user=self.user)
        response = finance_reconciliation(request)
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIn("date", data)
        self.assertIn("totals", data)
        self.assertIn("reconciliation", data)
        self.assertIn(data["reconciliation"]["status"], ("balanced", "difference_detected"))

    def test_payment_providers_breakdown(self):
        request = self.factory.get("/operations/business/finance/operations/providers/")
        force_authenticate(request, user=self.user)
        response = finance_payment_providers(request)
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIn("providers", data)
        keys = {p["key"] for p in data["providers"]}
        self.assertIn("bankily", keys)
        self.assertIn("wallet", keys)

    def test_accounting_report_types(self):
        for report_type in ["daily", "weekly", "monthly", "cash_flow", "outstanding", "commission"]:
            request = self.factory.get(
                "/operations/business/finance/operations/accounting/",
                {"type": report_type},
            )
            force_authenticate(request, user=self.user)
            response = finance_accounting_report(request)
            self.assertEqual(response.status_code, 200, f"report type {report_type} failed")
            data = response.data
            self.assertEqual(data["report_type"], report_type)
            self.assertIn("metrics", data)

    def test_invalid_accounting_report_type(self):
        request = self.factory.get(
            "/operations/business/finance/operations/accounting/",
            {"type": "invalid"},
        )
        force_authenticate(request, user=self.user)
        response = finance_accounting_report(request)
        self.assertEqual(response.status_code, 400)
