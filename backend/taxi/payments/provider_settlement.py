"""Settle a payment from an independently verified provider confirmation.

This is the only code path that may turn a card / mobile-money (Bankily, Masravi,
Sedad) / bank-transfer payment into ``paid`` and release the money it represents
(courier, merchant or wallet-top-up credit). Rules:

* Only a live, verified result is accepted (``assert_verified_confirmation``);
  mock/sandbox results, forged references and unverified responses never settle.
* The result must match the record: same provider family, same amount, our own
  reference (``transaction_id``).
* Idempotent: the record row is locked, a settled record is never settled twice,
  a provider reference can settle only one record (unique constraint), and each
  credit is linked to the record so it happens once.
* A verified ``failed``/``rejected`` result marks an unsettled record ``failed``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Payment, PaymentRecord
from .provider_security import assert_verified_confirmation
from .providers import MODE_LIVE, ProviderResponseUnverified

PROVIDER_METHODS = {
    "bankily": {"bankily"},
    "masravi": {"masrvi", "masravi"},
    "sedad": {"seddad", "sedad"},
    "card": {"card"},
    "bank_transfer": {"bank_account"},
}
UNSETTLED = {"pending", "authorized", "pending_verification"}
FAILED_STATUSES = {"failed", "rejected"}


class SettlementRefused(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class SettlementOutcome:
    settled: bool
    duplicate: bool = False
    status: str = ""
    record: object = None


def _find_record(reference):
    record = PaymentRecord.objects.select_for_update().filter(transaction_id=reference).first()
    if record is not None:
        return record
    return Payment.objects.select_for_update().filter(transaction_id=reference).first()


def _same_amount(record, result) -> bool:
    try:
        return Decimal(str(result.amount)) == Decimal(str(record.amount))
    except (InvalidOperation, TypeError, ValueError):
        return False


@transaction.atomic
def settle_verified_payment(provider_code: str, result) -> SettlementOutcome:
    if result is None or getattr(result, "mode", "") != MODE_LIVE or not getattr(result, "verified", False):
        raise ProviderResponseUnverified("Only a verified live provider result can settle a payment.")
    if getattr(result, "provider", "") != provider_code:
        raise SettlementRefused("Result comes from another provider.", "provider_mismatch")

    reference = str(getattr(result, "reference", "") or "")
    record = _find_record(reference) if reference else None
    if record is None:
        raise SettlementRefused("No payment matches this provider reference.", "unknown_reference")
    if record.method not in PROVIDER_METHODS.get(provider_code, set()):
        raise SettlementRefused("Payment method does not match the provider.", "provider_mismatch")
    if not _same_amount(record, result):
        raise SettlementRefused("Confirmed amount does not match the payment.", "amount_mismatch")

    if record.status == "paid":
        return SettlementOutcome(settled=False, duplicate=True, status=record.status, record=record)
    if record.status not in UNSETTLED:
        raise SettlementRefused(f"A {record.status} payment cannot be settled.", "not_settleable")

    if result.status in FAILED_STATUSES:
        record.status = "failed"
        record.save(update_fields=["status"])
        _sync_failure(record)
        return SettlementOutcome(settled=False, status="failed", record=record)

    assert_verified_confirmation(result)
    provider_reference = str((result.payload or {}).get("provider_reference") or reference)[:120]
    record.status = "paid"
    record.provider_reference = provider_reference
    record.provider_verified_at = timezone.now()
    try:
        with transaction.atomic():
            record.save(update_fields=["status", "provider_reference", "provider_verified_at"])
    except IntegrityError as exc:
        raise SettlementRefused("This provider reference already settled another payment.", "duplicate_reference") from exc

    if isinstance(record, PaymentRecord):
        _release_funds(record)
    return SettlementOutcome(settled=True, status="paid", record=record)


def _sync_failure(record):
    if not isinstance(record, PaymentRecord):
        return
    target = record.delivery if record.source == "delivery" else record.merchant_order
    if target is not None and getattr(target, "payment_status", "") != "paid":
        target.payment_status = "failed"
        target.save(update_fields=["payment_status"])


def _release_funds(record: PaymentRecord) -> None:
    from .settlement_service import _quantize
    from .wallet_ledger import apply_wallet_transaction, get_or_create_wallet

    if record.wallet_transaction_id:
        return
    wallet_tx = None
    if record.source == "wallet_top_up" and record.customer_id:
        wallet_tx = apply_wallet_transaction(
            get_or_create_wallet(record.customer), _quantize(record.amount), True,
            "top_up", reference=f"payment_record:{record.id}", note="Verified wallet top-up",
        )
    elif record.source == "delivery" and record.delivery_id:
        delivery = record.delivery
        delivery.payment_status = "paid"
        delivery.save(update_fields=["payment_status"])
        courier = record.courier or delivery.driver
        if courier and _quantize(record.courier_earning) > 0:
            wallet_tx = apply_wallet_transaction(
                get_or_create_wallet(courier), _quantize(record.courier_earning), True,
                "courier_earning", reference=f"delivery:{delivery.id}", note="Delivery earning",
            )
    elif record.source == "merchant_order" and record.merchant_order_id:
        order = record.merchant_order
        order.payment_status = "paid"
        order.save(update_fields=["payment_status"])
        if _quantize(record.merchant_earning) > 0:
            wallet_tx = apply_wallet_transaction(
                get_or_create_wallet(order.merchant.owner), _quantize(record.merchant_earning), True,
                "merchant_earning", reference=f"merchant_order:{order.id}", note="Merchant order earning",
            )
    if wallet_tx is not None:
        record.wallet_transaction = wallet_tx
        record.save(update_fields=["wallet_transaction"])
