"""Phase 11 — payment provider abstraction (Bankily, Masravi, bank transfer, cards).

No provider API is invented: the real adapters refuse to run until official
credentials/documentation exist, and the mock adapters are explicitly labelled and
can never be mistaken for a live confirmation.

Key safety rules encoded here:

1. **Live mode is opt-in and default OFF** (`PAYMENTS_LIVE_MODE`). Mock adapters
   refuse to operate when live mode is on, and real adapters refuse to operate when
   credentials are missing or live mode is off.
2. **A mock result is never a verified result** (`verified=False`,
   `mode="mock"`), so it can never mark a payment as paid (see
   `payments.provider_security`).
3. **No card data**: card adapters only ever handle provider tokens; raw PAN/CVV
   are rejected by construction (there is no field for them).
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone as dt_timezone
from typing import Any

PROVIDER_CODES = ("bankily", "masravi", "sedad", "bank_transfer", "card")

MODE_MOCK = "mock"
MODE_LIVE = "live"
MODE_UNCONFIGURED = "unconfigured"


class ProviderError(Exception):
    """Base class for provider failures (never raised for user-input problems)."""

    code = "provider_error"


class ProviderNotConfigured(ProviderError):
    """The provider has no official credentials/endpoint configured yet."""

    code = "provider_not_configured"


class ProviderLiveModeDisabled(ProviderError):
    """A live provider call was attempted while `PAYMENTS_LIVE_MODE` is off."""

    code = "provider_live_mode_disabled"


class ProviderResponseUnverified(ProviderError):
    """A provider response could not be verified and must not be trusted."""

    code = "provider_response_unverified"


@dataclass(frozen=True)
class ProviderCapabilities:
    collections: bool = False
    payouts: bool = False
    webhooks: bool = False
    refunds: bool = False
    reconciliation: bool = False


@dataclass(frozen=True)
class ProviderResult:
    """Normalised provider response. ``verified`` gates every financial transition."""

    provider: str
    reference: str
    status: str  # created | pending | succeeded | failed | rejected
    verified: bool = False
    mode: str = MODE_UNCONFIGURED
    amount: str = ""
    currency: str = "MRU"
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""

    @property
    def is_mock(self) -> bool:
        return self.mode == MODE_MOCK

    @property
    def is_settled(self) -> bool:
        """Only a verified *live* success may settle money."""
        return self.status == "succeeded" and self.verified and self.mode == MODE_LIVE


@dataclass(frozen=True)
class WebhookVerification:
    provider: str
    verified: bool
    mode: str = MODE_UNCONFIGURED
    reason: str = ""
    event: dict[str, Any] = field(default_factory=dict)


def _now() -> str:
    return datetime.now(dt_timezone.utc).isoformat()


class PaymentProvider:
    """Interface every payment provider adapter implements."""

    code: str = ""
    display_name: str = ""
    capabilities = ProviderCapabilities()
    is_mock = False

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    # ── configuration ────────────────────────────────────────────────────────
    @property
    def mode(self) -> str:
        return MODE_UNCONFIGURED

    def required_config(self) -> tuple[str, ...]:
        return ()

    def missing_config(self) -> tuple[str, ...]:
        return tuple(key for key in self.required_config() if not self.config.get(key))

    def is_configured(self) -> bool:
        return not self.missing_config()

    # ── money movement (all refuse unless configured + authorized) ───────────
    def _guard(self) -> None:
        raise ProviderNotConfigured(
            f"{self.display_name or self.code} is not configured: missing "
            f"{', '.join(self.missing_config()) or 'official credentials'}"
        )

    def create_collection(
        self, *, amount, currency="MRU", reference="", customer=None
    ) -> ProviderResult:
        """Collect money from a customer (Bankily/Masravi/card/bank)."""
        self._guard()

    def verify_collection(self, *, reference: str) -> ProviderResult:
        """Server-side verification of a collection with the provider."""
        self._guard()

    def create_payout(
        self, *, amount, currency="MRU", reference="", destination=None
    ) -> ProviderResult:
        """Send money to a driver/courier (withdrawal)."""
        self._guard()

    def verify_payout(self, *, reference: str) -> ProviderResult:
        self._guard()

    def parse_webhook(self, *, body: bytes, headers: dict) -> WebhookVerification:
        self._guard()

    # ── reporting ───────────────────────────────────────────────────────────
    def readiness(self) -> dict:
        return {
            "code": self.code,
            "display_name": self.display_name or self.code,
            "mode": self.mode,
            "is_mock": self.is_mock,
            "configured": self.is_configured(),
            "missing_config": list(self.missing_config()),
            "required_config": list(self.required_config()),
            "capabilities": {
                "collections": self.capabilities.collections,
                "payouts": self.capabilities.payouts,
                "webhooks": self.capabilities.webhooks,
                "refunds": self.capabilities.refunds,
                "reconciliation": self.capabilities.reconciliation,
            },
            "live_activation_allowed": False,
        }


# ── shared helpers used by the mock adapters ─────────────────────────────────

def mock_reference(provider: str) -> str:
    """Unique mock reference that can never be mistaken for a real one."""
    return f"MOCK-{provider.upper()}-{uuid.uuid4().hex[:12]}"


def mock_webhook_signature(secret: str, body: bytes) -> str:
    """HMAC-SHA256 signature helper shared by mock webhook tests."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def now_iso() -> str:
    return _now()

