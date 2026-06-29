"""Email receipts and merchant statements for Yala Delivery."""

import logging
from decimal import Decimal

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Count, Sum
from django.utils import timezone

logger = logging.getLogger(__name__)


def _user_email(user) -> str:
    return (getattr(user, "email", "") or "").strip()


def send_delivery_receipt_email(delivery):
    """Email customer a receipt after delivery payment."""
    customer = delivery.customer
    email = _user_email(customer)
    if not email:
        return False

    total = Decimal(delivery.fare or 0) + Decimal(delivery.tip_amount or 0)
    subject = f"Yala Delivery receipt — #{delivery.id}"
    body = (
        f"Hi {customer.first_name or 'there'},\n\n"
        f"Thanks for using Yala Delivery.\n\n"
        f"Delivery #{delivery.id}\n"
        f"From: {delivery.pickup}\n"
        f"To: {delivery.destination}\n"
        f"Payment method: {delivery.payment_method}\n"
        f"Fare: {delivery.fare} MRU\n"
        f"Tip: {delivery.tip_amount or 0} MRU\n"
        f"Total paid: {total} MRU\n\n"
        f"Track future deliveries: {settings.FRONTEND_URL}/delivery\n\n"
        f"— Yala Delivery"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("Delivery receipt email failed for delivery %s", delivery.id)
        return False


def send_merchant_statement_email(merchant, period_days: int = 7):
    """Email merchant owner a simple weekly order summary."""
    owner = merchant.owner
    email = _user_email(owner)
    if not email:
        return False

    since = timezone.now() - timezone.timedelta(days=period_days)
    orders = merchant.orders.filter(created_at__gte=since)
    totals = orders.aggregate(
        revenue=Sum("total"),
        count=Count("id"),
    )
    revenue = totals["revenue"] or Decimal("0")
    count = totals["count"] or 0
    delivered = orders.filter(status="delivered").count()
    cancelled = orders.filter(status="cancelled").count()

    subject = f"Yala Merchant statement — {merchant.business_name}"
    body = (
        f"Hi {owner.first_name or merchant.owner_name},\n\n"
        f"Your {period_days}-day summary for {merchant.business_name}:\n\n"
        f"Orders: {count}\n"
        f"Delivered: {delivered}\n"
        f"Cancelled: {cancelled}\n"
        f"Gross revenue: {revenue} MRU\n\n"
        f"View details: {settings.FRONTEND_URL}/merchant\n\n"
        f"— Yala Delivery"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("Merchant statement email failed for merchant %s", merchant.id)
        return False
