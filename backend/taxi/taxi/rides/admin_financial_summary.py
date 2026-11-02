"""Admin financial summary for the legacy /admin dashboard (Task 4).

GET /rides/admin/financial-summary/?city=<id>

Additive endpoint. It does not change ``ride_history`` or ``RideSerializer``. It returns the
figures AdminDashboard.js currently derives in the browser from ``GET /rides/history/``
(the latest 500 rides for staff), computed from the SAME window in one SQL query:

- Window: ``Ride.objects.order_by("-id")[:500]``, optional ``?city=<id>`` -> ``city_id`` filter,
  exactly as the staff branch of ``ride_history``.
- payment_status: the ride's latest ``Payment`` by ``-created_at`` (no extra tie-break), or
  "unpaid" when it has none — the same lookup as ``RideSerializer.get_latest_payment``.
- Money totals: exact Decimal sums of ``fare`` / ``app_fee`` / ``driver_earning`` over every
  ride in the window, regardless of status (the dashboard sums all rows).
- Rates and average fare: reproduced with the dashboard's own arithmetic — IEEE-754 float sums
  of ``Number(value || 0)`` in ride order, divided by the row count, rounded with JavaScript's
  ``Math.round`` — so the integers match what the browser shows today.
"""

from __future__ import annotations

import math
from decimal import Decimal

from django.db.models import OuterRef, Subquery
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import Ride

WINDOW_SIZE = 500  # ride_history's staff limit
ACTIVE_RIDE_STATUSES = ("requested", "pending", "accepted", "driver_arriving", "driver_arrived", "in_progress")
WAITING_RIDE_STATUSES = ("requested", "pending")
CANCELLED_RIDE_STATUSES = ("cancelled", "rider_no_show")


def _js_round(value: float) -> int:
    """JavaScript Math.round for the non-negative values used here (halves round up)."""
    return int(math.floor(value + 0.5))


def _js_number(value) -> float:
    """``Number(value || 0)`` applied to a DRF-serialised DecimalField (a string such as "12.50")."""
    if value is None:
        return 0.0
    return float(value)


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


def build_admin_financial_summary(city_id=None) -> dict:
    from payments.models import Payment

    latest_payment_status = Subquery(
        Payment.objects.filter(ride_id=OuterRef("pk")).order_by("-created_at").values("status")[:1]
    )
    rides = Ride.objects.order_by("-id")
    if city_id:
        rides = rides.filter(city_id=city_id)
    rows = list(
        rides.annotate(latest_payment_status=latest_payment_status).values_list(
            "status", "is_rider_no_show", "fare", "app_fee", "driver_earning", "latest_payment_status"
        )[:WINDOW_SIZE]
    )

    revenue = commission = earnings = Decimal("0")
    js_revenue = js_commission = js_earnings = 0.0
    counts = {
        "completed": 0, "cancelled": 0, "rider_no_show": 0, "active": 0, "waiting": 0,
        "driver_arriving": 0, "in_progress": 0, "paid": 0, "unpaid": 0,
    }
    for ride_status, no_show_flag, fare, app_fee, driver_earning, payment_status in rows:
        revenue += fare or Decimal("0")
        commission += app_fee or Decimal("0")
        earnings += driver_earning or Decimal("0")
        js_revenue += _js_number(fare)
        js_commission += _js_number(app_fee)
        js_earnings += _js_number(driver_earning)

        counts["completed"] += ride_status == "completed"
        counts["cancelled"] += ride_status in CANCELLED_RIDE_STATUSES
        counts["rider_no_show"] += ride_status == "rider_no_show" or bool(no_show_flag)
        counts["active"] += ride_status in ACTIVE_RIDE_STATUSES
        counts["waiting"] += ride_status in WAITING_RIDE_STATUSES
        counts["driver_arriving"] += ride_status == "driver_arriving"
        counts["in_progress"] += ride_status == "in_progress"
        if (payment_status or "unpaid") == "paid":
            counts["paid"] += 1
        else:
            counts["unpaid"] += 1

    total = len(rows)
    return {
        "window": {"size": WINDOW_SIZE, "rides": total, "city_id": city_id, "ordering": "-id"},
        "money": {
            "total_revenue": _money(revenue),
            "platform_commission": _money(commission),
            "driver_earnings": _money(earnings),
        },
        "counts": {"total": total, **counts},
        "rates": {
            "completion_rate_pct": _js_round(counts["completed"] / total * 100) if total else 0,
            "cancellation_rate_pct": _js_round(counts["cancelled"] / total * 100) if total else 0,
        },
        "average_fare": _js_round(js_revenue / total) if total else 0,
        # The dashboard's float totals, for clients that must reproduce its exact display values.
        "dashboard_float_totals": {
            "total_revenue": js_revenue,
            "platform_commission": js_commission,
            "driver_earnings": js_earnings,
        },
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_financial_summary(request):
    """Staff-only (is_staff, the same gate as ride_history's staff branch and the other
    admin ride endpoints). Riders, drivers and anonymous users are rejected."""
    raw_city = request.query_params.get("city")
    city_id = None
    if raw_city:
        try:
            city_id = int(raw_city)
        except (TypeError, ValueError):
            return Response({"detail": "city must be an integer id."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(build_admin_financial_summary(city_id=city_id))
