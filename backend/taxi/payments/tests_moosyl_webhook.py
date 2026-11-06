"""Moosyl webhook tests: signature security, replay/duplicate safety, amount and
currency validation, exactly-once settlement, and commission/earnings arithmetic.

These run entirely offline against the real adapter (no network), which is why
``payments.providers.registry.get_provider("moosyl")`` always returns the real adapter:
the signature and settlement contracts being tested are the same ones Moosyl's live
sandbox will exercise. The genuine network sandbox test is at the bottom and skips
itself unless real sandbox credentials are present.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from authapp.models import User
from payments.models import Payment, PaymentRecord, ProviderWebhookEvent
from payments.moosyl_settlement import (
    build_transaction_id,
    parse_transaction_id,
)
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

WEBHOOK_URL = "/payments/webhooks/moosyl/"
WEBHOOK_SECRET = "test-moosyl-webhook-secret"
SECRET_KEY = "test-moosyl-secret-key"

SANDBOX_SETTINGS = dict(
    MOOSYL_API_BASE_URL="https://api.moosyl.com",
    MOOSYL_SECRET_KEY=SECRET_KEY,
    MOOSYL_WEBHOOK_SECRET=WEBHOOK_SECRET,
    MOOSYL_ENVIRONMENT="sandbox",
    MOOSYL_ALLOW_SANDBOX_SETTLEMENT=True,
    MOOSYL_FEE_PERCENT="1",
)

# A documented Moosyl payment payload.
def moosyl_payment_payload(
    *,
    event="payment-created",
    transaction_id="",
    amount="120.50",
    status="completed",
    payment_id="3f6c1a52-8e1d-4c1f-9d7e-2b0c5f1e9a41",
):
    return {
        "event": event,
        "data": {
            "id": payment_id,
            "transactionId": transaction_id,
            "amount": amount,
            "status": status,
            "phoneNumber": "22222222",
            "paymentRequestId": "b7a4e0f2-5c3d-4a8e-9f10-6d2e8c7b1a53",
            "referenceId": "BK-20260925-000123",
            "metadata": None,
            "payoutId": None,
            "completedAt": "2026-09-25T10:15:32.000Z",
            "createdAt": "2026-09-25T10:15:30.000Z",
            "updatedAt": "2026-09-25T10:15:32.000Z",
            "request": {
                "id": "b7a4e0f2-5c3d-4a8e-9f10-6d2e8c7b1a53",
                "transactionId": transaction_id,
                "amount": 2500,
                "retryCount": 0,
            },
        },
    }


def sign(secret: str, raw: bytes) -> str:
    """The documented signature: sha256= + hex HMAC-SHA256 of the RAW body."""
    return "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


class MoosylWebhookBase(TestCase):
    """Shared fixtures: one rider, one approved driver, one completed ride."""

    def setUp(self):
        self.rider = User.objects.create_user(
            email="moosyl-rider@example.com",
            password="StrongPass123",
            first_name="Rider",
            last_name="Moosyl",
            phone_number="+22233120001",
            phone_verified_at=timezone.now(),
            national_id_number="2222900001",
        )
        self.driver = User.objects.create_user(
            email="moosyl-driver@example.com",
            password="StrongPass123",
            first_name="Driver",
            last_name="Moosyl",
            phone_number="+22233120002",
            phone_verified_at=timezone.now(),
            national_id_number="2222900002",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            driver_code="929001",
            qr_code_uuid="30000000-0000-4000-8000-000000000001",
            is_available=True,
            registration_status="approved",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("120.50"),
            status="completed",
        )
        self.transaction_id = build_transaction_id("RIDE", self.ride.id)

    # ── helpers ──────────────────────────────────────────────────────────────
    def post_webhook(
        self,
        payload,
        *,
        delivery_id="dlv-0001",
        signature=None,
        secret=WEBHOOK_SECRET,
        raw=None,
        content_type="application/json",
        omit_signature=False,
        omit_delivery_id=False,
    ):
        raw = raw if raw is not None else json.dumps(payload).encode("utf-8")
        headers = {}
        if not omit_signature:
            headers["HTTP_X_WEBHOOK_SIGNATURE"] = (
                signature if signature is not None else sign(secret, raw)
            )
        if not omit_delivery_id:
            headers["HTTP_X_WEBHOOK_DELIVERY_ID"] = delivery_id
        headers["HTTP_X_WEBHOOK_EVENT"] = str((payload or {}).get("event") or "")
        return self.client.post(
            WEBHOOK_URL, data=raw, content_type=content_type, **headers
        )

    def completed_payload(self, **kwargs):
        kwargs.setdefault("transaction_id", self.transaction_id)
        return moosyl_payment_payload(**kwargs)

    @property
    def ride_payment(self):
        return Payment.objects.filter(ride_id=self.ride.id).order_by("-created_at").first()


@override_settings(**SANDBOX_SETTINGS)
class MoosylSignatureSecurityTests(MoosylWebhookBase):
    """A webhook may never be trusted without a valid signature over the RAW body."""

    def test_valid_signature_is_accepted(self):
        response = self.post_webhook(self.completed_payload())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["verified"])
        self.assertTrue(response.json()["settled"])

    def test_missing_signature_is_refused(self):
        response = self.post_webhook(self.completed_payload(), omit_signature=True)
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    def test_wrong_signature_is_refused(self):
        response = self.post_webhook(
            self.completed_payload(), signature="sha256=" + "0" * 64
        )
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    def test_signature_without_scheme_prefix_is_refused(self):
        """The documented header is ``sha256=<hex>``; a bare digest must not be accepted."""
        payload = self.completed_payload()
        raw = json.dumps(payload).encode("utf-8")
        bare = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        response = self.post_webhook(payload, signature=bare)
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    def test_signature_over_reserialised_body_is_refused(self):
        """The documented pitfall: hashing a parsed/re-serialised body instead of raw bytes."""
        payload = self.completed_payload()
        raw = json.dumps(payload).encode("utf-8")
        reserialised = json.dumps(json.loads(raw.decode()), indent=2).encode("utf-8")
        response = self.post_webhook(payload, raw=raw, signature=sign(WEBHOOK_SECRET, reserialised))
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    def test_signature_with_a_different_secret_is_refused(self):
        response = self.post_webhook(self.completed_payload(), secret="not-our-secret")
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    @override_settings(MOOSYL_WEBHOOK_SECRET="")
    def test_unconfigured_webhook_secret_fails_closed(self):
        """No secret configured ⇒ refuse, never trust the payload."""
        response = self.post_webhook(self.completed_payload())
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.ride_payment)

    def test_unknown_provider_is_404(self):
        response = self.client.post(
            "/payments/webhooks/definitely-not-a-provider/",
            data=b"{}",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(MOOSYL_ALLOW_SANDBOX_SETTLEMENT=False)
    def test_verified_event_does_not_settle_when_sandbox_settlement_is_disabled(self):
        """Default-safety: a genuine sandbox event is recorded but moves no money."""
        response = self.post_webhook(self.completed_payload())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["verified"])
        self.assertFalse(response.json()["settled"])
        self.assertEqual(response.json()["outcome"], "ignored")
        self.assertIsNone(self.ride_payment)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.driver_earning, Decimal("0.00"))


@override_settings(**SANDBOX_SETTINGS)
class MoosylExactlyOnceSettlementTests(MoosylWebhookBase):
    """Requirement: the correct trip or delivery is updated exactly once."""

    def test_completed_payment_created_settles_the_ride(self):
        response = self.post_webhook(self.completed_payload())
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["settled"])
        self.assertEqual(body["outcome"], "settled")

        payment = self.ride_payment
        self.assertIsNotNone(payment)
        self.assertEqual(payment.status, "paid")
        self.assertEqual(payment.method, "moosyl")
        self.assertEqual(payment.currency, "MRU")
        # Moosyl's own payment id is stored for reconciliation.
        self.assertEqual(payment.transaction_id, "3f6c1a52-8e1d-4c1f-9d7e-2b0c5f1e9a41")

    def test_payment_updated_pending_then_completed_settles(self):
        """The documented two-step flow: created(pending) then updated(completed)."""
        first = self.post_webhook(
            self.completed_payload(event="payment-created", status="pending"),
            delivery_id="dlv-pending",
        )
        self.assertEqual(first.json()["outcome"], "ignored")
        self.assertIsNone(self.ride_payment)

        second = self.post_webhook(
            self.completed_payload(event="payment-updated", status="completed"),
            delivery_id="dlv-completed",
        )
        self.assertTrue(second.json()["settled"])
        self.assertEqual(self.ride_payment.status, "paid")

    def test_duplicate_delivery_id_is_a_noop(self):
        """Moosyl reuses x-webhook-delivery-id across retries: the replay must not pay twice."""
        payload = self.completed_payload()

        first = self.post_webhook(payload, delivery_id="dlv-same")
        self.assertTrue(first.json()["settled"])

        second = self.post_webhook(payload, delivery_id="dlv-same")
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["settled"])
        self.assertEqual(second.json()["outcome"], "duplicate")

        # Exactly one payment row, still paid, and only one webhook event stored.
        self.assertEqual(Payment.objects.filter(ride_id=self.ride.id).count(), 1)
        self.assertEqual(ProviderWebhookEvent.objects.count(), 1)

    def test_seven_retries_of_the_same_delivery_settle_once(self):
        """The documented retry ladder (1,2,4,8,16,32 min) replays the same delivery id."""
        payload = self.completed_payload()
        outcomes = [
            self.post_webhook(payload, delivery_id="dlv-retry").json()["outcome"]
            for _ in range(7)
        ]
        self.assertEqual(outcomes[0], "settled")
        self.assertEqual(outcomes[1:], ["duplicate"] * 6)
        self.assertEqual(Payment.objects.filter(ride_id=self.ride.id).count(), 1)

    def test_a_second_delivery_for_an_already_paid_ride_is_a_duplicate(self):
        """A different delivery id describing the same payment must not pay twice either."""
        first = self.post_webhook(self.completed_payload(), delivery_id="dlv-a")
        self.assertTrue(first.json()["settled"])

        second = self.post_webhook(self.completed_payload(), delivery_id="dlv-b")
        self.assertFalse(second.json()["settled"])
        self.assertEqual(second.json()["outcome"], "duplicate")
        self.assertEqual(ProviderWebhookEvent.objects.count(), 2)

    def test_missing_delivery_id_falls_back_to_a_body_hash(self):
        """Without the header, byte-identical duplicates still collapse."""
        payload = self.completed_payload()
        first = self.post_webhook(payload, omit_delivery_id=True)
        self.assertTrue(first.json()["settled"])
        second = self.post_webhook(payload, omit_delivery_id=True)
        self.assertEqual(second.json()["outcome"], "duplicate")
        self.assertEqual(Payment.objects.filter(ride_id=self.ride.id).count(), 1)


@override_settings(**SANDBOX_SETTINGS)
class MoosylValidationTests(MoosylWebhookBase):
    """Requirement: verify amount, currency (MRU), transaction id and the linked trip."""

    def _rejecting_post(self, payload, **kwargs):
        response = self.post_webhook(payload, **kwargs)
        body = response.json()
        self.assertFalse(body["settled"], body)
        # The ride must never be touched by a rejected event.
        self.assertIsNone(self.ride_payment)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.driver_earning, Decimal("0.00"))
        return body

    def test_amount_mismatch_is_rejected(self):
        """Provider says 100.00 but the ride expects 120.50 — never settle the provider's figure."""
        body = self._rejecting_post(
            self.completed_payload(amount="100.00"), delivery_id="dlv-amt"
        )
        self.assertEqual(body["outcome"], "rejected")
        self.assertIn("Amount mismatch", body["reason"])

    def test_amount_above_expected_is_rejected_too(self):
        body = self._rejecting_post(
            self.completed_payload(amount="999.00"), delivery_id="dlv-amt-hi"
        )
        self.assertEqual(body["outcome"], "rejected")
        self.assertIn("Amount mismatch", body["reason"])

    def test_non_mru_currency_is_rejected(self):
        payload = self.completed_payload()
        payload["data"]["currency"] = "EUR"
        body = self._rejecting_post(payload, delivery_id="dlv-cur")
        self.assertEqual(body["outcome"], "rejected")
        self.assertIn("Currency", body["reason"])

    def test_explicit_mru_currency_is_accepted(self):
        payload = self.completed_payload()
        payload["data"]["currency"] = "MRU"
        response = self.post_webhook(payload, delivery_id="dlv-cur-ok")
        self.assertTrue(response.json()["settled"])

    def test_pending_status_is_ignored(self):
        body = self._rejecting_post(
            self.completed_payload(status="pending"), delivery_id="dlv-pending"
        )
        self.assertEqual(body["outcome"], "ignored")

    def test_failed_status_is_ignored(self):
        body = self._rejecting_post(
            self.completed_payload(status="failed"), delivery_id="dlv-failed"
        )
        self.assertEqual(body["outcome"], "ignored")

    def test_cancelled_status_is_ignored(self):
        body = self._rejecting_post(
            self.completed_payload(status="cancelled"), delivery_id="dlv-cancelled"
        )
        self.assertEqual(body["outcome"], "ignored")

    def test_foreign_transaction_id_is_rejected(self):
        """An id we did not generate must never be resolved to one of our orders."""
        body = self._rejecting_post(
            self.completed_payload(transaction_id="order_1043"), delivery_id="dlv-foreign"
        )
        self.assertEqual(body["outcome"], "rejected")
        self.assertIn("not a Yala", body["reason"])

    def test_transaction_id_for_a_nonexistent_ride_is_rejected(self):
        body = self._rejecting_post(
            self.completed_payload(transaction_id=build_transaction_id("RIDE", 999999)),
            delivery_id="dlv-noride",
        )
        self.assertEqual(body["outcome"], "rejected")
        self.assertIn("No ride", body["reason"])

    def test_unsupported_event_name_is_rejected(self):
        payload = self.completed_payload()
        payload["event"] = "totally-made-up"
        response = self.post_webhook(payload, delivery_id="dlv-badevent")
        self.assertEqual(response.status_code, 403)

    def test_malformed_json_body_is_rejected(self):
        response = self.post_webhook(
            None, raw=b"{not json", delivery_id="dlv-badjson"
        )
        self.assertEqual(response.status_code, 403)

    def test_non_payment_event_is_recorded_but_ignored(self):
        """payment-request-* carries no payment, so it can never settle anything."""
        payload = {
            "event": "payment-request-created",
            "data": {"id": "req-1", "transactionId": self.transaction_id, "retryCount": 0},
        }
        response = self.post_webhook(payload, delivery_id="dlv-req")
        self.assertEqual(response.json()["outcome"], "ignored")
        self.assertIsNone(self.ride_payment)


@override_settings(**SANDBOX_SETTINGS)
class MoosylCommissionAndFeeTests(MoosylWebhookBase):
    """Requirement: 30% Yala commission / 70% driver earnings, plus Moosyl's 1% fee.

    Fare is 120.50 MRU, so the expected split is exact and easy to reason about:
        30%  -> 36.15 MRU platform commission
        70%  -> 84.35 MRU driver earnings
        1%   ->  1.21 MRU Moosyl processing fee (a PLATFORM cost)
        net to Yala's IBAN -> 119.29 MRU
    """

    def test_the_seeded_split_is_thirty_seventy(self):
        from app_settings.pricing_service import get_ride_commission_policy

        policy = get_ride_commission_policy()
        self.assertEqual(policy["platform_percent"], Decimal("0.3000"))
        self.assertEqual(policy["driver_percent"], Decimal("0.7000"))

    def test_settlement_applies_30_70(self):
        self.post_webhook(self.completed_payload())
        payment = self.ride_payment
        self.assertEqual(payment.amount, Decimal("120.50"))
        self.assertEqual(payment.app_fee, Decimal("36.15"))
        self.assertEqual(payment.driver_earning, Decimal("84.35"))

        # The ride carries the same figures the driver will be paid from.
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.app_fee, Decimal("36.15"))
        self.assertEqual(self.ride.driver_earning, Decimal("84.35"))

    def test_the_two_shares_always_reconstruct_the_fare(self):
        """commission + driver earning must equal the fare exactly, with no lost cent."""
        self.post_webhook(self.completed_payload())
        payment = self.ride_payment
        self.assertEqual(
            payment.app_fee + payment.driver_earning, Decimal("120.50")
        )

    def test_moosyl_fee_is_one_percent(self):
        from payments.moosyl_settlement import moosyl_fee

        self.assertEqual(moosyl_fee(Decimal("120.50")), Decimal("1.21"))
        self.assertEqual(moosyl_fee(Decimal("100.00")), Decimal("1.00"))
        self.assertEqual(moosyl_fee(Decimal("2500")), Decimal("25.00"))

    def test_moosyl_fee_is_not_deducted_from_the_driver(self):
        """The 1% is a platform cost: the driver still receives the full 70%."""
        response = self.post_webhook(self.completed_payload())
        detail = response.json()["reason"]
        payment = self.ride_payment

        # Driver earning is untouched by the fee: it is exactly 70% of the fare.
        self.assertEqual(payment.driver_earning, Decimal("84.35"))
        self.assertNotEqual(payment.driver_earning, Decimal("83.14"))

        # And the settlement record states the fee and the net explicitly.
        self.assertIn("1.21", detail)
        self.assertIn("119.29", detail)
        self.assertIn("not deducted from the driver", detail)

    def test_the_settlement_record_explains_the_money_flow(self):
        """Operators must be able to see why a driver is paid by Yala, not by Moosyl."""
        response = self.post_webhook(self.completed_payload())
        detail = response.json()["reason"]
        self.assertIn("Ride", detail)
        self.assertIn("36.15", detail)
        self.assertIn("84.35", detail)
        self.assertIn("withdrawal flow", detail)

    def test_commission_follows_the_active_config_not_a_hardcoded_rate(self):
        """A different active policy must change the split — proving it is config-driven."""
        from app_settings.models import RideCommissionConfig
        from app_settings.pricing_service import get_ride_commission_policy

        RideCommissionConfig.objects.update(is_active=False)
        RideCommissionConfig.objects.create(
            platform_percent=Decimal("0.2500"),
            driver_percent=Decimal("0.7500"),
            is_active=True,
            effective_from=timezone.now(),
        )
        self.assertEqual(
            get_ride_commission_policy()["platform_percent"], Decimal("0.2500")
        )

        self.post_webhook(self.completed_payload())
        payment = self.ride_payment
        self.assertEqual(payment.app_fee, Decimal("30.13"))  # 120.50 * 0.25
        self.assertEqual(payment.driver_earning, Decimal("90.37"))  # the remainder

    def test_payment_created_as_pending_is_not_commissioned(self):
        """No money moved, so no commission and no earnings may be created."""
        self.post_webhook(
            self.completed_payload(status="pending"), delivery_id="dlv-c1"
        )
        self.assertIsNone(self.ride_payment)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.app_fee, Decimal("0.00"))
        self.assertEqual(self.ride.driver_earning, Decimal("0.00"))

    def test_transaction_id_contract_round_trips(self):
        for scope, expected in (("RIDE", "YALA-RIDE-1043"), ("DELIVERY", "YALA-DELIVERY-1043")):
            tid = build_transaction_id(scope, 1043)
            self.assertEqual(tid, expected)
            self.assertEqual(parse_transaction_id(tid), (scope, 1043))
        for bad in ("", "order_1043", "YALA-RIDE-x", "YALA-OTHER-1", "YALA-RIDE-0", "YALA-RIDE-1-2"):
            self.assertIsNone(parse_transaction_id(bad), bad)





