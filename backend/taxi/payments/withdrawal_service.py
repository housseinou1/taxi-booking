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
    WalletAccount,
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
ALLOWED_PAYOUT_TYPES = set(PAYOUT_TYPE_ALIASES.values()) | {"bank_account"}
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
    pending_withdrawal_balance = WithdrawalRequest.objects.filter(
        driver=driver, status__in=["pending", "approved"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    wallet = sync_driver_wallet(driver)
    periods = driver_earnings_periods(driver)
    return {
        "available_balance": str(driver_available_balance(driver)),
        "pending_balance": str(pending_withdrawal_balance),
        "pending_withdrawals": str(pending_withdrawals),
        "pending_delivery_balance": str(driver_pending_delivery_balance(driver)),
        "total_earned": str(driver_total_earned(driver)),
        "lifetime_earnings": str(driver_total_earned(driver)),
        "wallet_balance": str(wallet.balance),
        "minimum_withdrawal": str(MIN_WITHDRAWAL_AMOUNT),
        "earnings": periods,
        "today_earnings": periods.get("today", {}).get("total", "0"),
        "week_earnings": periods.get("week", {}).get("total", "0"),
        "month_earnings": periods.get("month", {}).get("total", "0"),
        "recent_transactions": build_driver_wallet_ledger(driver, limit=25),
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
            "Only Bankily, Sedad, Masravi, and bank account withdrawals are supported.",
            code="invalid_payout_method",
        )
    if method.payout_type == "bank_account":
        if not method.bank_name or not method.account_reference:
            raise WithdrawalError(
                "Bank name and account number are required for bank account withdrawals.",
                code="invalid_payout_method",
            )
        return method
    if not (method.phone_number or method.wallet_id):
        raise WithdrawalError(
            "Phone number is required for mobile money withdrawals.",
            code="invalid_payout_method",
        )
    return method


def assert_driver_can_withdraw(driver) -> None:
    from taxi.drivers.models import DriverProfile

    if getattr(driver, "user_type", "") != "driver":
        raise WithdrawalError("Only driver accounts can request withdrawals.", code="not_driver")
    if not DriverProfile.objects.filter(user=driver, status="approved").exists():
        raise WithdrawalError(
            "Your driver account must be approved before withdrawing.",
            code="driver_not_approved",
        )


def sync_driver_wallet(driver) -> WalletAccount:
    """Sync wallet balance fields with the computed driver earnings model."""
    wallet = get_or_create_wallet(driver)
    wallet.balance = driver_available_balance(driver)
    wallet.pending_balance = driver_reserved_withdrawals(driver)
    wallet.save(update_fields=["balance", "pending_balance", "updated_at"])
    return wallet


def _record_pending_withdrawal_ledger(wallet: WalletAccount, withdrawal: WithdrawalRequest) -> WalletTransaction:
    return apply_wallet_transaction(
        wallet=wallet,
        amount=withdrawal.amount,
        is_credit=False,
        transaction_type="withdrawal",
        reference=f"withdrawal:{withdrawal.id}",
        note="Withdrawal pending admin review",
        status="pending",
    )


def _record_withdrawal_reversal_ledger(wallet: WalletAccount, withdrawal: WithdrawalRequest) -> WalletTransaction:
    return apply_wallet_transaction(
        wallet=wallet,
        amount=withdrawal.amount,
        is_credit=True,
        transaction_type="withdrawal",
        reference=f"withdrawal:{withdrawal.id}:reversed",
        note="Withdrawal rejected - amount returned",
        status="reversed",
    )


def _mark_withdrawal_ledger_completed(withdrawal: WithdrawalRequest) -> None:
    WalletTransaction.objects.filter(
        wallet__owner=withdrawal.driver,
        reference=f"withdrawal:{withdrawal.id}",
        status="pending",
    ).update(status="completed")


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
    phone = (getattr(user, "phone_number", None) or "").strip()
    if not phone:
        payout = (
            DriverPayoutMethod.objects.filter(driver=user, is_default=True)
            .exclude(phone_number="")
            .first()
            or DriverPayoutMethod.objects.filter(driver=user)
            .exclude(phone_number="")
            .order_by("-updated_at", "-id")
            .first()
        )
        phone = (getattr(payout, "phone_number", None) or "").strip()
    if not phone:
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
            phone,
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
            details={"phone_masked": phone[-4:] if phone else ""},
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


def _verify_withdrawal_confirmation(driver, otp_code: str = "", password: str = ""):
    """Confirm a withdrawal with either an OTP code or the account password."""
    if str(password or "").strip():
        if not driver.check_password(str(password).strip()):
            raise WithdrawalError("Incorrect password. Please try again.", code="password_invalid")
        return "password"
    if not str(otp_code or "").strip():
        raise WithdrawalError("OTP code or password is required.", code="otp_required")
    verify_withdrawal_otp(driver, otp_code)
    return "otp"


@transaction.atomic
def create_withdrawal_request(
    driver,
    *,
    amount,
    payout_method_id=None,
    note="",
    otp_code="",
    password="",
    idempotency_key="",
    request=None,
):
    amount = _quantize(amount)
    assert_driver_can_withdraw(driver)

    if not str(idempotency_key or "").strip():
        raise WithdrawalError("Idempotency key is required.", code="missing_idempotency_key")

    idempotency_key = str(idempotency_key).strip()[:64]
    existing = WithdrawalRequest.objects.filter(
        driver=driver,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        return existing

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

    wallet = sync_driver_wallet(driver)
    wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)
    available = wallet.balance
    if amount > available:
        raise WithdrawalError(
            f"Withdrawal amount is higher than available balance ({available} MRU)",
            code="insufficient_balance",
        )

    _verify_withdrawal_confirmation(driver, otp_code=otp_code, password=password)

    payout_method = None
    if payout_method_id:
        payout_method = DriverPayoutMethod.objects.filter(
            driver=driver,
            id=payout_method_id,
        ).first()
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
        idempotency_key=idempotency_key,
        reference="",
    )
    withdrawal.reference = f"WD-{withdrawal.id}"
    withdrawal.save(update_fields=["reference"])

    _record_pending_withdrawal_ledger(wallet, withdrawal)
    wallet.refresh_from_db()
    wallet.pending_balance += amount
    wallet.save(update_fields=["pending_balance", "updated_at"])

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
            details={
                "amount": str(amount),
                "payout_type": payout_method.payout_type,
                "fraud_flag": fraud_flag,
                "confirmation_method": "password" if password else "otp",
            },
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

    wallet = sync_driver_wallet(withdrawal.driver)
    wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)

    withdrawal.status = "rejected"
    withdrawal.admin_note = admin_note or withdrawal.admin_note
    withdrawal.save(update_fields=["status", "admin_note", "updated_at"])

    _record_withdrawal_reversal_ledger(wallet, withdrawal)
    wallet.refresh_from_db()
    wallet.pending_balance -= withdrawal.amount
    wallet.save(update_fields=["pending_balance", "updated_at"])

    if request:
        _log_withdrawal_audit(
            request,
            withdrawal=withdrawal,
            summary=f"Withdrawal #{withdrawal.id} rejected",
            details={"admin_note": withdrawal.admin_note},
        )
    return withdrawal


@transaction.atomic
def mark_withdrawal_paid(
    withdrawal: WithdrawalRequest,
    admin,
    admin_note="",
    payment_reference="",
    request=None,
):
    if withdrawal.status != "approved":
        raise WithdrawalError("Only approved withdrawals can be marked paid.", code="invalid_status")

    wallet = sync_driver_wallet(withdrawal.driver)
    wallet = WalletAccount.objects.select_for_update().get(pk=wallet.pk)

    withdrawal.status = "paid"
    withdrawal.paid_at = timezone.now()
    withdrawal.paid_by = admin
    if admin_note:
        withdrawal.admin_note = admin_note
    if payment_reference:
        withdrawal.payment_reference = payment_reference
    withdrawal.save(
        update_fields=[
            "status",
            "paid_at",
            "paid_by",
            "admin_note",
            "payment_reference",
            "updated_at",
        ]
    )

    wallet.pending_balance -= withdrawal.amount
    wallet.save(update_fields=["pending_balance", "updated_at"])
    _mark_withdrawal_ledger_completed(withdrawal)

    if not WalletTransaction.objects.filter(
        wallet__owner=withdrawal.driver,
        reference=f"withdrawal:{withdrawal.id}",
    ).exists():
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
                status="completed",
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
            details={
                "admin_note": withdrawal.admin_note,
                "payment_reference": withdrawal.payment_reference,
            },
        )
    return withdrawal
