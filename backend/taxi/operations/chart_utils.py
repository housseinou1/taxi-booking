"""Shared chart aggregation helpers (RC3 — avoid per-day query loops)."""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Sum
from django.db.models.functions import TruncDate


def build_daily_payment_chart(payments_qs, start: date, end: date) -> list[dict]:
    """Single grouped query for daily revenue + commission chart rows."""
    rows = (
        payments_qs.filter(created_at__date__gte=start, created_at__date__lte=end)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue=Sum("amount"), commission=Sum("app_fee"))
        .order_by("day")
    )
    by_day = {
        row["day"]: {
            "revenue": float(row["revenue"] or 0),
            "commission": float(row["commission"] or 0),
        }
        for row in rows
    }

    chart = []
    cursor = start
    while cursor <= end:
        values = by_day.get(cursor, {"revenue": 0.0, "commission": 0.0})
        chart.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "revenue": values["revenue"],
                "commission": values["commission"],
                "gross_revenue": values["revenue"],
                "platform_commission": values["commission"],
            }
        )
        cursor += timedelta(days=1)
    return chart
