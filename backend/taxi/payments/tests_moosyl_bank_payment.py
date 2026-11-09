"""Tests for Moosyl POST /payment (bank-app selection after payment-request)."""

from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase, override_settings

from payments.providers.moosyl import MoosylProvider

SETTINGS = dict(
    MOOSYL_API_BASE_URL="https://api.moosyl.com",
    MOOSYL_SECRET_KEY="test-key",
    MOOSYL_WEBHOOK_SECRET="test-wh",
    MOOSYL_ENVIRONMENT="sandbox",
)


@override_settings(**SETTINGS)
class MoosylBankPaymentTests(TestCase):
    def test_create_bank_payment_posts_expected_body(self):
        provider = MoosylProvider(
            {
                "MOOSYL_API_BASE_URL": "https://api.moosyl.com",
                "MOOSYL_SECRET_KEY": "test-key",
                "MOOSYL_WEBHOOK_SECRET": "test-wh",
                "MOOSYL_ENVIRONMENT": "sandbox",
            }
        )
        with patch.object(provider, "_request") as mocked:
            mocked.return_value = {
                "id": "pay-1",
                "status": "completed",
                "metadata": {"isSandbox": True},
            }
            result = provider.create_bank_payment(
                transaction_id="YALA-RIDE-42",
                configuration_id="cfg-bankily",
                phone_number="22222222",
            )
        mocked.assert_called_once()
        args, kwargs = mocked.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], "/payment")
        body = kwargs["body"]
        self.assertEqual(body["transactionId"], "YALA-RIDE-42")
        self.assertEqual(body["configurationId"], "cfg-bankily")
        self.assertEqual(body["phoneNumber"], "22222222")
        self.assertNotIn("paymentRequestId", body)
        self.assertNotIn("amount", body)
        self.assertEqual(result.reference, "pay-1")
        self.assertEqual(result.status, "succeeded")
        self.assertFalse(result.verified)

    def test_requires_configuration_id(self):
        provider = MoosylProvider(
            {
                "MOOSYL_SECRET_KEY": "k",
                "MOOSYL_WEBHOOK_SECRET": "w",
                "MOOSYL_API_BASE_URL": "https://api.moosyl.com",
            }
        )
        with self.assertRaises(Exception):
            provider.create_bank_payment(transaction_id="YALA-RIDE-1", configuration_id="")
