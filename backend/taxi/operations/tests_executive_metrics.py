"""Tests for operations.executive_metrics — canonical definitions + reporting periods.

Guards the two defects the Founder/CEO flagged: fleet figures that double-count drivers and
couriers, and wallet balances presented as revenue.
"""

from datetime import date, timedelta
from decimal import Decimal

from authapp.models import User
from django.test import TestCase
from django.utils import timezone

from deliveries.models import DriverDeliverySettings
from operations.executive_metrics import (
    EXECUTIVE_METRIC_DEFINITIONS,
    REPORTING_PERIODS,
    executive_metrics,
    resolve_period,
)
from payments.models import PaymentRecord, WalletAccount
from taxi.drivers.models import DriverProfile


class ReportingPeriodTests(TestCase):
    def test_the_five_required_periods_exist(self):
        self.assertEqual(
            set(REPORTING_PERIODS),
            {"today", "last_7_days", "last_30_days", "this_month", "custom"},
        )

    def test_today_is_a_single_day_window(self):
        start, end, label = resolve_period("today")
        self.assertEqual(label, "Today")
        self.assertEqual((end - start), timedelta(days=1))

    def test_last_7_and_30_days_span_the_expected_window(self):
        start, end, _ = resolve_period("last_7_days")
        self.assertEqual((end - start), timedelta(days=7))
        start, end, _ = resolve_period("last_30_days")
        self.assertEqual((end - start), timedelta(days=30))

    def test_this_month_starts_on_the_first(self):
        start, end, _ = resolve_period("this_month")
        self.assertEqual(start.day, 1)
        self.assertEqual((start.hour, start.minute), (0, 0))
        self.assertGreater(end, start)

    def test_custom_range_uses_the_supplied_dates(self):
        start, end, label = resolve_period(
            "custom", start=date(2026, 1, 1), end=date(2026, 1, 31)
        )
        self.assertEqual(label, "Custom Date Range")
        self.assertEqual(start.date(), date(2026, 1, 1))
        self.assertEqual(end.date(), date(2026, 1, 31))

    def test_custom_range_without_dates_is_rejected(self):
        with self.assertRaises(ValueError):
            resolve_period("custom")

    def test_unknown_period_is_rejected(self):
        with self.assertRaises(ValueError):
            resolve_period("last_90_days")

class ExecutiveMetricTests(TestCase):
    def setUp(self):
        self.driver = User.objects.create_user(
            email="metric-driver@test.local", password="Test1234!", user_type="driver"
        )
        DriverProfile.objects.create(
            user=self.driver, status="approved", is_available=True, plate_number="M-001"
        )
        self.courier = User.objects.create_user(
            email="metric-courier@test.local", password="Test1234!", user_type="driver"
        )
        DriverProfile.objects.create(
            user=self.courier, status="approved", is_available=True, plate_number="M-002"
        )
        DriverDeliverySettings.objects.create(driver=self.courier, delivery_mode_enabled=True)
        self.rider = User.objects.create_user(
            email="metric-rider@test.local", password="Test1234!", user_type="rider"
        )

    def test_drivers_and_couriers_are_never_double_counted(self):
        fleet = executive_metrics("today")["fleet"]
        # One ride driver and one courier: the courier must not also count as a driver.
        self.assertEqual(fleet["total_drivers"], 1)
        self.assertEqual(fleet["total_couriers"], 1)
        self.assertEqual(fleet["online_drivers"], 1)
        self.assertEqual(fleet["online_couriers"], 1)

    def test_wallet_balance_is_a_liability_and_never_revenue(self):
        WalletAccount.objects.create(
            owner=self.driver, balance=Decimal("5200.00"), pending_balance=Decimal("300.00")
        )
        data = executive_metrics("today")

        self.assertEqual(data["liabilities"]["wallet_liabilities"]["value"], Decimal("5200.00"))
        self.assertFalse(data["liabilities"]["wallet_liabilities"]["is_revenue"])
        self.assertEqual(
            data["liabilities"]["wallet_pending_balance"]["value"], Decimal("300.00")
        )
        # The wallet balance must never leak into revenue, and pending is never added in.
        self.assertEqual(data["money"]["platform_revenue"], Decimal("0.00"))
        self.assertEqual(data["money"]["gross_transaction_value"], Decimal("0.00"))

    def test_platform_revenue_is_the_settled_ledger_app_fee_only(self):
        PaymentRecord.objects.create(
            source="ride",
            amount=Decimal("1000.00"),
            app_fee=Decimal("150.00"),
            courier_earning=Decimal("0.00"),
            status="paid",
        )
        PaymentRecord.objects.create(
            source="delivery",
            amount=Decimal("500.00"),
            app_fee=Decimal("75.00"),
            courier_earning=Decimal("200.00"),
            status="paid",
        )
        # Unsettled money must not be reported as revenue.
        PaymentRecord.objects.create(
            source="ride", amount=Decimal("999.00"), app_fee=Decimal("999.00"), status="pending"
        )
        data = executive_metrics("today")

        self.assertEqual(data["money"]["platform_revenue"], Decimal("225.00"))
        self.assertEqual(data["money"]["gross_transaction_value"], Decimal("1500.00"))
        self.assertEqual(data["money"]["courier_earnings"], Decimal("200.00"))

    def test_ledger_records_outside_the_period_are_excluded(self):
        record = PaymentRecord.objects.create(
            source="ride", amount=Decimal("800.00"), app_fee=Decimal("120.00"), status="paid"
        )
        PaymentRecord.objects.filter(pk=record.pk).update(
            created_at=timezone.now() - timedelta(days=400)
        )
        self.assertEqual(executive_metrics("today")["money"]["platform_revenue"], Decimal("0.00"))
        self.assertEqual(
            executive_metrics("last_30_days")["money"]["platform_revenue"], Decimal("0.00")
        )

    def test_every_liability_is_flagged_as_not_revenue(self):
        data = executive_metrics("today")
        for key, payload in data["liabilities"].items():
            self.assertFalse(payload["is_revenue"], f"{key} must not be treated as revenue")

    def test_registered_riders_are_counted_once(self):
        self.assertEqual(executive_metrics("today")["riders"]["total"], 1)

    def test_payload_carries_the_metric_definitions(self):
        data = executive_metrics("last_7_days")
        for metric in (
            "total_riders",
            "total_drivers",
            "total_couriers",
            "online_drivers",
            "online_couriers",
            "completed_rides",
            "completed_deliveries",
            "cancellations",
            "platform_revenue",
            "gross_transaction_value",
            "driver_earnings",
            "courier_earnings",
            "merchant_payables",
            "wallet_liabilities",
        ):
            self.assertIn(metric, EXECUTIVE_METRIC_DEFINITIONS)
        self.assertEqual(data["definitions"], EXECUTIVE_METRIC_DEFINITIONS)
        self.assertEqual(data["period"]["label"], "Last 7 Days")
