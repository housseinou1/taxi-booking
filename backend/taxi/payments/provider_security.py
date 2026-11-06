"""Phase 11 — payment security controls.

The single place where a payment's financial state may change. It encodes the
non-negotiable rules:

* **A payment is never marked successful without a verified provider
  confirmation.** `apply_verified_confirmation()` raises
  `ProviderResponseUnverified` for anything that is not a live, verified success —
  including every mock/sandbox response.
* **Webhooks must be authenticated.** `verify_webhook()` requires a configured
  provider secret and a matching HMAC signature; with no secret it refuses
  (fail-closed) rather than trusting the payload.
* **Duplicate payments are prevented.** `resolve_idempotency_key()` derives a
  stable key so the same intent can never create two money movements, and
  `is_duplicate_collection()` detects an existing settled record.
* **No raw card data** ever enters this layer: only provider tokens/references.
"""

from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone

from .providers import (
    MODE_LIVE,
    ProviderResponseUnverified,
    WebhookVerification,
    get_provider,
)

SIGNATURE_HEADER = "X-Yala-Signature"
REFERENCE_PREFIX = "YALA"


class WebhookRejected(Exception):
    """Raised when a webhook cannot be authenticated."""

    code = "webhook_rejected"

    def __init__(self, reason: str, status_code: int = 403):
        super().__init__(reason)
        self.reason = reason
        self.status_code = status_code


def compute_signature(secret: str, body: bytes) -> str:
    """HMAC-SHA256 hex digest of the raw request body."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify_webhook(provider_code: str, body: bytes, headers: dict) -> WebhookVerification:
    """Authenticate a provider webhook (fail-closed).

    Raises :class:`WebhookRejected` when the provider has no configured secret or
    the signature does not match — the payload is never trusted on its own.
    """
    provider = get_provider(provider_code)
    secret = provider.config.get(f"{provider.code.upper()}_WEBHOOK_SECRET", "")
    if not secret:
        raise WebhookRejected(
            f"{provider.display_name or provider.code} webhook secret is not "
            "configured; webhooks cannot be trusted."
        )

    signature = _header(headers, SIGNATURE_HEADER)
    if not signature:
        raise WebhookRejected("Missing webhook signature.")

    expected = compute_signature(secret, body)
    if not hmac.compare_digest(str(signature), expected):
        raise WebhookRejected("Invalid webhook signature.")

    verification = provider.parse_webhook(body=body, headers=headers)
    if not verification.verified:
        raise WebhookRejected(verification.reason or "Webhook could not be verified.")
    return verification


def _header(headers, name: str) -> str:
    if headers is None:
        return ""
    try:
        return str(headers.get(name, "") or "")
    except AttributeError:  # pragma: no cover - defensive
        return ""


def assert_verified_confirmation(result) -> None:
    """Refuse anything that is not a verified live success."""
    if result is None:
        raise ProviderResponseUnverified("No provider response supplied.")
    if getattr(result, "mode", "") != MODE_LIVE:
        raise ProviderResponseUnverified(
            "Sandbox/mock provider responses can never confirm a real payment."
        )
    if not getattr(result, "verified", False):
        raise ProviderResponseUnverified("The provider response is not verified.")
    if getattr(result, "status", "") != "succeeded":
        raise ProviderResponseUnverified(
            f"Provider status '{getattr(result, 'status', '')}' is not a success."
        )


def apply_verified_confirmation(record, result, *, paid_status="paid") -> bool:
    """Move a payment record to a settled state — only for verified live successes.

    Returns ``True`` when the record changed. Raises
    :class:`ProviderResponseUnverified` otherwise, so no caller can bypass the
    verification requirement.
    """
    assert_verified_confirmation(result)
    if getattr(record, "status", "") == paid_status:
        return False
    record.status = paid_status
    changed = ["status"]
    if getattr(result, "reference", "") and hasattr(record, "transaction_id"):
        record.transaction_id = result.reference
        changed.append("transaction_id")
    record.save(update_fields=changed)
    return True


# ── duplicate / idempotency protection ───────────────────────────────────────

def resolve_idempotency_key(*, scope: str, user_id, reference, amount) -> str:
    """Stable key for one payment intent (same intent ⇒ same key ⇒ one movement)."""
    raw = f"{REFERENCE_PREFIX}:{scope}:{user_id}:{reference}:{amount}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]


def is_duplicate_collection(
    *, scope: str, user_id, reference, amount, model, settled_statuses=("paid",)
) -> bool:
    """True when a settled record already exists for this exact intent."""
    if not any(field.name == "idempotency_key" for field in model._meta.fields):
        return False
    key = resolve_idempotency_key(
        scope=scope, user_id=user_id, reference=reference, amount=amount
    )
    return model.objects.filter(
        status__in=settled_statuses, idempotency_key=key
    ).exists()


def mark_duplicate_blocked(record, *, reason: str) -> None:
    """Record that a duplicate attempt was refused (audit-friendly, no money moved)."""
    if hasattr(record, "admin_note"):
        stamp = timezone.now().isoformat()
        record.admin_note = (
            f"{record.admin_note}\n[{stamp}] duplicate blocked: {reason}".strip()
        )
        record.save(update_fields=["admin_note"])


def suspicious_signals(*, amount, method, hour=None) -> list[str]:
    """Lightweight risk signals surfaced to the CEO oversight report.

    Amounts are compared with :class:`~decimal.Decimal`, never ``float``: a financial
    value must not pass through binary floating point, because a threshold comparison
    on a rounded binary value can mis-classify a high-value transaction.
    """
    signals: list[str] = []
    try:
        numeric = Decimal(str(amount if amount is not None else 0))
    except (InvalidOperation, TypeError, ValueError):
        return ["unparsable_amount"]
    if numeric >= Decimal("50000"):
        signals.append("high_value")
    if numeric == Decimal("0"):
        signals.append("zero_amount")
    if str(method or "").lower() in {"test", ""}:
        signals.append("non_production_method")
    if hour is not None and (hour < 5 or hour >= 23):
        signals.append("outside_business_hours")
    return signals


def card_data_violation(payload: Any) -> str | None:
    """Detect prohibited card credentials in an incoming payload (never stored)."""
    forbidden = {"pan", "card_number", "cvv", "cvc", "card_cvv", "pin", "card_pin"}
    if isinstance(payload, dict):
        hit = forbidden & {str(key).lower() for key in payload}
        if hit:
            return f"Prohibited card data received: {', '.join(sorted(hit))}"
    return None

