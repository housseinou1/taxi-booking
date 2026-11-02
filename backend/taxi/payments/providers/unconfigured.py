"""Unconfigured (real) provider adapters — the production integration surface.

These are the adapters that will talk to Bankily, Masravi, Mauritanian banks and an
authorized card gateway **once official credentials and documentation exist**. They
deliberately implement no HTTP calls and no invented endpoints: every money method
raises :class:`ProviderNotConfigured` listing exactly which configuration is
missing, and every adapter refuses to run while `PAYMENTS_LIVE_MODE` is off.

Documentation requirements per provider are declared in `docs_required` so the
activation checklist is explicit and reviewable (see
`.agents/tasks/phase11-provider-requirements.md`).
"""

from __future__ import annotations

from .base import (
    MODE_LIVE,
    MODE_UNCONFIGURED,
    PaymentProvider,
    ProviderCapabilities,
    ProviderLiveModeDisabled,
)


def _live_mode_enabled() -> bool:
    from django.conf import settings

    return bool(getattr(settings, "PAYMENTS_LIVE_MODE", False))


class UnconfiguredProvider(PaymentProvider):
    """Base class for real adapters that are not yet authorized/configured."""

    is_mock = False
    docs_required: tuple[str, ...] = ()

    def __init__(self, config=None):
        super().__init__(config)
        self._live = _live_mode_enabled()

    @property
    def mode(self) -> str:
        return MODE_LIVE if (self._live and self.is_configured()) else MODE_UNCONFIGURED

    def required_config(self) -> tuple[str, ...]:
        return ()

    def readiness(self) -> dict:
        payload = super().readiness()
        payload.update(
            {
                "docs_required": list(self.docs_required),
                "live_mode_enabled": self._live,
                "activation_requirements": [
                    "official provider documentation received",
                    "approved production credentials provisioned (env/secret manager)",
                    "PAYMENTS_LIVE_MODE explicitly enabled by the owner",
                    "sandbox end-to-end test completed and signed off",
                    "webhook secret configured and signature verification tested",
                    "regulatory authorization confirmed for the payment service",
                ],
            }
        )
        return payload


class BankilyProvider(UnconfiguredProvider):
    code = "bankily"
    display_name = "Bankily"
    capabilities = ProviderCapabilities(
        collections=True, payouts=True, webhooks=True, refunds=True, reconciliation=True
    )
    docs_required = (
        "Bankily merchant/collection API reference (endpoints, auth, statuses)",
        "Bankily disbursement (B2C) API reference for driver/courier payouts",
        "Bankily sandbox base URL + test credentials",
        "Bankily webhook event catalogue + signature scheme",
        "Bankily transaction verification/reconciliation file or endpoint spec",
    )

    def required_config(self) -> tuple[str, ...]:
        return (
            "BANKILY_API_BASE_URL",
            "BANKILY_MERCHANT_ID",
            "BANKILY_API_KEY",
            "BANKILY_WEBHOOK_SECRET",
        )


class MasraviProvider(UnconfiguredProvider):
    code = "masravi"
    display_name = "Masravi"
    capabilities = ProviderCapabilities(
        collections=True, payouts=True, webhooks=True, refunds=True, reconciliation=True
    )
    docs_required = (
        "Masravi merchant/collection API reference",
        "Masravi disbursement API reference for driver/courier payouts",
        "Masravi sandbox base URL + test credentials",
        "Masravi webhook catalogue + signature scheme",
        "Masravi settlement/reconciliation report specification",
    )

    def required_config(self) -> tuple[str, ...]:
        return (
            "MASRAVI_API_BASE_URL",
            "MASRAVI_MERCHANT_ID",
            "MASRAVI_API_KEY",
            "MASRAVI_WEBHOOK_SECRET",
        )


class SedadProvider(UnconfiguredProvider):
    """Sedad (Seddad) — unconfigured real adapter.

    Verified integration route (Stage 2 research, 2026-10-25): Sedad is a Mauritanian
    payment service reachable for merchants through **authorized aggregators** that
    expose it alongside Bankily/Masravi (e.g. Moosyl, KitPay). No public direct Sedad
    merchant/developer API documentation was found, so no endpoint is assumed here.

    ``payouts`` is deliberately **False**: no B2C disbursement capability for Sedad has
    been verified. Collections/refunds/webhooks/reconciliation are declared because the
    aggregator route exposes them, but every one of them stays inert until official
    documentation and credentials exist and live mode is enabled by the owner.
    """

    code = "sedad"
    display_name = "Sedad"
    capabilities = ProviderCapabilities(
        collections=True, payouts=False, webhooks=True, refunds=True, reconciliation=True
    )
    docs_required = (
        "confirmation of the authorized aggregator/PSP that provides Sedad collections",
        "Sedad collection API reference via that provider (endpoints, auth, statuses)",
        "Sedad sandbox/test credentials and test payer numbers",
        "Sedad webhook event catalogue + signature scheme (raw-body HMAC)",
        "Sedad settlement/reconciliation report specification",
        "explicit confirmation (or refusal) of Sedad B2C disbursement support",
    )

    def required_config(self) -> tuple[str, ...]:
        return (
            "SEDAD_API_BASE_URL",
            "SEDAD_MERCHANT_ID",
            "SEDAD_API_KEY",
            "SEDAD_WEBHOOK_SECRET",
        )


class BankTransferProvider(UnconfiguredProvider):
    code = "bank_transfer"
    display_name = "Bank transfer (Mauritanian banks)"
    capabilities = ProviderCapabilities(
        collections=True, payouts=True, webhooks=False, refunds=True, reconciliation=True
    )
    docs_required = (
        "list of supported Mauritanian banks + account/IBAN formats",
        "bank API or file-based transfer interface specification",
        "secure transaction reference format required by each bank",
        "statement/reconciliation file format for payment verification",
        "cut-off times and settlement windows per bank",
    )

    def required_config(self) -> tuple[str, ...]:
        return (
            "BANK_TRANSFER_API_BASE_URL",
            "BANK_TRANSFER_CLIENT_ID",
            "BANK_TRANSFER_CLIENT_SECRET",
            "BANK_TRANSFER_ACCOUNT_REFERENCE",
        )


class CardGatewayProvider(UnconfiguredProvider):
    code = "card"
    display_name = "Card gateway (Visa / Mastercard)"
    capabilities = ProviderCapabilities(
        collections=True, payouts=False, webhooks=True, refunds=True, reconciliation=True
    )
    docs_required = (
        "PCI-DSS compliant gateway onboarding confirmation",
        "server-side payment intent / tokenization API reference",
        "3-D Secure / SCA authentication flow specification",
        "webhook catalogue + signature verification scheme",
        "refund and dispute (chargeback) API reference",
        "test/sandbox keys and card test matrix",
    )

    def required_config(self) -> tuple[str, ...]:
        return (
            "CARD_GATEWAY_API_BASE_URL",
            "CARD_GATEWAY_PUBLIC_KEY",
            "CARD_GATEWAY_SECRET_KEY",
            "CARD_GATEWAY_WEBHOOK_SECRET",
        )
