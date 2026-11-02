"""Tests for the admin driver payout-history endpoint.

GET /payments/admin/driver/<DriverProfile.id>/payouts/

Covers auth, the DriverProfile.id -> User.id mapping, strict data isolation
between drivers, status filtering, pagination cap, and the security guarantee
that no provider_token or full card/PAN ever appears in the response.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

from .models import (
    DriverPayoutMethod,
    PaymentRecord,
    WithdrawalRequest,
)

User = get_user_model()

PROVIDER_TOKEN = "tok_secret_provider_ref_SHOULD_NOT_LEAK"
FULL_PAN = "4111111111111111"


def _walk_strings(value):
    """Yield every string found anywhere in a nested JSON structure."""
    if isinstance(value, dict):
        for k, v in value.items():
            yield str(k)
            yield from _walk_strings(v)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _walk_strings(item)
    elif value is not None:
        yield str(value)


class AdminDriverPayoutsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create users first so DriverProfile ids diverge from user ids.
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password="StrongPass123!"
        )
        self.non_staff = User.objects.create_user(
            email="plain@example.com", password="StrongPass123!"
        )
        self.user_a = User.objects.create_user(
            email="driverA@example.com", password="StrongPass123!", user_type="driver"
        )
        self.user_b = User.objects.create_user(
            email="driverB@example.com", password="StrongPass123!", user_type="driver"
        )

        self.profile_a = DriverProfile.objects.create(user=self.user_a, status="approved")
        self.profile_b = DriverProfile.objects.create(user=self.user_b, status="approved")

        # Sanity: the URL id is a DriverProfile.id distinct from the user id.
        assert self.profile_a.id != self.user_a.id
        assert self.profile_b.id != self.user_b.id
        assert self.profile_a.id != self.profile_b.id

        # Driver A withdrawals (one with a card payout method).
        self.method_a_card = DriverPayoutMethod.objects.create(
            driver=self.user_a,
            payout_type="card",
            card_type="visa",
            card_last4="4242",
        )
        self.wr_a_paid = WithdrawalRequest.objects.create(
            driver=self.user_a,
            payout_method=self.method_a_card,
            amount=Decimal("150.00"),
            status="paid",
        )
        self.wr_a_pending = WithdrawalRequest.objects.create(
            driver=self.user_a,
            amount=Decimal("75.50"),
            status="pending",
        )

        # Driver B withdrawal (must never leak into A's response).
        self.wr_b = WithdrawalRequest.objects.create(
            driver=self.user_b,
            amount=Decimal("999.00"),
            status="pending",
        )

        # A PaymentRecord carrying a provider_token for A's user. It must NEVER
        # surface in the payouts response.
        PaymentRecord.objects.create(
            source="ride",
            courier=self.user_a,
            amount=Decimal("150.00"),
            provider_token=PROVIDER_TOKEN,
            transaction_id=FULL_PAN,
        )

    def _url(self, driver_id):
        return f"/payments/admin/driver/{driver_id}/payouts/"

    # --- auth ---

    def test_anonymous_denied(self):
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertIn(resp.status_code, (401, 403))

    def test_non_staff_forbidden(self):
        self.client.force_authenticate(self.non_staff)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 403)

    def test_admin_ok(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        for key in ("count", "page", "page_size", "total_pages", "results"):
            self.assertIn(key, resp.data)

    def test_missing_profile_404(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(999999))
        self.assertEqual(resp.status_code, 404)

    # --- data isolation / id mapping ---

    def test_data_isolation_profile_id_resolves_user_id(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.wr_a_paid.id, self.wr_a_pending.id})
        self.assertNotIn(self.wr_b.id, ids)
        self.assertEqual(resp.data["count"], 2)

    def test_driver_b_never_leaks(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_b.id))
        self.assertEqual(resp.status_code, 200)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.wr_b.id})

    # --- status filter ---

    def test_status_filter(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "paid"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            {row["id"] for row in resp.data["results"]}, {self.wr_a_paid.id}
        )

    def test_unknown_status_ignored(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "bogus"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)

    # --- pagination cap ---

    def test_page_size_capped_at_100(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"page_size": 500})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["page_size"], 100)

    # --- serialization contract ---

    def test_payout_method_label_card(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "paid"})
        row = resp.data["results"][0]
        self.assertEqual(row["payout_method_label"], "card ****4242")

    def test_payout_method_label_none_when_absent(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "pending"})
        row = resp.data["results"][0]
        self.assertIsNone(row["payout_method_label"])

    def test_amount_serialized_as_string(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "paid"})
        row = resp.data["results"][0]
        self.assertIsInstance(row["amount"], str)
        self.assertEqual(row["amount"], "150.00")

    def test_whitelist_fields_only(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id), {"status": "paid"})
        row = resp.data["results"][0]
        self.assertEqual(
            set(row.keys()),
            {
                "id",
                "amount",
                "currency",
                "status",
                "note",
                "admin_note",
                "approved_at",
                "paid_at",
                "created_at",
                "payout_method_label",
            },
        )

    # --- security: no token / PAN anywhere ---

    def test_no_provider_token_or_pan_in_response(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(self._url(self.profile_a.id))
        self.assertEqual(resp.status_code, 200)
        strings = list(_walk_strings(resp.data))
        for s in strings:
            self.assertNotIn(PROVIDER_TOKEN, s)
            self.assertNotIn(FULL_PAN, s)
        # The nested payout method object is never serialized (only a label).
        for row in resp.data["results"]:
            self.assertNotIn("payout_method", row)
            self.assertNotIn("provider_token", row)

    # --- regression: driver_wallet_summary / GET /payments/withdrawals/ ---

    def test_driver_withdrawals_endpoint_unchanged(self):
        """The existing driver wallet contract keeps its shape and isolation."""
        self.client.force_authenticate(self.user_a)
        resp = self.client.get("/payments/withdrawals/")
        self.assertEqual(resp.status_code, 200)
        # Driver view returns a summary dict with a 'withdrawals' list.
        self.assertIn("withdrawals", resp.data)
        ids = {row["id"] for row in resp.data["withdrawals"]}
        self.assertEqual(ids, {self.wr_a_paid.id, self.wr_a_pending.id})
        self.assertNotIn(self.wr_b.id, ids)

    def test_admin_withdrawals_endpoint_returns_list(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/payments/withdrawals/")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)
