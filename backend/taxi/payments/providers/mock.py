"""Mock payment adapters (development/testing only).

Every class here is explicitly a **mock**: `is_mock = True`, `mode = "mock"`,
references prefixed `MOCK-`, and `verified=False` on every result. A mock result
can therefore never settle a payment (see `payments.provider_security`), and the
adapters refuse to run at all when `PAYMENTS_LIVE_MODE` is on — so a mock can never
leak into a live financial flow.
"""

from __future__ import annotations

import json

from .base import (
    MODE_MOCK,
    PaymentProvider,
    ProviderCapabilities,
    ProviderLiveModeDisabled,
    ProviderResult,
    WebhookVerification,
    mock_reference,
    mock_webhook_signature,
    now_iso,
)


def _live_mode_enabled() -> bool:
    from django.conf import settings

    return bool(getattr(settings, "PAYMENTS_LIVE_MODE", False))


class MockProviderBase(PaymentProvider):
    """Shared mock behaviour: deterministic shapes, never verified, never live."""

    is_mock = True
    capabilities = ProviderCapabilities(
        collections=True,
        payouts=True,
        webhooks=True,
        refunds=True,
        reconciliation=True,
    )

    def __init__(self, config=None):
        super().__init__(config)
        if _live_mode_enabled():  # pragma: no cover - guarded by settings default
            raise ProviderLiveModeDisabled(
                "Mock providers cannot run while PAYMENTS_LIVE_MODE is enabled."
            )

    @property
    def mode(self) -> str:
        return MODE_MOCK

    def required_config(self) -> tuple[str, ...]:
        # Mock adapters need a shared webhook secret so signature handling is
        # exercised exactly like a real provider would be.
        return (f"{self.code.upper()}_WEBHOOK_SECRET",)

    def _result(self, *, reference: str, status: str, amount="", currency="MRU", **extra):
        return ProviderResult(
            provider=self.code,
            reference=reference,
            status=status,
            verified=False,
            mode=MODE_MOCK,
            amount=str(amount or ""),
            currency=currency,
            payload={"mock": True, "sandbox": True, **extra},
            created_at=now_iso(),
        )

    def create_collection(self, *, amount, currency="MRU", reference="", customer=None):
        return self._result(
            reference=reference or mock_reference(self.code),
            status="pending",
            amount=amount,
            currency=currency,
            intent="collection",
        )

    def verify_collection(self, *, reference: str):
        return self._result(reference=reference, status="pending", intent="collection")

    def create_payout(self, *, amount, currency="MRU", reference="", destination=None):
        return self._result(
            reference=reference or mock_reference(self.code),
            status="pending",
            amount=amount,
            currency=currency,
            intent="payout",
        )

    def verify_payout(self, *, reference: str):
        return self._result(reference=reference, status="pending", intent="payout")

    def parse_webhook(self, *, body: bytes, headers: dict):
        secret = self.config.get(f"{self.code.upper()}_WEBHOOK_SECRET", "")
        signature = (headers or {}).get("X-Yala-Signature", "")
        expected = mock_webhook_signature(secret, body)
        from hmac import compare_digest

        if not signature or not compare_digest(str(signature), expected):
            return WebhookVerification(
                provider=self.code,
                verified=False,
                mode=MODE_MOCK,
                reason="invalid_signature",
            )
        try:
            event = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return WebhookVerification(
                provider=self.code,
                verified=False,
                mode=MODE_MOCK,
                reason="invalid_payload",
            )
        return WebhookVerification(
            provider=self.code,
            verified=True,
            mode=MODE_MOCK,
            reason="mock_signature_valid",
            event=event,
        )


class MockBankilyProvider(MockProviderBase):
    code = "bankily"
    display_name = "Bankily (mock)"


class MockMasraviProvider(MockProviderBase):
    code = "masravi"
    display_name = "Masravi (mock)"


class MockSedadProvider(MockProviderBase):
    """Sedad (Seddad) mock adapter — sandbox/testing only, never a live confirmation.

    Capabilities mirror the **real** Sedad adapter, because `provider_readiness()` is the
    CEO-facing truth and must not advertise a capability the provider cannot deliver:
    Sedad has no verified B2C disbursement capability, so `payouts=False` here too.
    """

    code = "sedad"
    display_name = "Sedad (mock)"
    capabilities = ProviderCapabilities(
        collections=True, payouts=False, webhooks=True, refunds=True, reconciliation=True
    )


class MockBankTransferProvider(MockProviderBase):
    code = "bank_transfer"
    display_name = "Bank transfer (mock)"


class MockCardProvider(MockProviderBase):
    code = "card"
    display_name = "Card gateway (mock)"

    def create_collection(self, *, amount, currency="MRU", reference="", customer=None):
        """Tokenised-only: reject anything resembling raw card data."""
        if isinstance(customer, dict):
            forbidden = {"pan", "card_number", "cvv", "cvc", "expiry", "pin"}
            if forbidden & {str(key).lower() for key in customer}:
                raise ValueError(
                    "Raw card data is prohibited: pass a provider token instead."
                )
        return super().create_collection(
            amount=amount, currency=currency, reference=reference, customer=customer
        )
