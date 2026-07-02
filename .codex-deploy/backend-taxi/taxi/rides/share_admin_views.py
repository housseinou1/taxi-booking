"""
Share Ride Admin Analytics API Views.

Provides aggregated metrics and chart data for the admin dashboard.
"""

from datetime import datetime
from decimal import Decimal

from django.db.models import Avg, Count, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from taxi.rides.models import Ride, ShareRideSession


def _parse_date_param(value):
    """Parse a date string (YYYY-MM-DD) into a datetime, or return None."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except (ValueError, TypeError):
        return None


@api_view(["GET"])
@permission_classes([IsAdminUser])
def share_analytics(request):
    """
    GET /api/admin/share/analytics/

    Returns aggregated metrics for Share rides filtered by optional
    date_from and date_to query parameters.

    Response:
    {
        "total_rides": int,
        "total_savings": int,
        "platform_revenue": int,
        "avg_occupancy": float,
        "driver_earnings": int,
        "route_efficiency": float
    }
    """
    date_from = _parse_date_param(request.query_params.get("date_from"))
    date_to = _parse_date_param(request.query_params.get("date_to"))

    # Filter Share rides
    rides_qs = Ride.objects.filter(ride_type="Share")
    sessions_qs = ShareRideSession.objects.all()

    if date_from:
        rides_qs = rides_qs.filter(created_at__gte=date_from)
        sessions_qs = sessions_qs.filter(created_at__gte=date_from)
    if date_to:
        rides_qs = rides_qs.filter(created_at__lte=date_to)
        sessions_qs = sessions_qs.filter(created_at__lte=date_to)

    # Total completed share rides
    completed_rides = rides_qs.filter(status="completed")
    total_rides = completed_rides.count()

    # Total savings (sum of economy_fare - fare for completed rides)
    savings_agg = completed_rides.filter(
        economy_fare__isnull=False
    ).aggregate(
        total_savings=Sum("economy_fare") - Sum("fare")
    )
    total_savings = int(savings_agg["total_savings"] or 0)

    # Platform revenue (sum of platform_commission from completed sessions)
    completed_sessions = sessions_qs.filter(status="completed")
    revenue_agg = completed_sessions.aggregate(
        platform_revenue=Sum("platform_commission")
    )
    platform_revenue = int(revenue_agg["platform_revenue"] or 0)

    # Average occupancy (avg passengers per completed session)
    # We count active rides per session
    occupancy_agg = completed_sessions.annotate(
        ride_count=Count("rides", filter=Q(rides__status="completed"))
    ).aggregate(avg_occupancy=Avg("ride_count"))
    avg_occupancy = round(float(occupancy_agg["avg_occupancy"] or 0), 2)

    # Driver earnings (sum of driver_earnings from completed sessions)
    earnings_agg = completed_sessions.aggregate(
        driver_earnings=Sum("driver_earnings")
    )
    driver_earnings = int(earnings_agg["driver_earnings"] or 0)

    # Route efficiency (average route_similarity_score from completed sessions)
    efficiency_agg = completed_sessions.aggregate(
        route_efficiency=Avg("route_similarity_score")
    )
    route_efficiency = round(float(efficiency_agg["route_efficiency"] or 0), 2)

    return Response({
        "total_rides": total_rides,
        "total_savings": total_savings,
        "platform_revenue": platform_revenue,
        "avg_occupancy": avg_occupancy,
        "driver_earnings": driver_earnings,
        "route_efficiency": route_efficiency,
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def share_analytics_chart(request):
    """
    GET /api/admin/share/analytics/chart/

    Returns Share vs Economy volume comparison data for charting.

    Response:
    {
        "labels": ["2024-01-01", "2024-01-02", ...],
        "share_rides": [5, 8, ...],
        "economy_rides": [12, 15, ...]
    }
    """
    date_from = _parse_date_param(request.query_params.get("date_from"))
    date_to = _parse_date_param(request.query_params.get("date_to"))

    # Base querysets
    rides_qs = Ride.objects.filter(status="completed")

    if date_from:
        rides_qs = rides_qs.filter(created_at__gte=date_from)
    if date_to:
        rides_qs = rides_qs.filter(created_at__lte=date_to)

    # Share rides by date
    share_by_date = (
        rides_qs.filter(ride_type="Share")
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(count=Count("id"))
        .order_by("date")
    )

    # Economy rides by date (Regular type)
    economy_by_date = (
        rides_qs.filter(ride_type="Regular")
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(count=Count("id"))
        .order_by("date")
    )

    # Merge into a unified label set
    all_dates = set()
    share_map = {}
    economy_map = {}

    for entry in share_by_date:
        date_str = entry["date"].strftime("%Y-%m-%d")
        all_dates.add(date_str)
        share_map[date_str] = entry["count"]

    for entry in economy_by_date:
        date_str = entry["date"].strftime("%Y-%m-%d")
        all_dates.add(date_str)
        economy_map[date_str] = entry["count"]

    labels = sorted(all_dates)
    share_rides = [share_map.get(d, 0) for d in labels]
    economy_rides = [economy_map.get(d, 0) for d in labels]

    return Response({
        "labels": labels,
        "share_rides": share_rides,
        "economy_rides": economy_rides,
    })
