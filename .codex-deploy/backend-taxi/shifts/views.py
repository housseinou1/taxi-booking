"""
Driver Shift Management API.
"""
from datetime import date, timedelta
from django.db.models import Sum, Count, Avg, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status

from .models import DriverShift, DriverUnavailableDay, DriverOnlineLog


# ─── Driver endpoints ──────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_shifts(request):
    """Get or create driver shifts."""
    if request.method == "GET":
        shifts = DriverShift.objects.filter(driver=request.user, is_active=True)
        return Response([{
            "id": s.id, "day": s.day_of_week, "day_label": s.get_day_of_week_display(),
            "start_time": s.start_time.strftime("%H:%M"), "end_time": s.end_time.strftime("%H:%M"),
            "is_recurring": s.is_recurring, "city": s.city.name if s.city else None,
        } for s in shifts])

    shift = DriverShift.objects.create(
        driver=request.user,
        city_id=request.data.get("city_id"),
        day_of_week=request.data.get("day_of_week", 0),
        start_time=request.data.get("start_time", "08:00"),
        end_time=request.data.get("end_time", "18:00"),
        is_recurring=request.data.get("is_recurring", True),
    )
    return Response({"id": shift.id, "day": shift.get_day_of_week_display()}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_shift(request, shift_id):
    """Remove a shift."""
    DriverShift.objects.filter(id=shift_id, driver=request.user).delete()
    return Response({"message": "Shift removed."})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_unavailable_days(request):
    """Manage vacation/unavailable days."""
    if request.method == "GET":
        days = DriverUnavailableDay.objects.filter(driver=request.user, date__gte=date.today())
        return Response([{
            "id": d.id, "date": d.date, "reason": d.reason, "note": d.note,
        } for d in days])

    DriverUnavailableDay.objects.get_or_create(
        driver=request.user,
        date=request.data.get("date"),
        defaults={"reason": request.data.get("reason", "personal"), "note": request.data.get("note", "")},
    )
    return Response({"message": "Day marked as unavailable."}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_online_hours(request):
    """Driver's online hours summary."""
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    logs = DriverOnlineLog.objects.filter(driver=request.user)
    today_mins = logs.filter(went_online_at__date=today).aggregate(t=Sum("duration_minutes"))["t"] or 0
    week_mins = logs.filter(went_online_at__date__gte=week_start).aggregate(t=Sum("duration_minutes"))["t"] or 0
    month_mins = logs.filter(went_online_at__date__gte=month_start).aggregate(t=Sum("duration_minutes"))["t"] or 0
    total_mins = logs.aggregate(t=Sum("duration_minutes"))["t"] or 0

    return Response({
        "today_hours": round(today_mins / 60, 1),
        "week_hours": round(week_mins / 60, 1),
        "month_hours": round(month_mins / 60, 1),
        "total_hours": round(total_mins / 60, 1),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def today_shift(request):
    """Get today's shift for the driver."""
    today_dow = timezone.localdate().weekday()
    shifts = DriverShift.objects.filter(driver=request.user, day_of_week=today_dow, is_active=True)
    if not shifts.exists():
        return Response({"today": None, "message": "No shift scheduled today."})
    s = shifts.first()
    return Response({
        "today": {
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "city": s.city.name if s.city else None,
        }
    })


# ─── Admin endpoints ───────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_driver_activity(request):
    """Admin: driver activity and coverage."""
    from taxi.drivers.models import DriverProfile
    from cities.models import City

    today = timezone.localdate()
    today_dow = today.weekday()

    # Active drivers (online now)
    online_drivers = DriverProfile.objects.filter(is_available=True).count()

    # Scheduled today
    scheduled_today = DriverShift.objects.filter(day_of_week=today_dow, is_active=True).values("driver").distinct().count()

    # Absent today
    absent_today = DriverUnavailableDay.objects.filter(date=today).count()

    # City coverage
    city_coverage = (
        DriverProfile.objects.filter(is_available=True)
        .values("user__city__name")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    # Average online hours (last 7 days)
    week_start = today - timedelta(days=7)
    avg_online = DriverOnlineLog.objects.filter(
        went_online_at__date__gte=week_start
    ).values("driver").annotate(
        total=Sum("duration_minutes")
    ).aggregate(avg=Avg("total"))["avg"] or 0

    # Peak hours (last 7 days)
    peak_hours = (
        DriverOnlineLog.objects.filter(went_online_at__date__gte=week_start)
        .extra(select={"hour": "EXTRACT(HOUR FROM went_online_at)"})
        .values("hour")
        .annotate(count=Count("id"))
        .order_by("-count")[:5]
    )

    return Response({
        "online_now": online_drivers,
        "scheduled_today": scheduled_today,
        "absent_today": absent_today,
        "avg_daily_hours": round(avg_online / 60 / 7, 1) if avg_online else 0,
        "city_coverage": [{
            "city": c["user__city__name"] or "Unknown",
            "drivers": c["count"],
        } for c in city_coverage],
        "peak_hours": [{"hour": int(p.get("hour", 0)), "sessions": p["count"]} for p in peak_hours],
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_scheduled_drivers(request):
    """Admin: list of drivers scheduled today."""
    today_dow = timezone.localdate().weekday()
    shifts = DriverShift.objects.filter(
        day_of_week=today_dow, is_active=True
    ).select_related("driver", "city")
    return Response([{
        "driver": f"{s.driver.first_name} {s.driver.last_name}",
        "email": s.driver.email,
        "city": s.city.name if s.city else "Any",
        "start": s.start_time.strftime("%H:%M"),
        "end": s.end_time.strftime("%H:%M"),
    } for s in shifts])
