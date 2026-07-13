"""Admin endpoints for smart-dispatch visibility."""

from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from taxi.rides.models import DispatchOfferLog, Ride


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_dispatch_dashboard(request):
    """
    GET /rides/analytics/admin/dispatch/

    Active searches, recent offers, no-driver rides, assignment timing.
    """
    now = timezone.now()
    active_searching = Ride.objects.filter(
        status="requested",
        driver__isnull=True,
        dispatch_status__in=["searching", "offered"],
    ).select_related("rider", "offered_driver")[:50]

    no_driver = Ride.objects.filter(
        status="requested",
        dispatch_status="no_driver_found",
    ).order_by("-id")[:30]

    recent_logs = (
        DispatchOfferLog.objects.select_related("ride", "driver")
        .order_by("-created_at")[:100]
    )

    since = now - timezone.timedelta(hours=24)
    day_logs = DispatchOfferLog.objects.filter(created_at__gte=since)
    counts = day_logs.values("result").annotate(total=Count("id"))
    by_result = {row["result"]: row["total"] for row in counts}

    assigned = Ride.objects.filter(
        status__in=["driver_arriving", "driver_arrived", "in_progress", "completed"],
        search_started_at__isnull=False,
        created_at__gte=since,
    ).exclude(driver__isnull=True)

    assignment_seconds = []
    for ride in assigned[:200]:
        # Prefer first accepted log; else offer_sent / created heuristic
        accepted = (
            ride.dispatch_logs.filter(result="accepted").order_by("created_at").first()
        )
        end = accepted.created_at if accepted else ride.offer_sent_at
        start = ride.search_started_at or ride.created_at
        if end and start:
            assignment_seconds.append(max((end - start).total_seconds(), 0))

    avg_assignment = (
        round(sum(assignment_seconds) / len(assignment_seconds), 1)
        if assignment_seconds
        else None
    )

    def _ride_row(ride):
        return {
            "ride_id": ride.id,
            "status": ride.status,
            "dispatch_status": ride.dispatch_status,
            "dispatch_round": ride.dispatch_round,
            "search_radius_km": ride.search_radius_km,
            "offered_driver_id": ride.offered_driver_id,
            "rider_id": ride.rider_id,
            "pickup": ride.pickup,
            "created_at": ride.created_at.isoformat() if ride.created_at else None,
            "search_started_at": (
                ride.search_started_at.isoformat() if ride.search_started_at else None
            ),
        }

    def _log_row(log):
        return {
            "id": log.id,
            "ride_id": log.ride_id,
            "driver_id": log.driver_id,
            "dispatch_round": log.dispatch_round,
            "search_radius_km": log.search_radius_km,
            "distance_km": log.distance_km,
            "eta_minutes": log.eta_minutes,
            "score": log.score,
            "score_breakdown": log.score_breakdown,
            "result": log.result,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }

    return Response(
        {
            "active_searches": [_ride_row(r) for r in active_searching],
            "no_driver_found": [_ride_row(r) for r in no_driver],
            "recent_offers": [_log_row(l) for l in recent_logs],
            "last_24h": {
                "by_result": by_result,
                "offered": by_result.get("offered", 0),
                "accepted": by_result.get("accepted", 0),
                "declined": by_result.get("declined", 0),
                "expired": by_result.get("expired", 0),
                "no_driver": by_result.get("no_driver", 0),
                "avg_assignment_seconds": avg_assignment,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_dispatch_ride_history(request, ride_id):
    """GET /rides/analytics/admin/dispatch/<ride_id>/"""
    ride = Ride.objects.filter(pk=ride_id).first()
    if not ride:
        return Response({"detail": "Ride not found."}, status=404)

    logs = (
        DispatchOfferLog.objects.filter(ride_id=ride_id)
        .select_related("driver")
        .order_by("created_at")
    )
    return Response(
        {
            "ride_id": ride.id,
            "status": ride.status,
            "dispatch_status": ride.dispatch_status,
            "dispatch_round": ride.dispatch_round,
            "search_radius_km": ride.search_radius_km,
            "driver_id": ride.driver_id,
            "offered_driver_id": ride.offered_driver_id,
            "declined_driver_ids": ride.declined_driver_ids,
            "search_started_at": (
                ride.search_started_at.isoformat() if ride.search_started_at else None
            ),
            "logs": [
                {
                    "id": log.id,
                    "driver_id": log.driver_id,
                    "driver_email": log.driver.email if log.driver else None,
                    "dispatch_round": log.dispatch_round,
                    "search_radius_km": log.search_radius_km,
                    "distance_km": log.distance_km,
                    "eta_minutes": log.eta_minutes,
                    "score": log.score,
                    "score_breakdown": log.score_breakdown,
                    "result": log.result,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in logs
            ],
        }
    )
