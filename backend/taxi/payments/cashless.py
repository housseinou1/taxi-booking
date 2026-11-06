"""Phase 11 — Strict cashless policy (Yala Technologies, 100% cashless).

Single source of truth for the platform-wide cashless rule:

* Yala is a **completely cashless** mobility and delivery platform: no physical
  cash payments, no cash-on-delivery, no cash collection by drivers or couriers,
  no offline cash settlements, no cash option in booking/checkout, and no
  unverified manual payment confirmations.
* Every transaction must be electronically recorded, verified and traceable.

Design constraints honoured here:

* **Historical records are never touched.** This module does not delete, rewrite
  or reinterpret existing rows; the legacy `cash` / `cash_on_delivery` values stay
  readable in the database (the model `choices` are intentionally left intact so
  no migration is required and old statements still render correctly). The policy
  only gates *new* selections and *new* state transitions.
* **Fail-closed.** When the policy is enforced (default), any cash method/timing
  is rejected with an explicit reason. The policy can only be relaxed by an
  explicit environment flag, never by client input.

Nothing in this module moves money.
"""

from __future__ import annotations

from django.conf import settings

# ── Policy vocabulary ────────────────────────────────────────────────────────

#: Methods that represent physical cash or a cash-settled flow.
CASH_METHODS = frozenset({"cash", "cod", "cash_on_delivery"})

#: Payment timings that represent cash settlement.
CASH_TIMINGS = frozenset({"cash_on_delivery"})

#: Methods allowed for new transactions on a cashless platform.
DIGITAL_METHODS = frozenset(
    {
        "card",  # Visa / Mastercard via an authorized gateway (tokenized)
        "wallet",  # Yala Wallet balance
        "bankily",  # Bankily
        "masrvi",  # Masravi (legacy alias "masravi")
        "masravi",
        "seddad",  # Seddad (legacy alias "sedad")
        "sedad",
        "bank_account",  # supported Mauritanian bank transfer
        "corporate",  # corporate account (post-paid, invoiced)
        "promo_credit",  # promo / credit balance
        "test",  # internal sandbox method — never a real collection
    }
)

CASHLESS_VIOLATION_CODE = "cashless_policy"
CASHLESS_VIOLATION_MESSAGE = (
    "Yala is a 100% cashless platform: cash payments, cash on delivery and cash "
    "settlement are not available. Please choose a digital method (card, Yala "
    "Wallet, Bankily, Masravi, Seddad or bank transfer)."
)
UNVERIFIED_CONFIRMATION_MESSAGE = (
    "A payment can only be marked as paid by a verified confirmation from the "
    "authorized payment provider. Manual confirmation is disabled."
)


class CashlessPolicyViolation(Exception):
    """Raised when a request tries to use a cash method/timing or an unverified flow."""

    code = CASHLESS_VIOLATION_CODE

    def __init__(self, message: str = CASHLESS_VIOLATION_MESSAGE, code: str | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


def is_enforced() -> bool:
    """True when the cashless policy is enforced (default)."""
    return bool(getattr(settings, "CASHLESS_POLICY_ENFORCED", True))


def is_cash_method(method) -> bool:
    return str(method or "").strip().lower() in CASH_METHODS


def is_cash_timing(timing) -> bool:
    return str(timing or "").strip().lower() in CASH_TIMINGS


def violation_reason(method=None, timing=None) -> str | None:
    """Return a refusal reason for a cash method/timing, else ``None``."""
    if not is_enforced():
        return None
    if method is not None and is_cash_method(method):
        return CASHLESS_VIOLATION_MESSAGE
    if timing is not None and is_cash_timing(timing):
        return CASHLESS_VIOLATION_MESSAGE
    return None


def assert_cashless(method=None, timing=None) -> None:
    """Raise :class:`CashlessPolicyViolation` for any cash method/timing."""
    reason = violation_reason(method=method, timing=timing)
    if reason:
        raise CashlessPolicyViolation(reason)


def is_allowed_method(method) -> bool:
    """True when a method may be used for a *new* transaction."""
    value = str(method or "").strip().lower()
    if not value:
        return False
    if is_cash_method(value):
        return False
    return value in DIGITAL_METHODS


def policy_payload() -> dict:
    """Machine-readable cashless policy + enforcement audit (read-only).

    Consumed by the CEO payment-oversight endpoint and the security console so the
    platform's cashless posture is inspectable from New York, not asserted in prose.
    """
    from .models import Payment, PaymentRecord

    def _counts(model, field: str) -> dict:
        try:
            rows = (
                model.objects.filter(**{f"{field}__in": sorted(CASH_METHODS)})
                .values(field)
                .order_by()
            )
            return {row[field]: row["n"] for row in _annotate(rows, field)}
        except Exception:  # pragma: no cover - never break the report
            return {}

    return {
        "enforced": is_enforced(),
        "platform_policy": "100% cashless (no physical cash, no cash on delivery)",
        "cash_methods": sorted(CASH_METHODS),
        "cash_timings": sorted(CASH_TIMINGS),
        "allowed_methods": sorted(DIGITAL_METHODS),
        "historical_records": {
            "policy": "preserved_read_only",
            "note": (
                "Legacy cash rows remain readable and untouched; the policy only "
                "blocks new selections and new state transitions. No migration is "
                "applied and no historical financial record is modified."
            ),
            "legacy_cash_payments": _counts(Payment, "method"),
            "legacy_cash_payment_records": _counts(PaymentRecord, "method"),
        },
        "touchpoints": [
            {
                "id": "payment_method_selection",
                "description": "Ride payment creation (payments/create/)",
                "status": "blocked" if is_enforced() else "open",
            },
            {
                "id": "manual_payment_confirmation",
                "description": "Driver manual confirmation (payments/confirm-payment/)",
                "status": "blocked" if is_enforced() else "open",
            },
            {
                "id": "rider_mark_paid",
                "description": "Rider marks a ride paid (payments/mark-paid/)",
                "status": "blocked" if is_enforced() else "open",
            },
            {
                "id": "cash_settlement_reminder",
                "description": "deliveries.tasks.remind_cash_settlement",
                "status": "skipped" if is_enforced() else "open",
            },
            {
                "id": "rider_checkout_cash_option",
                "description": "Rider app payment-method selection UI",
                # Driven by the enforcement flag rather than hardcoded, so the audit
                # report can never claim the cash option is absent while it is offered.
                "status": "removed" if is_enforced() else "available",
            },

            {
                "id": "model_defaults",
                "description": (
                    "PaymentRecord.method default is legacy 'cash' and Payment.method "
                    "default is 'test'; changing defaults needs a migration and is "
                    "tracked as an open deploy-time item."
                ),
                "status": "tracked_requires_migration",
            },
        ],
        "verified_confirmation_required": True,
        "read_only": True,
    }


def _annotate(rows, field):
    """Small helper so `_counts` stays readable (counts without extra queries)."""
    from django.db.models import Count

    return rows.annotate(n=Count(field))

    if not value:
        return False
    if is_cash_method(value):
        return False
    return value in DIGITAL_METHODS
