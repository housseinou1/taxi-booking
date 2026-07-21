"""Tests for executive operations dashboard."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from deliveries.models import Delivery
from payments.models import PaymentRecord, WalletAccount, WithdrawalRequest
from taxi.rides.models import Ride

User = get_user_model()


class ExecutiveDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="exec-admin@test.local",
            password="Pass123!",
        )
        self.driver = User.objects.create_user(
            email="exec-driver@test.local",
            password="Pass123!",
            user_type="driver",
        )
        self.rider = User.objects.create_user(
            email="exec-rider@test.local",
            password="Pass123!",
            user_type="rider",
        )
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("1000.00"),
            driver_earning=Decimal("800.00"),
            app_fee=Decimal("200.00"),
            status="completed",
            completed_at=timezone.now(),
        )
        PaymentRecord.objects.create(
            source="ride",
            customer=self.rider,
            courier=self.driver,
            amount=Decimal("1000.00"),
            app_fee=Decimal("200.00"),
            courier_earning=Decimal("800.00"),
            method="cash",
            status="paid",
        )
        WalletAccount.objects.create(owner=self.driver, balance=Decimal("500.00"))
        WithdrawalRequest.objects.create(
            driver=self.driver,
            amount=Decimal("500.00"),
            status="pending",
        )
        Delivery.objects.create(
            customer=self.rider,
            driver=self.driver,
            pickup="Shop",
            destination="Home",
            recipient_name="Test",
            recipient_phone="+22248000000",
            fare=Decimal("300.00"),
            status="requested",
        )

    def test_executive_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        response = self.client.get("/operations/executive/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_executive_dashboard_returns_live_and_finance(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/executive/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("live", response.data)
        self.assertIn("finance", response.data)
        self.assertIn("operations", response.data)
        self.assertIn("security", response.data)
        self.assertIn("support", response.data)
        self.assertIn("qa", response.data)
        self.assertGreaterEqual(response.data["live"]["today"]["trips"], 1)

    def test_executive_export_csv(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/executive/reports/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.get("Content-Type", ""))
        self.assertIn(b"amount", response.content)

    def test_qa_reconciliation_endpoint(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/executive/qa/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("wallet_balance", response.data)
        self.assertIn("pending_withdrawals", response.data)

    def test_maintenance_mode_ceo_only_for_non_superuser(self):
        accountant = User.objects.create_user(
            email="accountant@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.client.force_authenticate(accountant)
        response = self.client.post(
            "/operations/executive/maintenance-mode/",
            {"enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
