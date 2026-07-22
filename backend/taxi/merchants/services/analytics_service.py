"""Enhanced merchant analytics (Phase 31)."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from ..models import MerchantOrder, MerchantOrderItem


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
    delivered_today = delivered.filter(delivered_at__date=today)

    prep_samples = []
    for order in base_qs.filter(ready_at__isnull=False, accepted_at__isnull=False)[:200]:
        prep_samples.append((order.ready_at - order.accepted_at).total_seconds() / 60)
    avg_prep_minutes = round(sum(prep_samples) / len(prep_samples), 1) if prep_samples else None

    total_orders = base_qs.count()
    cancellation_rate = round(cancelled.count() / total_orders * 100, 1) if total_orders else 0

    best_sellers = list(
        MerchantOrderItem.objects.filter(order__merchant=merchant, order__status="delivered")
        .values("product_name")
        .annotate(quantity_sold=Sum("quantity"), revenue=Sum("line_total"))
        .order_by("-quantity_sold")[:10]
    )

    return {
        "total_orders": total_orders,
        "today_orders": delivered_today.count(),
        "today_sales": bucket(delivered_today),
        "daily_sales": bucket(delivered.filter(delivered_at__date=today)),
        "weekly_sales": bucket(delivered.filter(delivered_at__date__gte=week_start)),
        "monthly_sales": bucket(delivered.filter(delivered_at__date__gte=month_start)),
        "revenue": str(delivered.aggregate(total=Sum("total"))["total"] or Decimal("0")),
        "cancelled_orders": cancelled.count(),
        "cancellation_rate": cancellation_rate,
        "avg_preparation_minutes": avg_prep_minutes,
        "best_selling_items": best_sellers,
        "active_orders": base_qs.filter(
            status__in=[
                "new_order",
                "accepted",
                "preparing",
                "ready_for_pickup",
                "courier_assigned",
                "picked_up",
            ]
        ).count(),
        "orders_by_status": list(
            base_qs.values("status").annotate(count=Count("id")).order_by("status")
        ),
    }
