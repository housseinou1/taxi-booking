"""Phase 11 — payment security control tests.

Covers the rules that protect real money: authenticated provider webhooks
(fail-closed), "never mark a payment successful without verified confirmation",
duplicate-payment/idempotency protection, prohibited card data detection, and the
CEO payment-oversight endpoint (read-only, CEO tier, city-split).
"""

import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from payments.models import Payment
from payments.provider_security import (
    WebhookRejected,
    apply_verified_confirmation,
    card_data_violation,
    compute_signature,
    is_duplicate_collection,
    resolve_idempotency_key,
    suspicious_signals,
    verify_webhook,
)
from payments.providers import MODE_LIVE, ProviderResult

User = get_user_model()

OVERSIGHT_URL = "/payments/admin/payments/oversight/"
PROVIDERS_URL = "/payments/admin/payments/providers/"


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


class WebhookVerificationTests(TestCase):
    SECRET = "test-webhook-secret"

    @override_settings(BANKILY_WEBHOOK_SECRET="")
    def test_webhook_without_a_configured_secret_is_refused(self):
        with self.assertRaises(WebhookRejected):
            verify_webhook("bankily", b"{}", {"X-Yala-Signature": "anything"})

    @override_settings(BANKILY_WEBHOOK_SECRET=SECRET)
    def test_missing_or_invalid_signature_is_refused(self):
        with self.assertRaises(WebhookRejected):
            verify_webhook("bankily", b"{}", {})
        with self.assertRaises(WebhookRejected):
            verify_webhook("bankily", b"{}", {"X-Yala-Signature": "deadbeef"})

    @override_settings(BANKILY_WEBHOOK_SECRET=SECRET)
    def test_valid_signature_is_accepted_but_never_settles_money(self):
        body = json.dumps({"type": "collection.succeeded", "reference": "ref-1"}).encode()
        signature = compute_signature(self.SECRET, body)
        verification = verify_webhook("bankily", body, {"X-Yala-Signature": signature})
        self.assertTrue(verification.verified)
        self.assertEqual(verification.mode, "mock")

    @override_settings(BANKILY_WEBHOOK_SECRET=SECRET)
    def test_webhook_endpoint_rejects_unsigned_calls(self):
        client = APIClient()
        response = client.post(
            "/payments/webhooks/bankily/", data=b"{}", content_type="application/json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.data["settled"])

    @override_settings(BANKILY_WEBHOOK_SECRET=SECRET)
    def test_webhook_endpoint_accepts_a_signed_mock_event_without_settling(self):
        body = json.dumps({"type": "collection.succeeded", "reference": "ref-9"}).encode()
        signature = compute_signature(self.SECRET, body)
        client = APIClient()
        response = client.post(
            "/payments/webhooks/bankily/",
            data=body,
            content_type="application/json",
            HTTP_X_YALA_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["verified"])
        self.assertFalse(response.data["settled"])

    def test_unknown_provider_webhook_is_404(self):
        client = APIClient()
        response = client.post(
            "/payments/webhooks/not-a-provider/", data=b"{}", content_type="application/json"
        )
        self.assertEqual(response.status_code, 404)


class VerifiedConfirmationTests(TestCase):
    def setUp(self):
        self.rider = _user("rider-verify@yala.test")
        self.payment = Payment.objects.create(
            rider=self.rider,
            ride_id=1,
            amount=Decimal("1000.00"),
            method="bankily",
            status="pending_verification",
        )

    def _result(self, **kwargs):
        base = {
            "provider": "bankily",
            "reference": "ref-1",
            "status": "succeeded",
            "verified": True,
            "mode": MODE_LIVE,
        }
        base.update(kwargs)
        return ProviderResult(**base)

    def test_mock_or_unverified_results_can_never_settle_a_payment(self):
        from payments.providers import ProviderResponseUnverified

        for result in (
            self._result(mode="mock"),
            self._result(verified=False),
            self._result(status="pending"),
        ):
            with self.assertRaises(ProviderResponseUnverified):
                apply_verified_confirmation(self.payment, result)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "pending_verification")

    def test_verified_live_success_settles_the_payment(self):
        self.assertTrue(apply_verified_confirmation(self.payment, self._result()))
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "paid")
        self.assertEqual(self.payment.transaction_id, "ref-1")

    def test_reapplying_a_confirmation_is_idempotent(self):
        apply_verified_confirmation(self.payment, self._result())
        self.payment.refresh_from_db()
        self.assertFalse(apply_verified_confirmation(self.payment, self._result()))


class DuplicateAndRiskTests(TestCase):
    def test_idempotency_key_is_stable_for_the_same_intent(self):
        first = resolve_idempotency_key(scope="ride", user_id=1, reference="ride-1", amount="1000")
        second = resolve_idempotency_key(scope="ride", user_id=1, reference="ride-1", amount="1000")
        third = resolve_idempotency_key(scope="ride", user_id=1, reference="ride-2", amount="1000")
        self.assertEqual(first, second)
        self.assertNotEqual(first, third)

    def test_duplicate_settled_collection_is_detected(self):
        from payments.models import WithdrawalRequest

        driver = _user("driver-dup@yala.test")
        key = resolve_idempotency_key(
            scope="withdrawal", user_id=driver.id, reference="wd-1", amount="500"
        )
        WithdrawalRequest.objects.create(
            driver=driver, amount=Decimal("500.00"), status="paid", idempotency_key=key
        )
        self.assertTrue(
            is_duplicate_collection(
                scope="withdrawal",
                user_id=driver.id,
                reference="wd-1",
                amount="500",
                model=WithdrawalRequest,
            )
        )

    def test_risk_signals_flag_high_value_and_non_production_methods(self):
        self.assertIn("high_value", suspicious_signals(amount=60000, method="card"))
        self.assertIn("non_production_method", suspicious_signals(amount=100, method="test"))
        self.assertIn("zero_amount", suspicious_signals(amount=0, method="card"))
        self.assertEqual(suspicious_signals(amount=100, method="card", hour=12), [])

    def test_prohibited_card_data_is_detected(self):
        self.assertIsNotNone(card_data_violation({"card_number": "4242"}))
        self.assertIsNotNone(card_data_violation({"cvv": "123"}))
        self.assertIsNone(card_data_violation({"token": "tok_1", "amount": 100}))



class PaymentOversightAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-pay@yala.test", is_staff=True), "CEO")
        self.ops = _in_group(_user("ops-pay@yala.test", is_staff=True), "Operations Manager")
        self.plain = _user("plain-pay@yala.test")

    def test_oversight_is_ceo_only(self):
        for user in (self.ops, self.plain):
            self.client.force_authenticate(user=user)
            for url in (OVERSIGHT_URL, PROVIDERS_URL):
                self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_oversight_is_read_only(self):
        self.client.force_authenticate(user=self.ceo)
        for url in (OVERSIGHT_URL, PROVIDERS_URL):
            self.assertEqual(self.client.post(url, {}, format="json").status_code, 405, url)

    def test_oversight_reports_cashless_status_providers_and_cities(self):
        self.client.force_authenticate(user=self.ceo)
        res = self.client.get(OVERSIGHT_URL)

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["cashless_policy"]["enforced"])
        self.assertFalse(res.data["providers"]["any_live_provider"])
        cities = [block["city"] for block in res.data["cities"]]
        self.assertEqual(cities, ["Nouakchott", "Nouadhibou", "Combined"])
        for block in res.data["cities"]:
            self.assertIn("payments", block)
            self.assertIn("ledger", block)
            self.assertIn("withdrawals", block)
        self.assertTrue(res.data["read_only"])
        self.assertFalse(res.data["financial_activation"])
        self.assertFalse(res.data["live_payments"])
        self.assertFalse(res.data["live_withdrawals"])

    def test_combined_city_totals_equal_the_sum_of_cities(self):
        self.client.force_authenticate(user=self.ceo)
        res = self.client.get(OVERSIGHT_URL, {"period": "all"})
        combined = next(b for b in res.data["cities"] if b["city"] == "Combined")
        per_city = [
            b["payments"]["count"] for b in res.data["cities"] if b["city"] != "Combined"
        ]
        self.assertEqual(combined["payments"]["count"], sum(per_city))

    def test_providers_endpoint_lists_every_modelled_provider_with_readiness(self):
        """The oversight endpoint must expose every provider the platform models.

        Sedad is part of Yala's cashless method set, so it must appear here (in
        unconfigured/mock mode) instead of being silently absent from oversight.
        """
        self.client.force_authenticate(user=self.ceo)
        res = self.client.get(PROVIDERS_URL)
        self.assertEqual(res.status_code, 200)
        codes = [row["code"] for row in res.data["providers"]["providers"]]
        self.assertEqual(
            sorted(codes),
            sorted(["bankily", "masravi", "sedad", "bank_transfer", "card"]),
        )
        self.assertFalse(res.data["providers"]["live_mode_enabled"])
        # No provider may claim to be activation-ready.
        for row in res.data["providers"]["providers"]:
            self.assertFalse(row["activation_allowed"])

