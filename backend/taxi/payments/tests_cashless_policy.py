"""Phase 11 — strict cashless policy tests.

Verifies the policy vocabulary, the server-side enforcement at every payment entry
point (no cash method can start or confirm a payment), the manual-confirmation ban,
the legacy cash-settlement reminder becoming a no-op, and that historical cash rows
are never modified.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from payments.cashless import (
    CASH_METHODS,
    DIGITAL_METHODS,
    CashlessPolicyViolation,
    assert_cashless,
    is_allowed_method,
    is_cash_method,
    is_enforced,
    policy_payload,
    violation_reason,
)
from payments.models import Payment, PaymentRecord
from taxi.rides.models import Ride

User = get_user_model()


@override_settings(CASHLESS_POLICY_ENFORCED=True)
class CashlessPolicyUnitTests(TestCase):
    def test_cash_methods_are_recognised_and_refused(self):
        for method in ("cash", "CASH", " cod ", "cash_on_delivery"):
            self.assertTrue(is_cash_method(method), method)
            self.assertIsNotNone(violation_reason(method=method))

    def test_digital_methods_are_allowed(self):
        for method in ("card", "wallet", "bankily", "masrvi", "seddad", "bank_account"):
            self.assertIn(method, DIGITAL_METHODS)
            self.assertTrue(is_allowed_method(method))
            self.assertIsNone(violation_reason(method=method))

    def test_cash_on_delivery_timing_is_refused(self):
        self.assertIsNotNone(violation_reason(timing="cash_on_delivery"))
        self.assertIsNone(violation_reason(timing="before_delivery"))

    def test_assert_cashless_raises(self):
        with self.assertRaises(CashlessPolicyViolation):
            assert_cashless(method="cash")
        assert_cashless(method="bankily")  # must not raise

    @override_settings(CASHLESS_POLICY_ENFORCED=True)
    def test_policy_is_enforced_by_default(self):
        self.assertTrue(is_enforced())

    @override_settings(CASHLESS_POLICY_ENFORCED=False)
    def test_policy_can_only_be_relaxed_by_configuration(self):
        self.assertFalse(is_enforced())
        self.assertIsNone(violation_reason(method="cash"))

    def test_payload_reports_touchpoints_and_history_policy(self):
        payload = policy_payload()
        self.assertTrue(payload["enforced"])
        self.assertEqual(payload["historical_records"]["policy"], "preserved_read_only")
        statuses = {row["id"]: row["status"] for row in payload["touchpoints"]}
        self.assertEqual(statuses["payment_method_selection"], "blocked")
        self.assertEqual(statuses["manual_payment_confirmation"], "blocked")
        self.assertEqual(statuses["cash_settlement_reminder"], "skipped")
        self.assertEqual(statuses["rider_checkout_cash_option"], "removed")
        self.assertTrue(payload["read_only"])


@override_settings(CASHLESS_POLICY_ENFORCED=True)
class CashlessEnforcementTests(TestCase):
    """The policy is enforced server-side, not just declared."""

    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(email="rider-cashless@yala.test", password="pw")
        self.driver = User.objects.create_user(email="driver-cashless@yala.test", password="pw")
        self.client.force_authenticate(user=self.rider)
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            status="completed",
            fare=Decimal("1000.00"),
        )

    def test_create_payment_rejects_cash(self):
        res = self.client.post(
            "/payments/create/",
            {"ride_id": self.ride.id, "method": "cash"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "cashless_policy")
        self.assertFalse(Payment.objects.filter(ride_id=self.ride.id).exists())

    def test_driver_cannot_confirm_a_payment_manually(self):
        payment = Payment.objects.create(
            rider=self.rider,
            ride_id=self.ride.id,
            amount=Decimal("1000.00"),
            method="bankily",
            status="pending_verification",
        )
        self.client.force_authenticate(user=self.driver)
        res = self.client.post(f"/payments/confirm-payment/{self.ride.id}/", {}, format="json")

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "unverified_confirmation_blocked")
        payment.refresh_from_db()
        self.assertEqual(payment.status, "pending_verification")

    def test_rider_cannot_flag_a_cash_payment_for_verification(self):
        Payment.objects.create(
            rider=self.rider,
            ride_id=self.ride.id,
            amount=Decimal("1000.00"),
            method="cash",
            status="pending",
        )
        res = self.client.post(f"/payments/mark-paid/{self.ride.id}/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "cashless_policy")

    def test_historical_cash_records_are_preserved(self):
        """A legacy cash row stays readable and untouched (no deletion/rewrite)."""
        legacy = PaymentRecord.objects.create(
            source="delivery",
            customer=self.rider,
            amount=Decimal("250.00"),
            method="cash",
            status="paid",
            payment_timing="cash_on_delivery",
        )
        payload = policy_payload()
        legacy.refresh_from_db()
        self.assertEqual(legacy.method, "cash")
        self.assertEqual(legacy.status, "paid")
        self.assertEqual(
            payload["historical_records"]["legacy_cash_payment_records"].get("cash"), 1
        )

    def test_cash_settlement_reminder_is_a_no_op(self):
        from deliveries.tasks import remind_cash_settlement

        self.assertEqual(remind_cash_settlement(), {"skipped": "cashless_policy", "reminded": 0})
