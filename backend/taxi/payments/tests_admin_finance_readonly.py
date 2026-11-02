"""Phase 7 — read-only admin finance & withdrawal monitoring endpoints.

Verifies the monitoring list, review detail and overview KPIs are admin-only,
correctly filtered/paginated, that no state-changing affordance is advertised,
that responses never leak payout tokens/wallet ids/PANs, and — critically — that
calling these endpoints changes nothing (no wallet balance, no withdrawal status,
no paid_at/approved_at/admin_note).
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from payments.models import (
    DriverPayoutMethod,
    WalletAccount,
    WithdrawalRequest,
)

User = get_user_model()

LIST_URL = "/payments/admin/withdrawals/"
OVERVIEW_URL = "/payments/admin/finance/overview/"


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


class AdminFinanceReadOnlyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _user("finance-admin@test.local", is_staff=True)
        self.outsider = _user("finance-outsider@test.local")

        self.driver = _user("withdraw-driver@test.local")
        self.driver.first_name = "Moussa"
        self.driver.last_name = "Coura"
        self.driver.phone_number = "+22245000140"
        self.driver.save(update_fields=["first_name", "last_name", "phone_number"])

        self.method = DriverPayoutMethod.objects.create(
            driver=self.driver,
            payout_type="bankily",
            phone_number="+22245000141",
            wallet_id="WALLET-SECRET-XYZ",
        )
        self.wallet = WalletAccount.objects.create(
            owner=self.driver, balance=Decimal("5000.00")
        )

        self.pending = WithdrawalRequest.objects.create(
            driver=self.driver,
            payout_method=self.method,
            amount=Decimal("1500.00"),
            status="pending",
            note="First request",
            reference="WD-REF-1",
        )
        self.paid = WithdrawalRequest.objects.create(
            driver=self.driver,
            payout_method=self.method,
            amount=Decimal("700.00"),
            status="paid",
            paid_at=timezone.now(),
            payment_reference="PAY-REF-1",
        )
        self.rejected = WithdrawalRequest.objects.create(
            driver=self.driver,
            payout_method=self.method,
            amount=Decimal("300.00"),
            status="rejected",
            admin_note="Insufficient verification",
        )

    def _snapshot(self):
        """Every financial field these endpoints must never mutate."""
        return {
            "wallet_balance": WalletAccount.objects.get(pk=self.wallet.pk).balance,
            "wallet_pending": WalletAccount.objects.get(pk=self.wallet.pk).pending_balance,
            "rows": {
                row.id: (
                    row.status,
                    row.paid_at,
                    row.approved_at,
                    row.admin_note,
                    row.amount,
                )
                for row in WithdrawalRequest.objects.all()
            },
        }

    # ── access control ────────────────────────────────────────────────────
    def test_endpoints_require_admin(self):
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)
        self.assertEqual(self.client.get(OVERVIEW_URL).status_code, 403)
        self.assertEqual(self.client.get(f"{LIST_URL}{self.pending.id}/").status_code, 403)

    def test_anonymous_is_rejected(self):
        self.assertIn(self.client.get(LIST_URL).status_code, (401, 403))

    # ── monitoring list ───────────────────────────────────────────────────
    def test_list_returns_rows_and_queue_summary(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(LIST_URL)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 3)
        summary = res.data["summary"]
        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["pending"], 1)
        self.assertEqual(summary["paid"], 1)
        self.assertEqual(summary["rejected"], 1)
        self.assertEqual(Decimal(summary["pending_amount"]), Decimal("1500.00"))
        self.assertEqual(Decimal(summary["paid_amount"]), Decimal("700.00"))

    def test_list_rows_carry_requester_and_redacted_payout_label(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(LIST_URL)
        row = next(r for r in res.data["results"] if r["id"] == self.pending.id)

        self.assertEqual(row["requester"]["email"], "withdraw-driver@test.local")
        self.assertEqual(row["requester"]["is_courier"], False)
        self.assertEqual(row["payout_method_label"], "bankily +22245000141")

    def test_list_never_leaks_tokens_wallet_ids_or_pans(self):
        self.client.force_authenticate(self.admin)
        body = str(self.client.get(LIST_URL).data)
        for forbidden in (
            "WALLET-SECRET-XYZ",
            "provider_token",
            "account_reference",
            "idempotency_key",
        ):
            self.assertNotIn(forbidden, body)

    def test_status_and_payout_type_filters(self):
        self.client.force_authenticate(self.admin)

        pending_only = self.client.get(LIST_URL, {"status": "pending"})
        self.assertEqual(pending_only.data["count"], 1)
        # The summary always describes the whole queue, not the filtered page.
        self.assertEqual(pending_only.data["summary"]["total"], 3)

        self.assertEqual(self.client.get(LIST_URL, {"payout_type": "bankily"}).data["count"], 3)
        self.assertEqual(self.client.get(LIST_URL, {"payout_type": "card"}).data["count"], 0)

    def test_search_amount_and_date_filters(self):
        self.client.force_authenticate(self.admin)

        self.assertEqual(self.client.get(LIST_URL, {"search": "moussa"}).data["count"], 3)
        self.assertEqual(self.client.get(LIST_URL, {"search": "WD-REF-1"}).data["count"], 1)
        self.assertEqual(self.client.get(LIST_URL, {"min_amount": "1000"}).data["count"], 1)
        self.assertEqual(self.client.get(LIST_URL, {"max_amount": "500"}).data["count"], 1)

        today = timezone.localdate().isoformat()
        self.assertEqual(
            self.client.get(LIST_URL, {"date_from": today, "date_to": today}).data["count"], 3
        )

    def test_malformed_filters_return_400(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(LIST_URL, {"status": "nope"}).status_code, 400)
        self.assertEqual(self.client.get(LIST_URL, {"payout_type": "nope"}).status_code, 400)
        self.assertEqual(self.client.get(LIST_URL, {"date_from": "13/01/2026"}).status_code, 400)
        self.assertEqual(self.client.get(LIST_URL, {"min_amount": "abc"}).status_code, 400)
        self.assertEqual(self.client.get(LIST_URL, {"min_amount": "-5"}).status_code, 400)

    def test_pagination_and_ordering(self):
        self.client.force_authenticate(self.admin)

        page = self.client.get(LIST_URL, {"page_size": 2})
        self.assertEqual(len(page.data["results"]), 2)
        self.assertEqual(page.data["total_pages"], 2)

        asc = self.client.get(LIST_URL, {"ordering": "amount_asc"})
        amounts = [Decimal(row["amount"]) for row in asc.data["results"]]
        self.assertEqual(amounts, sorted(amounts))


    # ── review detail ─────────────────────────────────────────────────────
    def test_detail_returns_timeline_wallet_and_frozen_actions(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(f"{LIST_URL}{self.paid.id}/")

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["review_actions_frozen"])
        self.assertIn("frozen", res.data["review_actions_frozen_reason"].lower())
        self.assertEqual(res.data["requester"]["name"], "Moussa Coura")
        self.assertEqual(res.data["wallet"]["balance"], "5000.00")
        self.assertEqual(
            Decimal(res.data["wallet"]["open_withdrawal_amount"]), Decimal("1500.00")
        )

        labels = [entry["label"] for entry in res.data["timeline"]]
        self.assertEqual(labels[0], "Requested")
        self.assertIn("Marked paid", labels)

    def test_detail_wallet_snapshot_does_not_invent_an_available_balance(self):
        self.client.force_authenticate(self.admin)
        wallet = self.client.get(f"{LIST_URL}{self.pending.id}/").data["wallet"]
        # Stored values + a plain sum of the requester's own open requests only.
        self.assertEqual(
            sorted(wallet.keys()),
            sorted(
                [
                    "has_wallet",
                    "balance",
                    "pending_balance",
                    "currency",
                    "open_withdrawal_amount",
                ]
            ),
        )

    def test_detail_offers_no_action_affordance(self):
        """The payload must not advertise any state-changing affordance."""
        self.client.force_authenticate(self.admin)
        body = str(self.client.get(f"{LIST_URL}{self.pending.id}/").data).lower()
        for forbidden in ("approve_url", "reject_url", "mark_paid", "can_approve", "can_reject"):
            self.assertNotIn(forbidden, body)

    def test_detail_404_for_unknown_request(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f"{LIST_URL}999999/").status_code, 404)

    # ── overview ──────────────────────────────────────────────────────────
    def test_overview_reports_read_only_kpis(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(OVERVIEW_URL)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["withdrawals"]["total"], 3)
        self.assertEqual(res.data["withdrawals"]["pending"], 1)
        self.assertEqual(
            Decimal(res.data["withdrawals"]["open_amount"]), Decimal("1500.00")
        )
        self.assertEqual(res.data["wallets"]["wallets"], 1)
        self.assertEqual(
            Decimal(res.data["wallets"]["total_balance"]), Decimal("5000.00")
        )
        self.assertEqual(res.data["refunds"]["total"], 0)
        self.assertEqual(res.data["merchant_payouts"]["total"], 0)
        self.assertTrue(res.data["review_actions_frozen"])

    # ── the critical guarantee: reads mutate nothing ───────────────────────
    def test_reads_never_change_financial_state(self):
        self.client.force_authenticate(self.admin)
        before = self._snapshot()

        self.client.get(LIST_URL)
        self.client.get(OVERVIEW_URL)
        self.client.get(f"{LIST_URL}{self.pending.id}/")
        self.client.get(f"{LIST_URL}{self.paid.id}/")
        self.client.get(f"{LIST_URL}{self.rejected.id}/")
        # Filters and ordering must not mutate either.
        self.client.get(LIST_URL, {"status": "pending", "ordering": "amount_desc"})
        # And the frozen action endpoints are never reachable from this module.
        self.assertEqual(self.client.post(f"{LIST_URL}{self.pending.id}/").status_code, 405)

        self.assertEqual(self._snapshot(), before)

