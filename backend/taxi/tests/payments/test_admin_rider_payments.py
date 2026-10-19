"""Tests for the admin rider payment-history + refunds endpoint.

Covers authorization, strict rider data isolation, pagination caps, optional
status filtering, refunds exposure, and the guarantee that no payment token or
full card data ever appears in the serialized payload.
"""

from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from payments.models import Payment, PaymentRecord, RefundRequest
from taxi.drivers.models import DriverProfile


def _create_refund(payment_record, customer, amount, reason, status):
    """Insert a RefundRequest row directly through the DB cursor.

    The RefundRequest model class in payments/models.py is out of sync with
    migration 0021 (it does not declare requires_dual_approval /
    finance_approved_* , which the migration added). Because the ORM is unaware
    of those columns it cannot supply their defaults on INSERT, so a plain
    RefundRequest.objects.create(...) raises a NOT NULL violation. This is a
    pre-existing drift unrelated to this feature, so the test seeds the row
    against the real schema and returns the model instance for the endpoint
    (which only reads the fields the model does declare).
    """
    table = RefundRequest._meta.db_table
    now = timezone.now()
    with connection.cursor() as cursor:
        cursor.execute(
            f"INSERT INTO {table} "
            "(payment_record_id, customer_id, amount, reason, status, note, "
            "admin_note, fraud_flag, wallet_refund_tx_id, created_at, "
            "resolved_at, requires_dual_approval, finance_approved_at, "
            "finance_approved_by_id) "
            "VALUES (%s, %s, %s, %s, %s, '', '', 0, NULL, %s, NULL, 0, NULL, NULL)",
            [payment_record.id, customer.id, str(amount), reason, status, now],
        )
        refund_id = cursor.lastrowid
    return RefundRequest.objects.get(id=refund_id)


def _make_rider(email, phone, national_id):
    return User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Rider",
        last_name="Test",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        national_id_number=national_id,
        rider_status="approved",
    )


# The explicit, whitelisted set of payment fields the endpoint is allowed to
# expose. Anything else (notably provider_token / card data) is a leak.
ALLOWED_PAYMENT_FIELDS = {
    "transaction_id",
    "ride_id",
    "amount",
    "currency",
    "method",
    "status",
    "created_at",
}


class AdminRiderPaymentsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="pay-admin@test.local",
            password="StrongPass123",
            is_staff=True,
        )
        self.rider = _make_rider("pay-rider@example.com", "+22233200001", "2223000001")
        self.other_rider = _make_rider(
            "pay-other@example.com", "+22233200002", "2223000002"
        )

        self.driver_user = User.objects.create_user(
            email="pay-driver@example.com",
            password="StrongPass123",
            first_name="Dolo",
            last_name="Drive",
            phone_number="+22233200003",
            phone_verified_at=timezone.now(),
            national_id_number="2223000003",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            driver_code="930001",
            qr_code_uuid="30000000-0000-4000-8000-000000000001",
            is_available=True,
            registration_status="approved",
        )

        # Payments for self.rider.
        self.payment_paid = Payment.objects.create(
            rider=self.rider,
            ride_id=101,
            amount=Decimal("120.50"),
            currency="MRU",
            method="card",
            status="paid",
            transaction_id="TXN-PAID-1",
        )
        self.payment_pending = Payment.objects.create(
            rider=self.rider,
            ride_id=102,
            amount=Decimal("55.00"),
            currency="MRU",
            method="bankily",
            status="pending",
            transaction_id="TXN-PEND-1",
        )

        # A payment belonging to a DIFFERENT rider — must never leak.
        self.other_payment = Payment.objects.create(
            rider=self.other_rider,
            ride_id=201,
            amount=Decimal("999.00"),
            currency="MRU",
            method="card",
            status="paid",
            transaction_id="TXN-OTHER-1",
        )

        # A refund for self.rider via a PaymentRecord (which carries a
        # provider_token that must never surface).
        self.payment_record = PaymentRecord.objects.create(
            source="ride",
            customer=self.rider,
            ride_id=101,
            amount=Decimal("120.50"),
            method="card",
            status="refunded",
            transaction_id="PR-1",
            provider_token="tok_secret_should_never_leak",
            currency="MRU",
        )
        self.refund = _create_refund(
            self.payment_record,
            self.rider,
            Decimal("120.50"),
            "customer_complaint",
            "requested",
        )

        # A refund for a DIFFERENT rider — must never leak.
        self.other_record = PaymentRecord.objects.create(
            source="ride",
            customer=self.other_rider,
            ride_id=201,
            amount=Decimal("999.00"),
            method="card",
            status="refunded",
            transaction_id="PR-OTHER",
            provider_token="tok_other_secret",
            currency="MRU",
        )
        self.other_refund = _create_refund(
            self.other_record,
            self.other_rider,
            Decimal("999.00"),
            "customer_complaint",
            "requested",
        )

    def _url(self, rider_id):
        return f"/payments/admin/rider/{rider_id}/payments/"

    # ── Authorization ──────────────────────────────────────────────────────
    def test_anonymous_denied(self):
        response = self.client.get(self._url(self.rider.id))
        self.assertIn(response.status_code, (401, 403))

    def test_non_staff_rider_denied(self):
        self.client.force_authenticate(user=self.rider)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 403)

    def test_admin_allowed(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 200)

    def test_staff_target_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.admin.id))
        self.assertEqual(response.status_code, 404)

    def test_driver_target_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.driver_user.id))
        self.assertEqual(response.status_code, 404)

    # ── Data isolation ─────────────────────────────────────────────────────
    def test_only_target_rider_payments_returned(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        returned = {row["transaction_id"] for row in data["results"]}
        self.assertNotIn("TXN-OTHER-1", returned)
        self.assertEqual(returned, {"TXN-PAID-1", "TXN-PEND-1"})

    def test_refunds_isolation(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        refunds = response.json()["refunds"]
        refund_ids = {r["id"] for r in refunds}
        self.assertIn(self.refund.id, refund_ids)
        self.assertNotIn(self.other_refund.id, refund_ids)
        # currency is derived from the related PaymentRecord.
        self.assertEqual(refunds[0]["currency"], "MRU")

    # ── Pagination ─────────────────────────────────────────────────────────
    def test_pagination_cap_clamped_to_100(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"page_size": 500})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["page_size"], 100)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["count"], 2)
        self.assertEqual(data["total_pages"], 1)

    # ── Filters ────────────────────────────────────────────────────────────
    def test_status_filter(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"status": "paid"})
        self.assertEqual(response.status_code, 200)
        returned = {row["transaction_id"] for row in response.json()["results"]}
        self.assertEqual(returned, {"TXN-PAID-1"})

    def test_unknown_status_ignored(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id), {"status": "bogus"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)

    # ── Sensitive-field exclusion ──────────────────────────────────────────
    def test_no_sensitive_fields_in_payload(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self._url(self.rider.id))
        data = response.json()

        for row in data["results"]:
            self.assertEqual(set(row.keys()), ALLOWED_PAYMENT_FIELDS)
            self.assertNotIn("provider_token", row)

        # The whole serialized body must not contain the secret token anywhere
        # (e.g. leaking through the refund -> payment_record relation).
        self.assertNotIn("provider_token", response.content.decode())
        self.assertNotIn("tok_secret_should_never_leak", response.content.decode())

        refund_fields = {
            "id",
            "amount",
            "currency",
            "reason",
            "status",
            "created_at",
            "resolved_at",
        }
        for refund in data["refunds"]:
            self.assertEqual(set(refund.keys()), refund_fields)
            self.assertNotIn("payment_record", refund)
