"""Provider registry — resolves the active adapter per provider and reports readiness.

Resolution rules:

* ``PAYMENT_PROVIDER_MODE`` (default ``"mock"``) selects mock vs real adapters.
* Real adapters are always returned in **unconfigured** mode until their official
  credentials exist *and* `PAYMENTS_LIVE_MODE` is explicitly enabled.
* `provider_readiness()` is the CEO-facing truth: what is configured, what is
  missing, what is mock, and what must happen before activation.
"""

from __future__ import annotations

from django.conf import settings

from .base import MODE_LIVE, MODE_MOCK, PROVIDER_CODES, PaymentProvider
from .mock import (
    MockBankTransferProvider,
    MockBankilyProvider,
    MockCardProvider,
    MockMasraviProvider,
    MockSedadProvider,
)
from .unconfigured import (
    BankTransferProvider,
    BankilyProvider,
    CardGatewayProvider,
    MasraviProvider,
    SedadProvider,
)

MOCK_ADAPTERS = {
    "bankily": MockBankilyProvider,
    "masravi": MockMasraviProvider,
    "sedad": MockSedadProvider,
    "bank_transfer": MockBankTransferProvider,
    "card": MockCardProvider,
}

REAL_ADAPTERS = {
    "bankily": BankilyProvider,
    "masravi": MasraviProvider,
    "sedad": SedadProvider,
    "bank_transfer": BankTransferProvider,
    "card": CardGatewayProvider,
}

PROVIDER_LABELS = {
    "bankily": "Bankily",
    "masravi": "Masravi",
    "sedad": "Sedad (Seddad)",
    "bank_transfer": "Bank transfer",
    "card": "Card (Visa/Mastercard)",
}


def provider_mode() -> str:
    """'mock' (default) or 'live' — never inferred from client input."""
    mode = str(getattr(settings, "PAYMENT_PROVIDER_MODE", MODE_MOCK) or MODE_MOCK).lower()
    return MODE_LIVE if mode == MODE_LIVE else MODE_MOCK


def live_mode_enabled() -> bool:
    return bool(getattr(settings, "PAYMENTS_LIVE_MODE", False))


def provider_config(code: str) -> dict:
    """Collect the provider's configuration from Django settings (never hardcoded)."""
    prefix = code.upper()
    config = {}
    for key in (
        f"{prefix}_API_BASE_URL",
        f"{prefix}_MERCHANT_ID",
        f"{prefix}_API_KEY",
        f"{prefix}_WEBHOOK_SECRET",
        f"{prefix}_CLIENT_ID",
        f"{prefix}_CLIENT_SECRET",
        f"{prefix}_ACCOUNT_REFERENCE",
        f"{prefix}_PUBLIC_KEY",
        f"{prefix}_SECRET_KEY",
    ):
        value = getattr(settings, key, "") or ""
        if value:
            config[key] = value
    return config


def get_provider(code: str) -> PaymentProvider:
    """Resolve the adapter for ``code`` (mock by default, real when configured)."""
    normalized = str(code or "").strip().lower()
    if normalized not in PROVIDER_CODES:
        raise KeyError(f"Unknown payment provider: {code}")
    if provider_mode() == MODE_LIVE:
        return REAL_ADAPTERS[normalized](provider_config(normalized))
    return MOCK_ADAPTERS[normalized](provider_config(normalized))


def provider_readiness() -> dict:
    """Read-only readiness report for every provider (CEO-facing)."""
    providers = []
    for code in PROVIDER_CODES:
        adapter = get_provider(code)
        payload = adapter.readiness()
        payload["label"] = PROVIDER_LABELS.get(code, code)
        payload["active_mode"] = adapter.mode
        payload["activation_allowed"] = False
        payload["reason_not_active"] = (
            "mock adapter active (development/testing)"
            if adapter.is_mock
            else (
                "live mode disabled by configuration"
                if not live_mode_enabled()
                else f"missing configuration: {', '.join(adapter.missing_config()) or 'none'}"
            )
        )
        providers.append(payload)

    return {
        "provider_mode": provider_mode(),
        "live_mode_enabled": live_mode_enabled(),
        "any_live_provider": any(row["active_mode"] == MODE_LIVE for row in providers),
        "providers": providers,
        "activation_policy": (
            "Live provider traffic requires: official documentation, approved "
            "credentials, owner authorization (PAYMENTS_LIVE_MODE), a passed sandbox "
            "end-to-end test, and confirmed regulatory authorization."
        ),
        "read_only": True,
    }
