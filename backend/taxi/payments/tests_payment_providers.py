"""Phase 11 — payment provider architecture tests.

Verifies that only clearly-labelled mock adapters are active by default, that no
mock result can ever be mistaken for a verified/live confirmation, that real
adapters refuse to run without official credentials, and that no raw card data can
enter the card adapter.
"""

from django.test import TestCase, override_settings

from payments.providers import (
    MODE_LIVE,
    MODE_MOCK,
    MODE_UNCONFIGURED,
    PROVIDER_CODES,
    ProviderLiveModeDisabled,
    ProviderNotConfigured,
    get_provider,
    live_mode_enabled,
    provider_mode,
    provider_readiness,
)


class ProviderRegistryTests(TestCase):
    def test_default_mode_is_mock_and_live_is_off(self):
        self.assertEqual(provider_mode(), MODE_MOCK)
        self.assertFalse(live_mode_enabled())

    def test_all_supported_providers_are_modelled(self):
        """Bankily, Masravi, Sedad, bank transfer, card and Moosyl must all be modelled.

        Sedad is included because Yala's 100% cashless policy allows the ``sedad`` /
        ``seddad`` method, so the provider architecture must expose it (unconfigured)
        rather than leave the method without an adapter. Moosyl is the authorized
        aggregator that actually exposes Bankily/Sedad/Masrvi to merchants, so it is
        modelled as a first-class provider with its own adapter.
        """
        readiness = provider_readiness()
        codes = [row["code"] for row in readiness["providers"]]
        self.assertEqual(sorted(codes), sorted(PROVIDER_CODES))
        self.assertEqual(len(codes), 6)
        self.assertIn("sedad", codes)
        self.assertIn("moosyl", codes)


    def test_sedad_is_present_and_refuses_live_payouts(self):
        """Sedad has no verified B2C disbursement capability, so it must not claim one.

        Checked in two places, because both are visible to the CEO: the **real** adapter
        (the activation truth) and the **readiness report** (which is rendered from the
        adapter that is currently active — including a mock double).
        """
        from payments.providers.registry import REAL_ADAPTERS

        sedad = REAL_ADAPTERS["sedad"]({})
        self.assertEqual(sedad.code, "sedad")
        self.assertTrue(sedad.capabilities.collections)
        self.assertFalse(
            sedad.capabilities.payouts,
            "Sedad payouts are unverified and must not be advertised as supported",
        )
        # Missing configuration keeps it inert even if live mode were enabled.
        self.assertIn("SEDAD_API_KEY", sedad.missing_config())
        self.assertEqual(get_provider("sedad").code, "sedad")

        row = next(r for r in provider_readiness()["providers"] if r["code"] == "sedad")
        self.assertFalse(
            row["capabilities"]["payouts"],
            "the CEO-facing readiness report must not advertise unverified Sedad payouts",
        )

    def test_every_active_adapter_is_a_labelled_mock(self):
        # Moosyl is deliberately excluded: it resolves to the REAL adapter even while
        # PAYMENT_PROVIDER_MODE=mock, because a mock would make the documented HMAC
        # webhook contract and the exactly-once settlement path untestable. Its safety
        # comes from its own gates, asserted in the next test.
        for code in PROVIDER_CODES:
            if code == "moosyl":
                continue
            provider = get_provider(code)
            self.assertTrue(provider.is_mock, code)
            self.assertEqual(provider.mode, MODE_MOCK)
            self.assertIn("mock", provider.display_name.lower())

    def test_moosyl_is_the_real_adapter_and_is_inert_without_credentials(self):
        """Moosyl is real by design, and completely inert until it is configured."""
        provider = get_provider("moosyl")
        self.assertFalse(provider.is_mock)
        self.assertEqual(provider.mode, MODE_UNCONFIGURED)
        self.assertFalse(provider.may_settle)
        self.assertTrue(provider.missing_config())
        with self.assertRaises(ProviderNotConfigured):
            provider.parse_webhook(body=b"{}", headers={})


    def test_no_live_provider_is_active_and_activation_is_denied(self):
        readiness = provider_readiness()
        self.assertFalse(readiness["any_live_provider"])
        self.assertFalse(readiness["live_mode_enabled"])
        for row in readiness["providers"]:
            self.assertFalse(row["live_activation_allowed"])
            self.assertFalse(row["activation_allowed"])
            self.assertTrue(row["reason_not_active"])
        self.assertTrue(readiness["read_only"])

    def test_unknown_provider_is_rejected(self):
        with self.assertRaises(KeyError):
            get_provider("paypal")


class MockProviderBehaviourTests(TestCase):
    def test_mock_results_are_never_verified_or_settled(self):
        # Moosyl is skipped: it is the real adapter (see
        # ProviderRegistryTests.test_moosyl_is_the_real_adapter_and_is_inert_without_credentials),
        # so it correctly refuses to create a collection with no credentials rather than
        # returning a mock result.
        for code in PROVIDER_CODES:
            if code == "moosyl":
                continue
            provider = get_provider(code)
            result = provider.create_collection(amount="1000", reference=f"ref-{code}")
            self.assertFalse(result.verified)
            self.assertEqual(result.mode, MODE_MOCK)
            self.assertTrue(result.is_mock)
            self.assertFalse(result.is_settled)
            self.assertEqual(result.status, "pending")
            self.assertTrue(result.payload["mock"])

    def test_mock_references_are_prefixed_and_unique(self):
        provider = get_provider("bankily")
        first = provider.create_payout(amount="500").reference
        second = provider.create_payout(amount="500").reference
        self.assertTrue(first.startswith("MOCK-BANKILY-"))
        self.assertNotEqual(first, second)

    @override_settings(PAYMENTS_LIVE_MODE=True)
    def test_mock_adapters_refuse_to_run_in_live_mode(self):
        with self.assertRaises(ProviderLiveModeDisabled):
            get_provider("bankily")


class RealAdapterGuardTests(TestCase):
    @override_settings(PAYMENT_PROVIDER_MODE="live")
    def test_real_adapters_report_missing_configuration(self):
        readiness = provider_readiness()
        self.assertEqual(readiness["provider_mode"], MODE_LIVE)
        for row in readiness["providers"]:
            self.assertFalse(row["configured"])
            self.assertTrue(row["missing_config"])
            self.assertTrue(row["docs_required"])
            self.assertEqual(row["active_mode"], MODE_UNCONFIGURED)

    @override_settings(PAYMENT_PROVIDER_MODE="live")
    def test_real_adapters_refuse_money_movement_without_credentials(self):
        provider = get_provider("bankily")
        with self.assertRaises(ProviderNotConfigured):
            provider.create_payout(amount="1000", reference="wd-1")
        with self.assertRaises(ProviderNotConfigured):
            provider.create_collection(amount="1000")
        with self.assertRaises(ProviderNotConfigured):
            provider.parse_webhook(body=b"{}", headers={})

    @override_settings(
        PAYMENT_PROVIDER_MODE="live",
        PAYMENTS_LIVE_MODE=True,
        BANKILY_API_BASE_URL="https://example.invalid",
        BANKILY_MERCHANT_ID="m-1",
        BANKILY_API_KEY="k-1",
        BANKILY_WEBHOOK_SECRET="s-1",
    )
    def test_real_adapter_reports_live_mode_only_when_fully_configured(self):
        provider = get_provider("bankily")
        self.assertTrue(provider.is_configured())
        self.assertEqual(provider.mode, MODE_LIVE)
        # Still no invented endpoint: the adapter has no HTTP implementation, so a
        # money call is refused rather than faked.
        with self.assertRaises(ProviderNotConfigured):
            provider.create_collection(amount="100")


class CardDataProtectionTests(TestCase):
    def test_card_adapter_rejects_raw_card_data(self):
        provider = get_provider("card")
        with self.assertRaises(ValueError):
            provider.create_collection(
                amount="100",
                customer={"card_number": "4242424242424242", "cvv": "123"},
            )

    def test_card_adapter_accepts_a_provider_token(self):
        provider = get_provider("card")
        result = provider.create_collection(
            amount="100", customer={"token": "tok_mock_123"}
        )
        self.assertEqual(result.status, "pending")
        self.assertNotIn("card_number", result.payload)
