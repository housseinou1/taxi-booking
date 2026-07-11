"""Production driver withdrawal workflow: OTP, fraud checks, ledger, admin lifecycle."""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from authapp.phone_views import send_sms
from payments.models import (
    DriverPayoutMethod,
    PaymentRecord,
    WalletTransaction,
    WithdrawalOTPCode,
    WithdrawalRequest,
)
from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet
from security.models import FraudFlag
from security.services.audit_service import log_audit, log_from_request
from taxi.rides.models import Ride

logger = logging.getLogger(__name__)

MIN_WITHDRAWAL_AMOUNT = Decimal("500")
PAYOUT_TYPE_ALIASES = {
    "bankily": "bankily",
    "sedad": "seddad",
    "seddad": "seddad",
    "masravi": "masrvi",
    "masrvi": "masrvi",
}
ALLOWED_PAYOUT_TYPES = set(PAYOUT_TYPE_ALIASES.values())
RESERVED_WITHDRAWAL_STATUSES = ("pending", "approved", "paid")
OTP_TTL_MINUTES = 10
OTP_THROTTLE_SECONDS = 60


class WithdrawalError(Exception):
    def __init__(self, message: str, code: str = "withdrawal_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _quantize(value) -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def normalize_payout_type(value: str) -> str:
    raw = str(value or "bankily").strip().lower()
    return PAYOUT_TYPE_ALIASES.get(raw, raw)


def _period_starts():
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    return today, week_start, month_start


def _ride_earnings_since(driver, since):
    qs = Ride.objects.filter(driver=driver, status="completed")
    if since:
        qs = qs.filter(completed_at__gte=since)
    return qs.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")


def _delivery_earnings_since(courier, since):
    qs = PaymentRecord.objects.filter(courier=courier, source="delivery", status="paid")
    if since:
        qs = qs.filter(created_at__gte=since)
    return qs.aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")


def _wallet_credits_since(driver, since, transaction_types):
    wallet = get_or_create_wallet(driver)
    qs = WalletTransaction.objects.filter(wallet=wallet, is_credit=True, transaction_type__in=transaction_types)
    if since:
        qs = qs.filter(created_at__gte=since)
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def driver_earnings_periods(driver) -> dict:
    today, week_start, month_start = _period_starts()
    bonus_types = ["bonus", "referral", "no_show", "adjustment", "courier_earning"]

    def bucket(since):
        rides = _ride_earnings_since(driver, since)
        deliveries = _delivery_earnings_since(driver, since)
        extras = _wallet_credits_since(driver, since, bonus_types)
        total = rides + deliveries + extras
        return {
            "rides": str(rides),
            "deliveries": str(deliveries),
            "extras": str(extras),
            "total": str(total),
        }

    return {
        "today": bucket(today),
        "week": bucket(week_start),
        "month": bucket(month_start),
    }


def driver_reserved_withdrawals(driver) -> Decimal:
    return WithdrawalRequest.objects.filter(
        driver=driver,
        status__in=RESERVED_WITHDRAWAL_STATUSES,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")


def driver_total_earned(driver) -> Decimal:
    ride_earned = Ride.objects.filter(driver=driver, status="completed").aggregate(
        total=Sum("driver_earning")
    )["total"] or Decimal("0")
    delivery_earned = PaymentRecord.objects.filter(
        courier=driver, source="delivery", status="paid"
    ).aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")
    wallet = get_or_create_wallet(driver)
    wallet_bonus = WalletTransaction.objects.filter(
        wallet=wallet,
        is_credit=True,
        transaction_type__in=["bonus", "referral", "no_show", "adjustment", "courier_earning"],
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    return ride_earned + delivery_earned + wallet_bonus


def driver_available_balance(driver) -> Decimal:
    return max(driver_total_earned(driver) - driver_reserved_withdrawals(driver), Decimal("0"))


def driver_pending_delivery_balance(driver) -> Decimal:
    return PaymentRecord.objects.filter(
        courier=driver, source="delivery", status="pending"
    ).aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")


def driver_wallet_summary(driver) -> dict:
    pending_withdrawals = WithdrawalRequest.objects.filter(
        driver=driver, status="pending"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    wallet = get_or_create_wallet(driver)
    return {
        "available_balance": str(driver_available_balance(driver)),
        "pending_balance": str(driver_pending_delivery_balance(driver)),
        "pending_withdrawals": str(pending_withdrawals),
        "total_earned": str(driver_total_earned(driver)),
        "wallet_balance": str(wallet.balance),
        "minimum_withdrawal": str(MIN_WITHDRAWAL_AMOUNT),
        "earnings": driver_earnings_periods(driver),
    }


LEDGER_LABELS = {
    "ride_earning": "Ride Earnings",
    "tip": "Tips",
    "bonus": "Bonus",
    "referral": "Referral",
    "withdrawal": "Withdrawal",
    "payout": "Withdrawal",
    "adjustment": "Adjustment",
    "courier_earning": "Delivery Earnings",
    "no_show": "No-Show Compensation",
}


def build_driver_wallet_ledger(driver, limit: int = 40) -> list[dict]:
    entries: list[dict] = []

    rides = (
        Ride.objects.filter(driver=driver, status="completed")
        .order_by("-completed_at", "-id")[: limit * 2]
    )
    for ride in rides:
        completed_at = ride.completed_at or ride.updated_at
        fare = _quantize(ride.driver_earning)
        if fare <= 0:
            continue
        entries.append(
            {
                "id": f"ride-{ride.id}",
                "type": "ride_earning",
                "label": LEDGER_LABELS["ride_earning"],
                "amount": str(fare),
                "is_credit": True,
                "reference": f"ride:{ride.id}",
                "created_at": completed_at.isoformat() if completed_at else "",
            }
        )

    wallet = get_or_create_wallet(driver)
    for tx in wallet.transactions.all()[: limit * 2]:
        tx_type = tx.transaction_type
        if tx_type in {"ride_payment", "delivery_payment", "merchant_payment", "refund", "top_up"}:
            continue
        entries.append(
            {
                "id": f"wallet-{tx.id}",
                "type": tx_type,
                "label": LEDGER_LABELS.get(tx_type, tx_type.replace("_", " ").title()),
                "amount": str(tx.amount),
                "is_credit": tx.is_credit,
                "reference": tx.reference,
                "note": tx.note,
                "created_at": tx.created_at.isoformat(),
            }
        )

    for withdrawal in WithdrawalRequest.objects.filter(driver=driver).order_by("-created_at")[:limit]:
        entries.append(
            {
                "id": f"withdrawal-{withdrawal.id}",
                "type": "withdrawal",
                "label": LEDGER_LABELS["withdrawal"],
                "amount": str(withdrawal.amount),
                "is_credit": False,
                "reference": f"withdrawal:{withdrawal.id}",
                "status": withdrawal.status,
                "created_at": withdrawal.created_at.isoformat(),
            }
        )

    entries.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return entries[:limit]


def validate_payout_method(method: DriverPayoutMethod | None) -> DriverPayoutMethod:
    if not method:
        raise WithdrawalError("Please add a payout method first.", code="missing_payout_method")
    method.payout_type = normalize_payout_type(method.payout_type)
    if method.payout_type not in ALLOWED_PAYOUT_TYPES:
        raise WithdrawalError(
            "Only Bankily, Sedad, and Masravi withdrawals are supported.",
            code="invalid_payout_method",
        )
    if not (method.phone_number or method.wallet_id):
        raise WithdrawalError(
            "Phone number is required for mobile money withdrawals.",
            code="invalid_payout_method",
        )
    return method


def _fraud_check_withdrawal(driver, amount: Decimal) -> bool:
    recent_count = WithdrawalRequest.objects.filter(
        driver=driver,
        created_at__gte=timezone.now() - timedelta(days=1),
    ).count()
    if recent_count >= 3:
        return True
    if amount > Decimal("50000"):
        return True
    if driver_available_balance(driver) < amount and amount > Decimal("1000"):
        return True
    return False


def _log_withdrawal_audit(request, *, withdrawal=None, driver=None, summary="", details=None):
    log_from_request(
        request,
        action="admin_action" if request and getattr(request.user, "is_staff", False) else "payment_change",
        entity_type="payment",
        entity_id=withdrawal.id if withdrawal else "",
        summary=summary,
        details={
            "driver_id": getattr(driver or getattr(withdrawal, "driver", None), "id", None),
            "driver_email": getattr(driver or getattr(withdrawal, "driver", None), "email", ""),
            **(details or {}),
        },
    )


def send_withdrawal_otp(user, request=None) -> dict:
    if not user.phone_number:
        raise WithdrawalError(
            "Add and verify a phone number before withdrawing.",
            code="phone_required",
        )

    throttle_key = f"withdrawal-otp:{user.id}"
    if cache.get(throttle_key):
        raise WithdrawalError(
            "Please wait one minute before requesting another code.",
            code="otp_throttled",
        )

    WithdrawalOTPCode.objects.filter(user=user, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    WithdrawalOTPCode.objects.create(
        user=user,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
    )

    try:
        send_sms(
            user.phone_number,
            f"Yala withdrawal confirmation code: {code}. Valid for {OTP_TTL_MINUTES} minutes.",
        )
    except Exception as exc:
        logger.exception("Failed to send withdrawal OTP to user %s", user.id)
        raise WithdrawalError("Could not send verification code.", code="otp_send_failed") from exc

    cache.set(throttle_key, True, OTP_THROTTLE_SECONDS)
    if request:
        _log_withdrawal_audit(
            request,
            driver=user,
            summary="Withdrawal OTP requested",
            details={"phone_masked": user.phone_number[-4:] if user.phone_number else ""},
        )
    return {"message": "Verification code sent.", "expires_in_minutes": OTP_TTL_MINUTES}


def verify_withdrawal_otp(user, code: str) -> WithdrawalOTPCode:
    if not code or len(str(code).strip()) < 4:
        raise WithdrawalError("Enter the verification code.", code="otp_required")

    otp = (
        WithdrawalOTPCode.objects.filter(user=user, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not otp or otp.expires_at < timezone.now():
        raise WithdrawalError("Verification code expired. Request a new one.", code="otp_expired")
    if not check_password(str(code).strip(), otp.code_hash):
        raise WithdrawalError("Invalid verification code.", code="otp_invalid")

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])
    return otp


@transaction.atomic
def create_withdrawal_request(driver, *, amount, payout_method_id=None, note="", otp_code="", request=None):
    amount = _quantize(amount)
    if amount <= 0:
        raise WithdrawalError("Withdrawal amount must be greater than zero.", code="invalid_amount")
    if amount < MIN_WITHDRAWAL_AMOUNT:
        raise WithdrawalError(
            f"Minimum withdrawal amount is {MIN_WITHDRAWAL_AMOUNT} MRU",
            code="below_minimum",
        )

    type(driver).objects.select_for_update().get(pk=driver.pk)

    if WithdrawalRequest.objects.filter(driver=driver, status="pending").exists():
        raise WithdrawalError(
            "You already have a pending withdrawal. Wait for admin review before submitting another.",
            code="duplicate_pending",
        )

    available = driver_available_balance(driver)
    if amount > available:
        raise WithdrawalError(
            f"Withdrawal amount is higher than available balance ({available} MRU)",
            code="insufficient_balance",
        )

    otp_record = verify_withdrawal_otp(driver, otp_code)

    payout_method = None
    if payout_method_id:
        payout_method = DriverPayoutMethod.objects.filter(driver=driver, id=payout_method_id).first()
    if not payout_method:
        payout_method = DriverPayoutMethod.objects.filter(driver=driver, is_default=True).first()
    payout_method = validate_payout_method(payout_method)

    fraud_flag = _fraud_check_withdrawal(driver, amount)
    withdrawal = WithdrawalRequest.objects.create(
        driver=driver,
        payout_method=payout_method,
        amount=amount,
        note=note or "",
        otp_verified_at=timezone.now(),
    )

    if fraud_flag:
        FraudFlag.objects.create(
            user=driver,
            reason="other",
            severity="high",
            description=f"Withdrawal #{withdrawal.id} flagged: amount {amount} MRU",
            metadata={"withdrawal_id": withdrawal.id, "amount": str(amount)},
        )
        log_audit(
            action="fraud_flag",
            entity_type="payment",
            entity_id=withdrawal.id,
            summary=f"Withdrawal #{withdrawal.id} flagged for review",
            actor=driver,
            details={"amount": str(amount), "available_balance": str(available)},
        )

    if request:
        _log_withdrawal_audit(
            request,
            withdrawal=withdrawal,
            summary=f"Withdrawal #{withdrawal.id} submitted",
            details={"amount": str(amount), "payout_type": payout_method.payout_type, "fraud_flag": fraud_flag},
        )

    return withdrawal


@transaction.atomic
def approve_withdrawal_request(withdrawal: WithdrawalRequest, admin, admin_note="", request=None):
    if withdrawal.status != "pending":
        raise WithdrawalError("Only pending withdrawals can be approved.", code="invalid_status")

    withdrawal.status = "approved"
    withdrawal.admin_note = admin_note or withdrawal.admin_note
    withdrawal.approved_at = timezone.now()
    withdrawal.approved_by = admin
    withdrawal.save(
        update_fields=["status", "admin_note", "approved_at", "approved_by", "updated_at"]
    )

    if request:
        _log_withdrawal_audit(
            request,
            withdrawal=withdrawal,
            summary=f"Withdrawal #{withdrawal.id} approved",
            details={"admin_note": withdrawal.admin_note},
        )
    return withdrawal


@transaction.atomic
def reject_withdrawal_request(withdrawal: WithdrawalRequest, admin, admin_note="", request=None):
    if withdrawal.status != "pending":
        raise WithdrawalError("Only pending withdrawals can be rejected.", code="invalid_status")

    withdrawal.status = "rejected"
    withdrawal.admin_note = admin_note or withdrawal.admin_note
    withdrawal.save(update_fields=["status", "admin_note", "updated_at"])

    if request:
        _log_withdrawal_audit(
            request,
            withdrawal=withdrawal,
            summary=f"Withdrawal #{withdrawal.id} rejected",
            details={"admin_note": withdrawal.admin_note},
        )
    return withdrawal


@transaction.atomic
def mark_withdrawal_paid(withdrawal: WithdrawalRequest, admin, admin_note="", request=None):
    if withdrawal.status != "approved":
        raise WithdrawalError("Only approved withdrawals can be marked paid.", code="invalid_status")

    withdrawal.status = "paid"
    withdrawal.paid_at = timezone.now()
    withdrawal.paid_by = admin
    if admin_note:
        withdrawal.admin_note = admin_note
    withdrawal.save(
        update_fields=["status", "paid_at", "paid_by", "admin_note", "updated_at"]
    )

    wallet = get_or_create_wallet(withdrawal.driver)
    try:
        apply_wallet_transaction(
            wallet=wallet,
            amount=withdrawal.amount,
            is_credit=False,
            transaction_type="withdrawal",
            reference=f"withdrawal:{withdrawal.id}",
            note=f"Withdrawal paid via {withdrawal.payout_method}",
        )
    except ValueError:
        WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type="withdrawal",
            amount=withdrawal.amount,
            is_credit=False,
            balance_after=wallet.balance,
            reference=f"withdrawal:{withdrawal.id}",
            note=f"Withdrawal paid via {withdrawal.payout_method}",
        )

    if request:
        _log_withdrawal_audit(
            request,
            withdrawal=withdrawal,
            summary=f"Withdrawal #{withdrawal.id} marked paid",
            details={"admin_note": withdrawal.admin_note},
        )
    return withdrawal
