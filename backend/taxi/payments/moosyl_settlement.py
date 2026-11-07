"""Moosyl settlement — turn a verified webhook into exactly one money movement.

THE RULES THIS MODULE ENFORCES
------------------------------
1. **Nothing settles without a verified signature.** This module is only ever called
   after ``payments.provider_security.verify_webhook`` has authenticated the raw body
   with the webhook secret, and it re-checks ``verification.verified`` anyway.
2. **Only ``completed`` is paid.** ``payment-created`` also arrives for ``pending`` and
   ``failed`` payments, so the status — not the event name — decides.
3. **Idempotent by delivery id.** Moosyl retries up to 7 times reusing
   ``x-webhook-delivery-id``; the unique ``ProviderWebhookEvent.delivery_id`` makes a
   replay a no-op. Settlement itself is additionally guarded by a row lock plus a
   ``status == "paid"`` check inside one transaction.
4. **The amount must match what we asked for.** The provider's amount is compared with
   the expected amount for that trip/delivery, as ``Decimal``. A mismatch is rejected —
   it never silently settles at the provider's figure.
5. **Currency must be MRU.**
6. **Moosyl never pays the driver.** Money is settled to Yala's own IBAN (Moosyl charges
   1%); driver earnings are computed here and paid out through Yala's own withdrawal
   flow. Moosyl's 1% fee is a platform cost and is never deducted from the driver.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.utils import timezone

from app_settings.pricing_service import get_ride_commission_percent

from .models import Payment, ProviderWebhookEvent
from .services import calculate_payment_amounts

logger = logging.getLogger("yala.payments.moosyl")

# Yala's own transactionId convention. It has to be human-readable because the same
# string is what an operator sees in the Moosyl dashboard when reconciling a payment.
TRANSACTION_PREFIX = "YALA"
SCOPE_RIDE = "RIDE"
SCOPE_DELIVERY = "DELIVERY"
SUPPORTED_SCOPES = (SCOPE_RIDE, SCOPE_DELIVERY)

# Only a completed payment is money in the bank (docs.moosyl.com).
PAID_PROVIDER_STATUS = "completed"
CURRENCY_MRU = "MRU"

# Outcomes recorded on ProviderWebhookEvent.outcome.
OUTCOME_SETTLED = "settled"
OUTCOME_DUPLICATE = "duplicate"
OUTCOME_IGNORED = "ignored"
OUTCOME_REJECTED = "rejected"
OUTCOME_ERROR = "error"

# Written when the delivery row is first inserted, BEFORE settlement commits. It is a
# deliberate "not yet answered" marker: a row left in this state must never block a retry,
# because the unique delivery_id would otherwise refuse every redelivery from Moosyl and
# leave the payment pending forever.
OUTCOME_PENDING = "processing"

# Outcomes after which a redelivery genuinely changes nothing.
TERMINAL_OUTCOMES = (
    OUTCOME_SETTLED,
    OUTCOME_DUPLICATE,
    OUTCOME_IGNORED,
    OUTCOME_REJECTED,
)


def build_transaction_id(scope: str, object_id) -> str:
    """``YALA-RIDE-1043`` / ``YALA-DELIVERY-88`` — unique per Moosyl environment."""
    return f"{TRANSACTION_PREFIX}-{str(scope).upper()}-{int(object_id)}"


def parse_transaction_id(transaction_id) -> tuple[str, int] | None:
    """Parse Yala's transactionId back into ``(scope, object_id)``.

    Returns ``None`` for anything that is not one of our own, precisely formatted ids,
    so a webhook can never be pointed at an arbitrary table row.
    """
    raw = str(transaction_id or "").strip()
    parts = raw.split("-")
    if len(parts) != 3 or parts[0] != TRANSACTION_PREFIX:
        return None
    scope = parts[1].upper()
    if scope not in SUPPORTED_SCOPES:
        return None
    try:
        object_id = int(parts[2])
    except (TypeError, ValueError):
        return None
    if object_id <= 0:
        return None
    return scope, object_id


def payload_fingerprint(raw_body: bytes) -> str:
    """SHA-256 of the raw body — proves what was actually signed."""
    return hashlib.sha256(raw_body or b"").hexdigest()


def _decimal_or_none(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@dataclass
class SettlementResult:
    """What happened to one webhook delivery."""

    outcome: str
    detail: str = ""
    settled: bool = False
    payment: Payment | None = None
    event_record: ProviderWebhookEvent | None = None

    @property
    def http_status(self) -> int:
        """HTTP status to answer the provider with.

        A *rejection* is answered 2xx on purpose: the payload is authentic and Moosyl's
        retry policy is what decides redelivery. Returning 4xx for a business rejection
        (unknown order, amount mismatch) would make Moosyl retry something that can
        never succeed, and its documented behaviour is that any non-408/429/5xx 4xx
        fails the delivery immediately. The event is always recorded, so nothing is lost.
        """
        return 200


def _record_event(
    *,
    provider,
    verification,
    delivery_id: str,
    raw_body: bytes,
    data: dict,
) -> tuple[ProviderWebhookEvent | None, bool]:
    """Record the delivery. Returns ``(record, created)``; ``created=False`` means replay."""
    try:
        # atomic(): the insert either commits whole or not at all, so a concurrent worker
        # can never observe a half-written row.
        with transaction.atomic():
            record, created = ProviderWebhookEvent.objects.get_or_create(
                delivery_id=delivery_id,
                defaults={
                    "provider": provider.code,
                    "event_type": str(verification.event.get("event") or ""),
                    "environment": verification.environment,
                    "payment_reference": str(data.get("id") or ""),
                    "transaction_id": str(data.get("transactionId") or ""),
                    "status": str(data.get("status") or ""),
                    "amount": _decimal_or_none(data.get("amount")),
                    "currency": str(data.get("currency") or CURRENCY_MRU),
                    "payload_sha256": payload_fingerprint(raw_body),
                    # Explicitly non-terminal. finish() upgrades this inside the settlement
                    # transaction, so 'processing' means "money has NOT moved yet".
                    "outcome": OUTCOME_PENDING,
                },
            )
    except IntegrityError:
        # Another worker inserted the same delivery id a moment ago: that is a replay.
        return ProviderWebhookEvent.objects.filter(delivery_id=delivery_id).first(), False
    return record, created


def apply_verified_moosyl_event(
    *,
    provider,
    verification,
    delivery_id: str,
    raw_body: bytes,
) -> SettlementResult:
    """Apply one signature-verified Moosyl webhook. Safe to call repeatedly."""
    if not verification or not getattr(verification, "verified", False):
        return SettlementResult(
            outcome=OUTCOME_REJECTED,
            detail="Unverified webhook reached the settlement layer.",
        )

    payload = verification.event or {}
    event_type = str(payload.get("event") or "")
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return SettlementResult(
            outcome=OUTCOME_REJECTED, detail="Webhook 'data' is not an object."
        )

    record, created = _record_event(
        provider=provider,
        verification=verification,
        delivery_id=delivery_id,
        raw_body=raw_body,
        data=data,
    )

    if not created:
        # A row already exists. Treat it as a true replay ONLY if the earlier attempt
        # reached a terminal outcome. A row still at OUTCOME_PENDING (or OUTCOME_ERROR)
        # means the previous attempt never committed its settlement, so this redelivery
        # MUST be allowed to finish the work. Returning 'duplicate' here is what left
        # payments stranded at 'pending' forever: the unique delivery_id would refuse all
        # of Moosyl's retries and no code path could ever settle the order.
        if record is not None and record.outcome in TERMINAL_OUTCOMES:
            return SettlementResult(
                outcome=OUTCOME_DUPLICATE,
                detail=f"Delivery {delivery_id} was already processed.",
                event_record=record,
            )
        logger.warning(
            "Moosyl redelivery %s resumes an unfinished settlement (outcome=%r).",
            delivery_id,
            getattr(record, "outcome", None),
        )

    def finish(result: SettlementResult) -> SettlementResult:
        result.event_record = record
        if record is not None:
            record.outcome = result.outcome
            record.detail = result.detail[:2000]
            record.payment = result.payment
            record.save(update_fields=["outcome", "detail", "payment"])
        return result

    # The event name alone never settles anything.
    if event_type not in ("payment-created", "payment-updated"):
        return finish(
            SettlementResult(
                outcome=OUTCOME_IGNORED,
                detail=f"Event {event_type!r} carries no payment; recorded only.",
            )
        )

    provider_status = str(data.get("status") or "")
    if provider_status != PAID_PROVIDER_STATUS:
        return finish(
            SettlementResult(
                outcome=OUTCOME_IGNORED,
                detail=(
                    f"Payment status is {provider_status!r}; only "
                    f"{PAID_PROVIDER_STATUS!r} means the money was received."
                ),
            )
        )

    # Money may only move for an adapter allowed to settle (production + live mode, or
    # sandbox with sandbox settlement explicitly enabled by the owner).
    if not getattr(provider, "may_settle", False):
        return finish(
            SettlementResult(
                outcome=OUTCOME_IGNORED,
                detail=(
                    f"Verified {provider_status} event recorded, but settlement is "
                    f"disabled for mode={getattr(provider, 'mode', '')!r}. "
                    "No financial state changed."
                ),
            )
        )

    transaction_id = str(data.get("transactionId") or "")
    parsed = parse_transaction_id(transaction_id)
    if not parsed:
        return finish(
            SettlementResult(
                outcome=OUTCOME_REJECTED,
                detail=(
                    f"transactionId {transaction_id!r} is not a Yala "
                    "YALA-<RIDE|DELIVERY>-<id> reference; refusing to guess an order."
                ),
            )
        )

    scope, object_id = parsed
    try:
        with transaction.atomic():
            if scope == SCOPE_RIDE:
                return finish(
                    _settle_ride(
                        provider=provider,
                        data=data,
                        transaction_id=transaction_id,
                        ride_id=object_id,
                        environment=verification.environment,
                    )
                )
            return finish(
                _settle_delivery(
                    provider=provider,
                    data=data,
                    transaction_id=transaction_id,
                    delivery_id=object_id,
                    environment=verification.environment,
                )
            )
    except Exception as exc:  # pragma: no cover - defensive; never 500 the provider
        logger.exception("Moosyl settlement failed for %s", transaction_id)
        return finish(
            SettlementResult(
                outcome=OUTCOME_ERROR,
                detail=f"Settlement error for {transaction_id}: {exc}"[:300],
            )
        )


def moosyl_fee(amount) -> Decimal:
    """Moosyl's 1% per successful payment.

    This is a PLATFORM COST, not a driver deduction: the provider withholds it before
    paying the balance to Yala's IBAN, so it is recorded for accounting but never
    subtracted from the driver's earning.

    Rounds HALF_UP to match ``calculate_ride_app_fee`` — money must round the same way
    everywhere in the payments app, and the default banker's rounding would turn
    1.205 MRU into 1.20 instead of 1.21.
    """
    from decimal import ROUND_HALF_UP

    from django.conf import settings

    percent = _decimal_or_none(getattr(settings, "MOOSYL_FEE_PERCENT", "1")) or Decimal("1")
    return (Decimal(amount) * percent / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def delivery_commission_policy() -> dict:
    """Delivery commission split — read from the platform's OWN delivery config.

    Delivery does NOT share the ride policy. The platform already models this per
    vertical in ``payments.settlement_service.get_commission_config("delivery")`` /
    ``CommissionConfig`` (courier_rate, platform_rate), and that is the single source of
    truth finance edits.

    FIXED DEFECT: this previously defaulted to ``get_ride_commission_policy()`` (30/70),
    which would have paid a courier 70% instead of the configured 80% - underpaying the
    courier by 10 points and over-crediting YALA. The ride policy is now only a
    last-resort fallback if the delivery config cannot be read.
    """
    from django.conf import settings

    raw = str(getattr(settings, "DELIVERY_PLATFORM_PERCENT", "") or "").strip()
    if raw:
        percent = _decimal_or_none(raw)
        if percent is not None:
            if percent > 1:
                percent = percent / Decimal("100")
            return {
                "platform_percent": percent,
                "driver_percent": Decimal("1") - percent,
                "config_id": None,
                "source": "DELIVERY_PLATFORM_PERCENT",
            }

    # The platform's own per-vertical delivery configuration (authoritative).
    try:
        from .settlement_service import get_commission_config

        cfg = get_commission_config("delivery")
        platform = Decimal(str(cfg.platform_rate))
        return {
            "platform_percent": platform,
            "driver_percent": Decimal(str(cfg.courier_rate)),
            "config_id": cfg.id,
            "source": "CommissionConfig:delivery",
        }
    except Exception:  # pragma: no cover - defensive; fall back to the ride policy
        from app_settings.pricing_service import get_ride_commission_policy

        policy = get_ride_commission_policy()
        return {
            "platform_percent": Decimal(policy["platform_percent"]),
            "driver_percent": Decimal(policy["driver_percent"]),
            "config_id": policy.get("config_id"),
            "source": "ride_policy_fallback",
        }



def _amount_problem(data: dict, expected: Decimal) -> str:
    """Validate amount + currency. Returns a rejection reason, or '' when acceptable."""
    currency = str(data.get("currency") or CURRENCY_MRU).upper()
    if currency != CURRENCY_MRU:
        return f"Currency {currency!r} is not {CURRENCY_MRU}."

    received = _decimal_or_none(data.get("amount"))
    if received is None:
        return f"Payment amount is missing or unparsable: {data.get('amount')!r}."
    if received != expected:
        return (
            f"Amount mismatch: provider says {received} MRU but the order expects "
            f"{expected} MRU. Refusing to settle at the provider's figure."
        )
    return ""


def _settle_ride(
    *, provider, data, transaction_id, ride_id, environment
) -> SettlementResult:
    """Apply a completed Moosyl payment to exactly one ride."""
    from taxi.rides.models import Ride

    ride = Ride.objects.select_for_update().filter(id=ride_id).first()
    if ride is None:
        return SettlementResult(
            outcome=OUTCOME_REJECTED, detail=f"No ride #{ride_id} exists."
        )

    payment = (
        Payment.objects.select_for_update()
        .filter(ride_id=ride.id)
        .order_by("-created_at")
        .first()
    )
    expected = Decimal(payment.amount) if payment is not None else Decimal(ride.fare or 0)

    problem = _amount_problem(data, expected)
    if problem:
        return SettlementResult(outcome=OUTCOME_REJECTED, detail=problem)

    if payment is not None and payment.status == "paid":
        # A different delivery can describe the same payment: never settle twice.
        return SettlementResult(
            outcome=OUTCOME_DUPLICATE,
            detail=f"Ride #{ride.id} was already paid (payment #{payment.id}); no change.",
            payment=payment,
        )

    if payment is None:
        charge, app_fee, tip_percent, tip_amount, driver_earning, discount = (
            calculate_payment_amounts(
                ride.fare, 0, 0, get_ride_commission_percent(ride)
            )
        )
        payment = Payment.objects.create(
            rider=ride.rider,
            ride_id=ride.id,
            amount=charge,
            discount_amount=discount,
            app_fee=app_fee,
            tip_percentage=tip_percent,
            tip_amount=tip_amount,
            driver_earning=driver_earning,
            method="moosyl",
            status="pending",
            currency=CURRENCY_MRU,
        )
    else:
        app_fee = payment.app_fee
        driver_earning = payment.driver_earning

    payment.status = "paid"
    payment.method = "moosyl"
    payment.currency = CURRENCY_MRU
    payment.transaction_id = str(data.get("id") or "") or payment.transaction_id
    payment.save(update_fields=["status", "method", "currency", "transaction_id"])

    ride.app_fee = app_fee
    ride.driver_earning = driver_earning
    ride.save(update_fields=["app_fee", "driver_earning"])

    fee = moosyl_fee(expected)
    return SettlementResult(
        outcome=OUTCOME_SETTLED,
        detail=(
            f"Ride #{ride.id} settled at {expected} MRU: platform commission "
            f"{app_fee} MRU, driver earning {driver_earning} MRU, Moosyl fee "
            f"{fee} MRU (platform cost, not deducted from the driver), net to Yala "
            f"IBAN {Decimal(expected) - fee} MRU. The driver is paid through Yala's own "
            "withdrawal flow — Moosyl never transfers to a driver."
        ),
        settled=True,
        payment=payment,
    )


def _settle_delivery(
    *, provider, data, transaction_id, delivery_id, environment
) -> SettlementResult:
    """Apply a completed Moosyl payment to exactly one delivery.

    Deliveries settle through ``PaymentRecord`` (the unified ledger) rather than
    ``Payment``. The delivery's commission is decided by the delivery payment flow that
    created that record, so this function never invents a courier commission rate: if no
    record exists yet, the event is rejected and recorded, to be reconciled once the
    delivery payment has been initiated properly.
    """
    from deliveries.models import Delivery

    from .models import PaymentRecord

    delivery = Delivery.objects.select_for_update().filter(id=delivery_id).first()
    if delivery is None:
        return SettlementResult(
            outcome=OUTCOME_REJECTED, detail=f"No delivery #{delivery_id} exists."
        )

    record = (
        PaymentRecord.objects.select_for_update()
        .filter(source="delivery", delivery=delivery)
        .order_by("-created_at")
        .first()
    )
    if record is None:
        return SettlementResult(
            outcome=OUTCOME_REJECTED,
            detail=(
                f"Delivery #{delivery.id} has no payment record, so its courier "
                "commission is unknown. The delivery payment must be initiated through "
                "Yala first; refusing to apply an invented commission."
            ),
        )

    expected = Decimal(record.amount or 0)
    problem = _amount_problem(data, expected)
    if problem:
        return SettlementResult(outcome=OUTCOME_REJECTED, detail=problem)

    if record.status == "paid":
        return SettlementResult(
            outcome=OUTCOME_DUPLICATE,
            detail=(
                f"Delivery #{delivery.id} was already paid (record #{record.id}); "
                "no change."
            ),
        )

    record.status = "paid"
    record.method = "moosyl"
    record.transaction_id = str(data.get("id") or "") or record.transaction_id
    record.save(update_fields=["status", "method", "transaction_id"])

    courier_earning = Decimal(record.courier_earning or 0)
    app_fee = Decimal(record.app_fee or 0)
    if hasattr(delivery, "driver_earning"):
        delivery.driver_earning = courier_earning
        delivery.save(update_fields=["driver_earning"])

    fee = moosyl_fee(expected)
    return SettlementResult(
        outcome=OUTCOME_SETTLED,
        detail=(
            f"Delivery #{delivery.id} settled at {expected} MRU: platform commission "
            f"{app_fee} MRU, courier earning {courier_earning} MRU, Moosyl fee {fee} MRU "
            f"(platform cost), net to Yala IBAN {Decimal(expected) - fee} MRU. The "
            "courier is paid through Yala's own withdrawal flow — Moosyl never "
            "transfers to a courier."
        ),
        settled=True,
    )




