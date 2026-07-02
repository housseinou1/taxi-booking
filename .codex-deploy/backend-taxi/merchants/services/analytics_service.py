"""Merchant analytics."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from ..models import MerchantOrder


def get_merchant_analytics(merchant):
    now = timezone.now()
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    base_qs = MerchantOrder.objects.filter(merchant=merchant)

    def bucket(qs):
        return {
            "count": qs.count(),
            "revenue": str(qs.aggregate(total=Sum("total"))["total"] or Decimal("0")),
        }

    delivered = base_qs.filter(status="delivered")
    cancelled = base_qs.filter(status="cancelled")

    return {
        "total_orders": base_qs.count(),
        "daily_sales": bucket(delivered.filter(delivered_at__date=today)),
        "weekly_sales": bucket(delivered.filter(delivered_at__date__gte=week_start)),
        "monthly_sales": bucket(delivered.filter(delivered_at__date__gte=month_start)),
        "revenue": str(delivered.aggregate(total=Sum("total"))["total"] or Decimal("0")),
        "cancelled_orders": cancelled.count(),
        "active_orders": base_qs.filter(
            status__in=["new_order", "accepted", "preparing", "ready_for_pickup", "picked_up"]
        ).count(),
        "orders_by_status": list(
            base_qs.values("status").annotate(count=Count("id")).order_by("status")
        ),
    }
