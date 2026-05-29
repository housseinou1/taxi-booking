"""
Analytics views for driver earnings, rider spending, and admin revenue.
All endpoints return chart-ready data for the frontend dashboards.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils.timezone import now

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Ride

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sum_earnings(qs, field, start, end):
    """Sum a decimal field for rides completed in [start, end]."""
    return (
        qs.filter(completed_at__date__gte=start, completed_at__date__lte=end)
        .aggregate(total=Sum(field))["total"]
        or Decimal("0")
    )


def _build_daily_chart(qs, field, today, days=7):
    chart = []
    for days_ago in range(days - 1, -1, -1):
        day = today - timedelta(days=days_ago)
        chart.append(
            {
                "label": day.strftime("%a"),
                "date": day.isoformat(),
                "value": float(_sum_earnings(qs, field, day, day)),
            }
        )
    return chart


def _build_weekly_chart(qs, field, today, weeks=8):
    week_start = today - timedelta(days=today.weekday())
    chart = []
    for weeks_ago in range(weeks - 1, -1, -1):
        start = week_start - timedelta(days=weeks_ago * 7)
        end = start + timedelta(days=6)
        chart.append(
            {
                "label": f"{start.strftime('%b')} {start.day}",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "value": float(_sum_earnings(qs, field, start, end)),
            }
        )
    return chart


def _build_monthly_chart(qs, field, today, months=12):
    chart = []
    month_cursor = today.replace(day=1)
    for months_ago in range(months - 1, -1, -1):
        # Walk back months_ago months from month_cursor
        month = month_cursor
        for _ in range(months_ago):
            month = (month.replace(day=1) - timedelta(days=1)).replace(day=1)

        if month.month == 12:
            next_month = month.replace(year=month.year + 1, month=1, day=1)
        else:
            next_month = month.replace(month=month.month + 1, day=1)
        end = next_month - timedelta(days=1)

        chart.append(
            {
                "label": month.strftime("%b %y"),
                "start_date": month.isoformat(),
                "end_date": end.isoformat(),
                "value": float(_sum_earnings(qs, field, month, end)),
            }
        )
    return chart


def _build_ride_count_chart(qs, today, days=30):
    """Daily ride count chart for the last N days."""
    chart = []
    for days_ago in range(days - 1, -1, -1):
        day = today - timedelta(days=days_ago)
        count = qs.filter(created_at__date=day).count()
        chart.append({"label": day.strftime("%b %d"), "date": day.isoformat(), "value": count})
    return chart


# ---------------------------------------------------------------------------
# Driver analytics
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_analytics(request):
    """
    Returns daily/weekly/monthly earnings charts plus summary KPIs for the
    authenticated driver.
    """
    driver = request.user
    today = now().date()

    completed = Ride.objects.filter(driver=driver, status="completed")

    # --- KPI summary ---
    today_earnings = float(
        completed.filter(completed_at__date=today)
        .aggregate(total=Sum("driver_earning"))["total"]
        or 0
    )
    week_start = today - timedelta(days=today.weekday())
    week_earnings = float(
        completed.filter(completed_at__date__gte=week_start)
        .aggregate(total=Sum("driver_earning"))["total"]
        or 0
    )
    month_start = today.replace(day=1)
    month_earnings = float(
        completed.filter(completed_at__date__gte=month_start)
        .aggregate(total=Sum("driver_earning"))["total"]
        or 0
    )
    total_earnings = float(
        completed.aggregate(total=Sum("driver_earning"))["total"] or 0
    )
    total_rides = completed.count()
    today_rides = completed.filter(completed_at__date=today).count()
    cancelled_count = Ride.objects.filter(driver=driver, status="cancelled").count()
    avg_fare = float(
        completed.aggregate(avg=Avg("fare"))["avg"] or 0
    )
    avg_rating = float(
        completed.filter(rating__isnull=False).aggregate(avg=Avg("rating"))["avg"] or 0
    )

    # --- Charts ---
    daily = _build_daily_chart(completed, "driver_earning", today, days=14)
    weekly = _build_weekly_chart(completed, "driver_earning", today, weeks=8)
    monthly = _build_monthly_chart(completed, "driver_earning", today, months=12)

    # Completed vs cancelled per day (last 30 days)
    completed_daily = _build_ride_count_chart(
        Ride.objects.filter(driver=driver, status="completed"), today, days=30
    )
    cancelled_daily = _build_ride_count_chart(
        Ride.objects.filter(driver=driver, status="cancelled"), today, days=30
    )

    return Response(
        {
            "summary": {
                "today_earnings": today_earnings,
                "week_earnings": week_earnings,
                "month_earnings": month_earnings,
                "total_earnings": total_earnings,
                "total_rides": total_rides,
                "today_rides": today_rides,
                "cancelled_rides": cancelled_count,
                "avg_fare": round(avg_fare, 2),
                "avg_rating": round(avg_rating, 2),
            },
            "charts": {
                "daily_earnings": daily,
                "weekly_earnings": weekly,
                "monthly_earnings": monthly,
                "completed_rides_daily": completed_daily,
                "cancelled_rides_daily": cancelled_daily,
            },
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Rider analytics
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rider_analytics(request):
    """
    Returns spending history charts and summary KPIs for the authenticated rider.
    """
    rider = request.user
    today = now().date()

    completed = Ride.objects.filter(rider=rider, status="completed")

    total_spent = float(completed.aggregate(total=Sum("fare"))["total"] or 0)
    month_start = today.replace(day=1)
    month_spent = float(
        completed.filter(completed_at__date__gte=month_start)
        .aggregate(total=Sum("fare"))["total"]
        or 0
    )
    total_rides = completed.count()
    cancelled_count = Ride.objects.filter(rider=rider, status="cancelled").count()
    avg_fare = float(completed.aggregate(avg=Avg("fare"))["avg"] or 0)

    daily = _build_daily_chart(completed, "fare", today, days=14)
    weekly = _build_weekly_chart(completed, "fare", today, weeks=8)
    monthly = _build_monthly_chart(completed, "fare", today, months=12)

    # Ride type breakdown
    ride_type_breakdown = list(
        completed.values("ride_type")
        .annotate(count=Count("id"), total_fare=Sum("fare"))
        .order_by("-count")
    )
    for item in ride_type_breakdown:
        item["total_fare"] = float(item["total_fare"] or 0)

    # Recent rides (last 10)
    recent_rides = list(
        completed.order_by("-completed_at")[:10].values(
            "id", "pickup", "destination", "fare", "ride_type",
            "completed_at", "rating", "distance_km"
        )
    )
    for ride in recent_rides:
        ride["fare"] = float(ride["fare"] or 0)
        ride["distance_km"] = float(ride["distance_km"] or 0)
        if ride["completed_at"]:
            ride["completed_at"] = ride["completed_at"].isoformat()

    return Response(
        {
            "summary": {
                "total_spent": total_spent,
                "month_spent": month_spent,
                "total_rides": total_rides,
                "cancelled_rides": cancelled_count,
                "avg_fare": round(avg_fare, 2),
            },
            "charts": {
                "daily_spending": daily,
                "weekly_spending": weekly,
                "monthly_spending": monthly,
            },
            "ride_type_breakdown": ride_type_breakdown,
            "recent_rides": recent_rides,
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Admin / platform analytics
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_analytics(request):
    """
    Platform-wide revenue analytics. Admin only.
    """
    if not request.user.is_staff:
        return Response(
            {"error": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    today = now().date()
    all_rides = Ride.objects.all()
    completed = all_rides.filter(status="completed")
    cancelled = all_rides.filter(status="cancelled")

    # --- KPIs ---
    total_revenue = float(completed.aggregate(total=Sum("fare"))["total"] or 0)
    total_commission = float(completed.aggregate(total=Sum("app_fee"))["total"] or 0)
    total_driver_earnings = float(
        completed.aggregate(total=Sum("driver_earning"))["total"] or 0
    )
    total_rides = all_rides.count()
    completed_count = completed.count()
    cancelled_count = cancelled.count()
    active_count = all_rides.filter(
        status__in=["requested", "driver_arriving", "in_progress"]
    ).count()
    avg_fare = float(completed.aggregate(avg=Avg("fare"))["avg"] or 0)
    completion_rate = round((completed_count / total_rides * 100) if total_rides else 0, 1)
    cancellation_rate = round((cancelled_count / total_rides * 100) if total_rides else 0, 1)

    # --- Revenue charts ---
    daily_revenue = _build_daily_chart(completed, "fare", today, days=14)
    weekly_revenue = _build_weekly_chart(completed, "fare", today, weeks=8)
    monthly_revenue = _build_monthly_chart(completed, "fare", today, months=12)

    # Commission charts
    daily_commission = _build_daily_chart(completed, "app_fee", today, days=14)
    monthly_commission = _build_monthly_chart(completed, "app_fee", today, months=12)

    # Completed rides chart (daily, last 30 days)
    completed_daily = _build_ride_count_chart(completed, today, days=30)
    cancelled_daily = _build_ride_count_chart(cancelled, today, days=30)

    # Ride type breakdown
    ride_type_breakdown = list(
        completed.values("ride_type")
        .annotate(count=Count("id"), revenue=Sum("fare"), commission=Sum("app_fee"))
        .order_by("-count")
    )
    for item in ride_type_breakdown:
        item["revenue"] = float(item["revenue"] or 0)
        item["commission"] = float(item["commission"] or 0)

    # Top earning drivers (top 10)
    top_drivers = list(
        completed.values("driver__id", "driver__first_name", "driver__last_name", "driver__email")
        .annotate(
            total_earned=Sum("driver_earning"),
            ride_count=Count("id"),
            avg_rating=Avg("rating"),
        )
        .order_by("-total_earned")[:10]
    )
    for item in top_drivers:
        item["total_earned"] = float(item["total_earned"] or 0)
        item["avg_rating"] = round(float(item["avg_rating"] or 0), 2)
        item["name"] = (
            f"{item.pop('driver__first_name', '')} {item.pop('driver__last_name', '')}".strip()
            or item.pop("driver__email", "Unknown")
        )
        item.pop("driver__email", None)

    # User growth (new users per month, last 12 months)
    user_growth = []
    month_cursor = today.replace(day=1)
    for months_ago in range(11, -1, -1):
        month = month_cursor
        for _ in range(months_ago):
            month = (month.replace(day=1) - timedelta(days=1)).replace(day=1)
        if month.month == 12:
            next_month = month.replace(year=month.year + 1, month=1, day=1)
        else:
            next_month = month.replace(month=month.month + 1, day=1)
        count = User.objects.filter(
            date_joined__date__gte=month,
            date_joined__date__lt=next_month,
        ).count()
        user_growth.append({"label": month.strftime("%b %y"), "value": count})

    return Response(
        {
            "summary": {
                "total_revenue": total_revenue,
                "total_commission": total_commission,
                "total_driver_earnings": total_driver_earnings,
                "total_rides": total_rides,
                "completed_rides": completed_count,
                "cancelled_rides": cancelled_count,
                "active_rides": active_count,
                "avg_fare": round(avg_fare, 2),
                "completion_rate": completion_rate,
                "cancellation_rate": cancellation_rate,
            },
            "charts": {
                "daily_revenue": daily_revenue,
                "weekly_revenue": weekly_revenue,
                "monthly_revenue": monthly_revenue,
                "daily_commission": daily_commission,
                "monthly_commission": monthly_commission,
                "completed_rides_daily": completed_daily,
                "cancelled_rides_daily": cancelled_daily,
                "user_growth": user_growth,
            },
            "ride_type_breakdown": ride_type_breakdown,
            "top_drivers": top_drivers,
        },
        status=status.HTTP_200_OK,
    )
