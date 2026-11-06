"""Refund transaction safety.

Refund approval MOVES MONEY (`approve_refund` credits the customer wallet), so
these tests pin the safety properties:

  * the wallet is credited exactly once per refund
  * a second approval is refused, not silently re-credited
  * the ledger carries exactly one `refund:<id>` transaction
  * anonymous / non-staff callers cannot approve or reject

Concurrency note: a genuine row-level race cannot be reproduced on SQLite —
concurrent writers hit `database table is locked` instead of interleaving, so
`test_concurrent_approvals_credit_once` is gated to Postgres. The
sequential-duplicate, ledger-integrity and authorization properties ARE fully
exercised on every backend, and those are what actually pin the invariant.
"""

import threading
from decimal import Decimal
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from payments.models import PaymentRecord, RefundRequest, WalletAccount, WalletTransaction

User = get_user_model()

AMOUNT = Decimal("50.00")


class RefundSafetyMixin:
    def _make_refund(self, status="requested"):
        payment = PaymentRecord.objects.create(
            source="delivery",
            method="cash",
            status="paid",
            amount=Decimal("200.00"),
            currency="MRU",
            customer=self.customer,
        )
        return RefundRequest.objects.create(
            payment_record=payment,
            customer=self.customer,
            amount=AMOUNT,
            reason="cancelled_order",
            status=status,
        )

    def _wallet_balance(self):
        # WalletAccount's owner FK is named `owner`, not `user`.
        wallet = WalletAccount.objects.filter(owner=self.customer).first()
        return wallet.balance if wallet else Decimal("0")

    def _refund_tx_count(self, refund_id):
        return WalletTransaction.objects.filter(reference=f"refund:{refund_id}").count()


class RefundIdempotencyTests(RefundSafetyMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="fin.admin@yala.test", password="x", user_type="admin", is_staff=True
        )
        # module-gated admin endpoint: the acting admin needs an explicit role
        self.admin.groups.add(Group.objects.get_or_create(name="CEO")[0])
        self.customer = User.objects.create_user(
            email="fin.customer@yala.test", password="x", user_type="rider"
        )
        self.client.force_authenticate(user=self.admin)

    def test_approval_credits_wallet_exactly_once(self):
        refund = self._make_refund()

        response = self.client.post(
            f"/payments/admin/refunds/{refund.id}/approve/", {"admin_note": "ok"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._wallet_balance(), AMOUNT)
        self.assertEqual(self._refund_tx_count(refund.id), 1)

    def test_duplicate_approval_is_refused_and_does_not_double_credit(self):
        refund = self._make_refund()

        first = self.client.post(
            f"/payments/admin/refunds/{refund.id}/approve/", {"admin_note": "first"}, format="json"
        )
        second = self.client.post(
            f"/payments/admin/refunds/{refund.id}/approve/", {"admin_note": "second"}, format="json"
        )

        self.assertEqual(first.status_code, 200)
        # The refund is already settled, so the second call must be refused.
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data.get("code"), "invalid_status")

        # THE critical assertion: the customer was credited once, not twice.
        self.assertEqual(self._wallet_balance(), AMOUNT)
        self.assertEqual(self._refund_tx_count(refund.id), 1)

    def test_repeated_clicks_credit_only_once(self):
        """Five rapid sequential approvals (a double-clicking admin) => one credit."""
        refund = self._make_refund()
        codes = []
        for i in range(5):
            r = self.client.post(
                f"/payments/admin/refunds/{refund.id}/approve/",
                {"admin_note": f"click {i}"},
                format="json",
            )
            codes.append(r.status_code)

        self.assertEqual(codes[0], 200)
        self.assertTrue(all(c == 400 for c in codes[1:]), codes)
        self.assertEqual(self._wallet_balance(), AMOUNT)
        self.assertEqual(self._refund_tx_count(refund.id), 1)

    def test_approve_then_reject_does_not_credit_twice_or_flip(self):
        refund = self._make_refund()
        self.client.post(f"/payments/admin/refunds/{refund.id}/approve/", {}, format="json")
        self.client.post(f"/payments/admin/refunds/{refund.id}/reject/", {}, format="json")

        refund.refresh_from_db()
        # Already settled; the reject must not undo or re-apply the credit.
        self.assertNotEqual(refund.status, "rejected")
        self.assertEqual(self._wallet_balance(), AMOUNT)
        self.assertEqual(self._refund_tx_count(refund.id), 1)

    def test_separate_refunds_each_credit_once(self):
        """Two distinct refunds are independent: two credits, no interference."""
        a = self._make_refund()
        b = self._make_refund()

        self.client.post(f"/payments/admin/refunds/{a.id}/approve/", {}, format="json")
        self.client.post(f"/payments/admin/refunds/{b.id}/approve/", {}, format="json")

        self.assertEqual(self._wallet_balance(), AMOUNT * 2)
        self.assertEqual(self._refund_tx_count(a.id), 1)
        self.assertEqual(self._refund_tx_count(b.id), 1)


class RefundAuthorizationTests(RefundSafetyMixin, TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="auth.customer@yala.test", password="x", user_type="rider"
        )
        self.admin = User.objects.create_user(
            email="auth.admin@yala.test", password="x", user_type="admin", is_staff=True
        )
        # module-gated admin endpoint: the acting admin needs an explicit role
        self.admin.groups.add(Group.objects.get_or_create(name="CEO")[0])

    def test_anonymous_cannot_approve(self):
        refund = self._make_refund()
        anonymous = APIClient()
        response = anonymous.post(f"/payments/admin/refunds/{refund.id}/approve/", {}, format="json")

        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self._wallet_balance(), Decimal("0"))
        self.assertEqual(self._refund_tx_count(refund.id), 0)

    def test_authenticated_non_staff_cannot_approve(self):
        refund = self._make_refund()
        client = APIClient()
        client.force_authenticate(user=self.customer)
        response = client.post(f"/payments/admin/refunds/{refund.id}/approve/", {}, format="json")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self._wallet_balance(), Decimal("0"))
        self.assertEqual(self._refund_tx_count(refund.id), 0)

    def test_anonymous_cannot_reject(self):
        refund = self._make_refund()
        anonymous = APIClient()
        response = anonymous.post(f"/payments/admin/refunds/{refund.id}/reject/", {}, format="json")

        self.assertIn(response.status_code, (401, 403))
        refund.refresh_from_db()
        self.assertEqual(refund.status, "requested")


class RefundConcurrencyTests(RefundSafetyMixin, TransactionTestCase):
    """Four approvals racing for the same refund.

    SQLite serialises writes, so this asserts the OUTCOME (exactly one credit)
    rather than proving a Postgres row-level race is impossible.
    """

    def setUp(self):
        self.customer = User.objects.create_user(
            email="race.customer@yala.test", password="x", user_type="rider"
        )
        self.admin = User.objects.create_user(
            email="race.admin@yala.test", password="x", user_type="admin", is_staff=True
        )
        # module-gated admin endpoint: the acting admin needs an explicit role
        self.admin.groups.add(Group.objects.get_or_create(name="CEO")[0])

    @skipUnless(
        connection.vendor == "postgresql",
        "Row-level race test: SQLite serialises writes and raises "
        "'database table is locked' instead of interleaving the four approvals.",
    )
    def test_concurrent_approvals_credit_once(self):
        refund = self._make_refund()
        results = []

        def approve():
            try:
                c = APIClient()
                c.force_authenticate(user=self.admin)
                r = c.post(f"/payments/admin/refunds/{refund.id}/approve/", {}, format="json")
                results.append(r.status_code)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=approve) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), 4)
        self.assertEqual(self._wallet_balance(), AMOUNT, f"statuses={results}")
        self.assertEqual(self._refund_tx_count(refund.id), 1, f"statuses={results}")
