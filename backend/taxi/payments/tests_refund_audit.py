"""Refund approval / rejection auditing.

`approve_refund` and `reject_refund` persisted `admin_note` but wrote no audit
record, unlike withdrawals (`_log_withdrawal_audit`). These tests pin the audit
trail so a refund decision can never again be made untraceably.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from payments.models import PaymentRecord, RefundRequest
from security.models import AuditLog

User = get_user_model()


class RefundAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="refund.admin@yala.test",
            password="adminpass123",
            user_type="admin",
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email="refund.customer@yala.test",
            password="customerpass123",
            user_type="rider",
        )
        self.client.force_authenticate(user=self.admin)
        self.payment = PaymentRecord.objects.create(
            source="delivery",
            method="cash",
            status="paid",
            amount=Decimal("200.00"),
            currency="MRU",
        )

    def _refund(self, status="requested"):
        return RefundRequest.objects.create(
            payment_record=self.payment,
            customer=self.customer,
            amount=Decimal("50.00"),
            reason="cancelled_order",
            status=status,
        )

    def test_approve_persists_note_and_writes_audit(self):
        refund = self._refund()
        before = AuditLog.objects.count()

        response = self.client.post(
            f"/payments/admin/refunds/{refund.id}/approve/",
            {"admin_note": "Approved after review"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        refund.refresh_from_db()
        # approve_refund sets "approved" then immediately credits the customer wallet
        # and settles to "refunded" (settlement_service.py:466), so the terminal
        # state after approval is "refunded".
        self.assertEqual(refund.status, "refunded")
        self.assertEqual(refund.admin_note, "Approved after review")

        self.assertEqual(AuditLog.objects.count(), before + 1)
        entry = AuditLog.objects.latest("id")
        self.assertIn(f"Refund #{refund.id} approved", entry.summary)
        self.assertEqual(entry.entity_type, "payment")
        self.assertEqual(str(entry.entity_id), str(refund.id))
        self.assertEqual(entry.details.get("admin_note"), "Approved after review")

    def test_reject_persists_note_and_writes_audit(self):
        refund = self._refund()
        before = AuditLog.objects.count()

        response = self.client.post(
            f"/payments/admin/refunds/{refund.id}/reject/",
            {"admin_note": "Duplicate request"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        refund.refresh_from_db()
        self.assertEqual(refund.status, "rejected")
        self.assertEqual(refund.admin_note, "Duplicate request")

        self.assertEqual(AuditLog.objects.count(), before + 1)
        entry = AuditLog.objects.latest("id")
        self.assertIn(f"Refund #{refund.id} rejected", entry.summary)
        self.assertEqual(entry.details.get("admin_note"), "Duplicate request")

    def test_audit_records_the_acting_admin(self):
        refund = self._refund()
        self.client.post(
            f"/payments/admin/refunds/{refund.id}/approve/",
            {"admin_note": "ok"},
            format="json",
        )
        entry = AuditLog.objects.latest("id")
        self.assertEqual(entry.actor_id, self.admin.id)
