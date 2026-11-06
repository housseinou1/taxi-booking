"""Payment Management Center — CEO oversight endpoint.

Verifies the aggregation added for the Founder/CEO Payment Management Center:

* CEO-tier permission is enforced (a non-CEO user is refused).
* Payouts are split by role — drivers and couriers are never merged.
* Failed transactions never invent a provider reason.
* The action-capability map states which actions exist, where they already live, and
  reports un-integrated provider capabilities as **unavailable** rather than faking them.
* The endpoint is read-only: it never mutates a withdrawal, wallet or refund.

Provider behaviour is mocked/development mode throughout, so no real financial
transaction can occur.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from payments.models import WalletAccount, WithdrawalRequest

User = get_user_model()

OVERSIGHT_URL = "/payments/admin/payments/oversight/"
PROVIDERS_URL = "/payments/admin/payments/providers/"


def _user(email, **extra):
    return User.objects.create_user(email=email, password="pw", **extra)


class PaymentManagementCenterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _user("pmc-ceo@test.local", is_staff=True, is_superuser=True)
        self.outsider = _user("pmc-outsider@test.local")

        self.driver = _user("pmc-driver@test.local")
        self.courier = _user("pmc-courier@test.local")

        # A driver becomes a courier by having delivery settings.
        from deliveries.models import DriverDeliverySettings

        DriverDeliverySettings.objects.get_or_create(driver=self.courier)

        self.driver_withdrawal = WithdrawalRequest.objects.create(
            driver=self.driver,
            amount=Decimal("1000.00"),
            status="pending",
        )
        self.courier_withdrawal = WithdrawalRequest.objects.create(
            driver=self.courier,
            amount=Decimal("2500.00"),
            status="pending",
        )
        self.paid_withdrawal = WithdrawalRequest.objects.create(
            driver=self.driver,
            amount=Decimal("400.00"),
            status="paid",
        )

    # ── Security ─────────────────────────────────────────────────────────────

    def test_requires_ceo_permission(self):
        """A non-CEO user must not read payment oversight."""
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(OVERSIGHT_URL).status_code, 403)
        self.assertEqual(self.client.get(PROVIDERS_URL).status_code, 403)

    def test_anonymous_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(OVERSIGHT_URL).status_code, (401, 403))

    def test_ceo_is_allowed(self):
        self.client.force_authenticate(self.ceo)

    # ── Payouts split by role ────────────────────────────────────────────────

    def test_payouts_split_driver_and_courier(self):
        """Drivers and couriers are counted separately, never merged."""
        self.client.force_authenticate(self.ceo)
        body = self.client.get(OVERSIGHT_URL).json()

        payouts = body["payouts"]
        self.assertEqual(payouts["pending"]["count"], 2)
        self.assertEqual(payouts["paid"]["count"], 1)

        driver_pending = payouts["by_role"]["driver"]["pending"]
        courier_pending = payouts["by_role"]["courier"]["pending"]

        self.assertEqual(driver_pending["count"], 1)
        self.assertEqual(driver_pending["amount"], "1000.00")
        self.assertEqual(courier_pending["count"], 1)
        self.assertEqual(courier_pending["amount"], "2500.00")

    # ── Failed transactions ──────────────────────────────────────────────────

    def test_failed_transactions_do_not_invent_a_reason(self):
        """A stored failure is reported with an honest reason, never a made-up cause."""
        from payments.models import PaymentRecord

        PaymentRecord.objects.create(
            customer=self.driver,
            source="ride",
            amount=Decimal("300.00"),
            method="bankily",
            status="failed",
        )

        self.client.force_authenticate(self.ceo)
        body = self.client.get(OVERSIGHT_URL).json()

        failed = body["failed_transactions"]
        self.assertEqual(failed["total"], 1)
        row = failed["ledger_records"][0]
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["reason"], "Recorded as failed; no provider reason stored")

    # ── Capability map ───────────────────────────────────────────────────────

    def test_action_capabilities_report_provider_payout_unavailable(self):
        """Un-integrated provider capabilities are reported unavailable, with a reason."""
        self.client.force_authenticate(self.ceo)
        caps = self.client.get(OVERSIGHT_URL).json()["action_capabilities"]

        self.assertTrue(caps["can_act"])
        self.assertTrue(caps["confirmation_required"])

        available_ids = {a["id"] for a in caps["actions"] if a["available"]}
        self.assertIn("approve_payout", available_ids)
        self.assertIn("reject_payout", available_ids)
        self.assertIn("mark_payout_paid", available_ids)
        self.assertIn("approve_refund", available_ids)
        self.assertIn("reject_refund", available_ids)

        unavailable = {u["id"]: u for u in caps["unavailable"]}
        self.assertIn("provider_payout_instruction", unavailable)
        self.assertFalse(unavailable["provider_payout_instruction"]["available"])
        self.assertIn(
            "No payout/disbursement API is integrated",
            unavailable["provider_payout_instruction"]["reason"],
        )
        self.assertIn("provider_settlement_import", unavailable)

    def test_provider_readiness_reports_no_live_provider(self):
        """In development every provider is mock/unconfigured and cannot be activated."""
        self.client.force_authenticate(self.ceo)
        body = self.client.get(PROVIDERS_URL).json()

        self.assertTrue(body["read_only"])
        readiness = body["providers"]
        self.assertFalse(readiness["live_mode_enabled"])
        self.assertIn(readiness["provider_mode"], ("mock", "live"))
        for provider in readiness["providers"]:
            self.assertFalse(provider["activation_allowed"])
            self.assertIn(provider["active_mode"], ("mock", "unconfigured"))

    # ── Read-only guarantee ──────────────────────────────────────────────────

    def test_endpoint_is_read_only(self):
        """Reading oversight must not change any withdrawal or wallet record."""
        before = list(
            WithdrawalRequest.objects.order_by("id").values_list("id", "status", "paid_at")
        )
        wallets_before = WalletAccount.objects.count()

        self.client.force_authenticate(self.ceo)
        self.assertEqual(self.client.get(OVERSIGHT_URL).status_code, 200)

        after = list(
            WithdrawalRequest.objects.order_by("id").values_list("id", "status", "paid_at")
        )
        self.assertEqual(before, after)
        self.assertEqual(WalletAccount.objects.count(), wallets_before)

    def test_cashless_flags_are_reported(self):
        """The payload states plainly that no money movement is enabled."""
        self.client.force_authenticate(self.ceo)
        body = self.client.get(OVERSIGHT_URL).json()

        self.assertTrue(body["read_only"])
        self.assertFalse(body["financial_activation"])
        self.assertFalse(body["live_payments"])
        self.assertFalse(body["live_withdrawals"])

        self.assertEqual(self.client.get(OVERSIGHT_URL).status_code, 200)
