"""Payment settlement, commission splits, wallet movements, and refunds."""

import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import (
    CommissionConfig,
    MerchantWithdrawalRequest,
    PaymentRecord,
    RefundRequest,
    WithdrawalRequest,
)
from .wallet_ledger import apply_wallet_transaction, get_or_create_wallet

logger = logging.getLogger(__name__)
TWO = Decimal("0.01")
MOBILE_METHODS = {"bankily", "masrvi", "seddad", "sedad", "masravi"}
DELIVERY_PREPAY_METHODS = {"card", "bankily", "sedad", "masravi", "masrvi", "seddad"}


class SettlementError(Exception):
    def __init__(self, message, code="settlement_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _quantize(value):
    return Decimal(str(value or 0)).quantize(TWO, ROUND_HALF_UP)


def get_commission_config(vertical: str) -> CommissionConfig:
    defaults = {
        "delivery": {"courier_rate": Decimal("0.80"), "platform_rate": Decimal("0.20"), "merchant_rate": Decimal("0.90")},
        "merchant": {"courier_rate": Decimal("0.80"), "platform_rate": Decimal("0.10"), "merchant_rate": Decimal("0.90")},
    }
    cfg, _ = CommissionConfig.objects.get_or_create(
        vertical=vertical,
        defaults=defaults.get(vertical, defaults["delivery"]),
    )
    return cfg


def split_delivery_amount(total, tip=Decimal("0")):
    cfg = get_commission_config("delivery")
    base = _quantize(total)
    tip = _quantize(tip)
    combined = base + tip
    courier = _quantize(combined * cfg.courier_rate)
    platform = _quantize(combined * cfg.platform_rate)
    return {
        "total": combined,
        "courier_earning": courier,
        "app_fee": platform,
        "merchant_earning": Decimal("0"),
    }


def split_merchant_order(subtotal, delivery_fee=Decimal("0"), promo_discount=Decimal("0")):
    cfg = get_commission_config("merchant")
    goods = max(_quantize(subtotal) - _quantize(promo_discount), Decimal("0"))
    merchant_goods = _quantize(goods * cfg.merchant_rate)
    platform_goods = _quantize(goods - merchant_goods)
    delivery_split = split_delivery_amount(delivery_fee)
    return {
        "total": _quantize(goods + _quantize(delivery_fee)),
        "merchant_earning": merchant_goods,
        "app_fee": platform_goods + delivery_split["app_fee"],
        "courier_earning": delivery_split["courier_earning"],
    }


def _normalize_method(method: str) -> str:
    method = (method or "card").lower()
    aliases = {
        "masrvi": "masravi",
        "seddad": "sedad",
    }
    method = aliases.get(method, method)
    if method in MOBILE_METHODS or method == "card":
        return method
    if method in {"cash", "wallet", "promo_credit"}:
        raise SettlementError("Cash payments are not supported for delivery.", code="invalid_method")
    raise SettlementError("Invalid payment method.", code="invalid_method")


def normalize_delivery_payment_method(method: str) -> str:
    """Normalize customer-facing delivery payment providers."""
    return _normalize_method(method)


def _generate_transaction_id(prefix="YL"):
    return f"{prefix}-{uuid.uuid4().hex[:16].upper()}"


def _payment_timing(method: str, timing: str = "") -> str:
    if timing in {"before_delivery", "after_delivery", "cash_on_delivery"}:
        return timing
    return "before_delivery"


@transaction.atomic
def prepay_delivery_request(
    customer,
    amount,
    payment_method: str,
    provider_token: str = "",
) -> PaymentRecord:
    """Charge the customer before a delivery request is created."""
    method = normalize_delivery_payment_method(payment_method)
    total = _quantize(amount)
    if total <= 0:
        raise SettlementError("Invalid payment amount.", code="invalid_amount")

    split = split_delivery_amount(total)
    ledger_method = "masrvi" if method == "masravi" else ("seddad" if method == "sedad" else method)

    record = PaymentRecord.objects.create(
        source="delivery",
        customer=customer,
        amount=split["total"],
        method=ledger_method,
        status="paid",
        payment_timing="before_delivery",
        transaction_id=_generate_transaction_id("DLV"),
        provider_token=(provider_token or "")[:255],
        app_fee=split["app_fee"],
        courier_earning=split["courier_earning"],
        merchant_earning=Decimal("0"),
    )
    return record


@transaction.atomic
def settle_delivery_payment(
    delivery,
    customer,
    payment_method: str,
    tip_amount=0,
    payment_timing: str = "",
    provider_token: str = "",
) -> PaymentRecord:
    if delivery.customer_id != customer.id:
        raise SettlementError("You cannot pay for this delivery.", code="forbidden")
    if delivery.status != "delivered":
        raise SettlementError("Delivery must be completed before payment.", code="not_delivered")

    method = _normalize_method(payment_method)
    tip = _quantize(tip_amount)
    split = split_delivery_amount(delivery.fare, tip)

    existing = PaymentRecord.objects.filter(delivery=delivery, status="paid").first()
    if existing:
        return existing

    timing = _payment_timing(method, payment_timing)
    status = "pending" if method in {"card", *MOBILE_METHODS} else "paid"
    wallet_tx = None

    if method == "wallet":
        wallet = get_or_create_wallet(customer)
        wallet_tx = apply_wallet_transaction(
            wallet,
            split["total"],
            False,
            "delivery_payment",
            reference=f"delivery:{delivery.id}",
            note=f"Delivery #{delivery.id}",
        )
        status = "paid"

    record = PaymentRecord.objects.create(
        source="delivery",
        customer=customer,
        courier=delivery.driver,
        delivery=delivery,
        amount=split["total"],
        method=method,
        status=status,
        payment_timing=timing,
        transaction_id=_generate_transaction_id("DLV"),
        provider_token=(provider_token or "")[:255],
        app_fee=split["app_fee"],
        courier_earning=split["courier_earning"],
        merchant_earning=Decimal("0"),
        wallet_transaction=wallet_tx,
    )

    delivery.payment_method = method
    delivery.tip_amount = tip
    delivery.payment_status = "paid" if status == "paid" else "pending"
    delivery.fare = split["total"]
    delivery.driver_earning = split["courier_earning"]
    delivery.platform_commission = split["app_fee"]
    delivery.save(
        update_fields=[
            "payment_method",
            "tip_amount",
            "payment_status",
            "fare",
            "driver_earning",
            "platform_commission",
        ]
    )

    if status == "paid" and delivery.driver:
        _credit_courier_wallet(delivery.driver, split["courier_earning"], delivery.id)

    return record


@transaction.atomic
def settle_merchant_order_payment(
    order,
    payment_method: str,
    payment_timing: str = "before_delivery",
    provider_token: str = "",
) -> PaymentRecord:
    method = _normalize_method(payment_method)
    split = split_merchant_order(order.subtotal, order.delivery_fee, order.discount_amount)

    existing = PaymentRecord.objects.filter(merchant_order=order, status="paid").first()
    if existing:
        return existing

    status = "paid" if payment_timing == "before_delivery" else "pending"
    ledger_method = "masrvi" if method == "masravi" else ("seddad" if method == "sedad" else method)
    if method == "wallet":
        wallet = get_or_create_wallet(order.customer)
        wallet_tx = apply_wallet_transaction(
            wallet,
            order.total,
            False,
            "merchant_payment",
            reference=f"merchant_order:{order.id}",
            note=f"Order #{order.id}",
        )
        status = "paid"
    else:
        wallet_tx = None

    record = PaymentRecord.objects.create(
        source="merchant_order",
        customer=order.customer,
        merchant=order.merchant,
        merchant_order=order,
        amount=order.total,
        promo_discount=order.discount_amount,
        method=ledger_method,
        status=status,
        payment_timing=payment_timing or "before_delivery",
        transaction_id=_generate_transaction_id("ORD"),
        provider_token=(provider_token or "")[:255],
        app_fee=split["app_fee"],
        courier_earning=split["courier_earning"],
        merchant_earning=split["merchant_earning"],
        wallet_transaction=wallet_tx,
    )

    order.payment_method = method
    order.payment_status = "paid" if status == "paid" else "pending"
    order.save(update_fields=["payment_method", "payment_status"])

    if status == "paid":
        _credit_merchant_wallet(order.merchant.owner, split["merchant_earning"], order.id)
        try:
            from merchants.services.notifications import notify_merchant_order_update

            notify_merchant_order_update(order, "payment_received")
        except Exception:
            pass

    return record


def _credit_courier_wallet(courier, amount, delivery_id):
    amount = _quantize(amount)
    if amount <= 0:
        return
    wallet = get_or_create_wallet(courier)
    apply_wallet_transaction(
        wallet,
        amount,
        True,
        "courier_earning",
        reference=f"delivery:{delivery_id}",
        note="Delivery earning",
    )


def _credit_merchant_wallet(merchant_user, amount, order_id):
    amount = _quantize(amount)
    if amount <= 0:
        return
    wallet = get_or_create_wallet(merchant_user)
    apply_wallet_transaction(
        wallet,
        amount,
        True,
        "merchant_earning",
        reference=f"merchant_order:{order_id}",
        note="Merchant order earning",
    )


@transaction.atomic
def wallet_top_up(user, amount, method="bankily", provider_token=""):
    amount = _quantize(amount)
    if amount <= 0:
        raise SettlementError("Amount must be positive.", code="invalid_amount")
    method = _normalize_method(method)
    wallet = get_or_create_wallet(user)
    status = "paid" if method in MOBILE_METHODS and provider_token else "pending"
    wallet_tx = None
    if status == "paid":
        wallet_tx = apply_wallet_transaction(
            wallet,
            amount,
            True,
            "top_up",
            reference=_generate_transaction_id("TOP"),
            note=f"Top up via {method}",
        )
    return {
        "status": status,
        "amount": str(amount),
        "wallet_balance": str(wallet.balance),
        "transaction": wallet_tx,
        "provider_token": (provider_token or "")[:255],
    }


def courier_balance_summary(courier):
    paid_deliveries = PaymentRecord.objects.filter(
        courier=courier, source="delivery", status="paid"
    )
    total_earned = paid_deliveries.aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")

    ride_earned = Decimal("0")
    try:
        from taxi.rides.models import Ride

        ride_earned = Ride.objects.filter(driver=courier, status="completed").aggregate(
            total=Sum("driver_earning")
        )["total"] or Decimal("0")
    except Exception:
        pass

    reserved = WithdrawalRequest.objects.filter(
        driver=courier, status__in=["pending", "approved", "paid"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    wallet = get_or_create_wallet(courier)
    pending = PaymentRecord.objects.filter(
        courier=courier, source="delivery", status="pending"
    ).aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")

    available = max(total_earned + ride_earned - reserved, Decimal("0"))

    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today - timezone.timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def bucket(start):
        qs = paid_deliveries.filter(created_at__gte=start)
        return {
            "count": qs.count(),
            "earnings": str(qs.aggregate(total=Sum("courier_earning"))["total"] or Decimal("0")),
        }

    return {
        "wallet_balance": str(wallet.balance),
        "available_balance": str(available),
        "pending_balance": str(pending),
        "total_earned": str(total_earned + ride_earned),
        "daily": bucket(today),
        "weekly": bucket(week_start),
        "monthly": bucket(month_start),
        "completed_deliveries": paid_deliveries.count(),
    }


def merchant_payout_summary(merchant):
    paid = PaymentRecord.objects.filter(merchant=merchant, status="paid")
    total_sales = paid.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = paid.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    net = paid.aggregate(total=Sum("merchant_earning"))["total"] or Decimal("0")

    pending_payout = MerchantWithdrawalRequest.objects.filter(
        merchant=merchant, status="pending"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    paid_payout = MerchantWithdrawalRequest.objects.filter(
        merchant=merchant, status__in=["approved", "paid"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    wallet = get_or_create_wallet(merchant.owner)
    available = max(net - pending_payout - paid_payout, Decimal("0"))

    return {
        "total_sales": str(total_sales),
        "yala_commission": str(commission),
        "net_earnings": str(net),
        "wallet_balance": str(wallet.balance),
        "available_payout": str(available),
        "pending_payout": str(pending_payout),
        "paid_payout": str(paid_payout),
    }


def _fraud_check_refund(customer, amount) -> bool:
    recent = RefundRequest.objects.filter(
        customer=customer,
        created_at__gte=timezone.now() - timezone.timedelta(days=7),
    ).count()
    return recent >= 3 or _quantize(amount) > Decimal("50000")


@transaction.atomic
def request_refund(payment_record, customer, reason, note=""):
    if payment_record.customer_id != customer.id:
        raise SettlementError("Not your payment.", code="forbidden")
    if payment_record.status not in {"paid", "pending"}:
        raise SettlementError("Payment cannot be refunded.", code="invalid_status")

    fraud = _fraud_check_refund(customer, payment_record.amount)
    refund = RefundRequest.objects.create(
        payment_record=payment_record,
        customer=customer,
        amount=payment_record.amount,
        reason=reason,
        note=note,
        fraud_flag=fraud,
    )
    return refund


@transaction.atomic
def approve_refund(refund: RefundRequest, admin_note=""):
    if refund.status != "requested":
        raise SettlementError("Refund already processed.", code="invalid_status")
    if refund.fraud_flag:
        raise SettlementError("Flagged for fraud review.", code="fraud_flag")

    refund.status = "approved"
    refund.admin_note = admin_note
    refund.save(update_fields=["status", "admin_note"])

    wallet = get_or_create_wallet(refund.customer)
    wallet_tx = apply_wallet_transaction(
        wallet,
        refund.amount,
        True,
        "refund",
        reference=f"refund:{refund.id}",
        note=refund.get_reason_display(),
    )
    refund.payment_record.status = "refunded"
    refund.payment_record.save(update_fields=["status"])
    refund.status = "refunded"
    refund.wallet_refund_tx = wallet_tx
    refund.resolved_at = timezone.now()
    refund.save(update_fields=["status", "wallet_refund_tx", "resolved_at"])
    return refund


@transaction.atomic
def reject_refund(refund: RefundRequest, admin_note=""):
    refund.status = "rejected"
    refund.admin_note = admin_note
    refund.resolved_at = timezone.now()
    refund.save(update_fields=["status", "admin_note", "resolved_at"])
    return refund


def admin_payment_dashboard():
    records = PaymentRecord.objects.all()
    refunds = RefundRequest.objects.all()
    withdrawals = WithdrawalRequest.objects.filter(status="pending")
    merchant_withdrawals = MerchantWithdrawalRequest.objects.filter(status="pending")

    return {
        "total_revenue": str(
            records.filter(status="paid").aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
        ),
        "gross_volume": str(
            records.filter(status="paid").aggregate(total=Sum("amount"))["total"] or Decimal("0")
        ),
        "pending_payouts": withdrawals.count() + merchant_withdrawals.count(),
        "completed_payouts": WithdrawalRequest.objects.filter(status="approved").count()
        + MerchantWithdrawalRequest.objects.filter(status="paid").count(),
        "refund_requests": refunds.filter(status="requested").count(),
        "failed_payments": records.filter(status="failed").count(),
        "cash_orders": records.filter(method="cash", status="paid").count(),
        "wallet_transactions": records.filter(method="wallet").count(),
    }
