"""Trust & Safety Center aggregations (Phase 29)."""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.utils import timezone

from payments.models import RefundRequest
from safety.models import (
    EmergencyAlert,
    SafetyIncident,
    SafetyResponseLog,
    TripLocationPing,
    TripSafetyEvent,
)
from safety.services import ride_snapshot
from security.models import AuditLog, FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket
from taxi.rides.models import Ride
from taxi.rides.services.driver_dispatch_service import haversine_km

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .executive_service import RIDE_ACTIVE
from .models import LaunchAlert, OpsCustomerRecord

User = get_user_model()

OPEN_DB_STATUSES = ["open", "acknowledged", "investigating"]
CLOSED_DB_STATUSES = ["resolved", "dismissed"]

UI_TO_DB_STATUS = {
    "new": "open",
    "assigned": "acknowledged",
    "investigating": "investigating",
    "resolved": "resolved",
    "closed": "dismissed",
}

DB_TO_UI_STATUS = {value: key for key, value in UI_TO_DB_STATUS.items()}

LONG_TRIP_FACTOR = 2.5
LONG_TRIP_MIN_MINUTES = 75
DRIVER_OFFLINE_MINUTES = 10
MULTIPLE_SOS_THRESHOLD = 2
MULTIPLE_SOS_WINDOW_HOURS = 24

MONITORING_EVENT_LABELS = {
    "long_stop": "Long unexpected stop",
    "route_deviation": "Excessive route deviation",
    "long_trip": "Trip taking unusually long",
    "driver_offline": "Driver offline during trip",
    "multiple_sos": "Multiple emergency reports",
}


def map_incident_status(db_status: str) -> str:
    return DB_TO_UI_STATUS.get(db_status, db_status)


def map_ui_status(ui_status: str) -> str | None:
    return UI_TO_DB_STATUS.get(ui_status)


def _priority_label(severity: str) -> str:
    return severity.capitalize() if severity else "Medium"


def _serialize_incident(incident: SafetyIncident) -> dict:
    return {
        "id": incident.id,
        "reference": incident.reference,
        "status": map_incident_status(incident.status),
        "db_status": incident.status,
        "priority": _priority_label(incident.severity),
        "severity": incident.severity,
        "incident_type": incident.incident_type,
        "description": incident.description,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "ride_id": incident.ride_id,
        "delivery_id": incident.delivery_id,
        "reporter": {
            "id": incident.reporter_id,
            "name": incident.reporter.get_full_name() or incident.reporter.email,
            "role": incident.reporter.user_type,
        },
        "reported_user": (
            {
                "id": incident.reported_user_id,
                "name": incident.reported_user.get_full_name() or incident.reported_user.email,
                "role": incident.reported_user.user_type,
            }
            if incident.reported_user
            else None
        ),
        "assigned_to": (
            {
                "id": incident.assigned_to_id,
                "name": incident.assigned_to.get_full_name() or incident.assigned_to.email,
            }
            if incident.assigned_to
            else None
        ),
        "resolution_notes": incident.resolution_notes,
        "acknowledged_at": incident.acknowledged_at.isoformat() if incident.acknowledged_at else None,
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
        "created_at": incident.created_at.isoformat(),
        "updated_at": incident.updated_at.isoformat(),
        "trip_snapshot": incident.trip_snapshot or {},
    }


def build_incident_queue(
    *,
    status: str | None = None,
    priority: str | None = None,
    limit: int = 200,
) -> dict:
    queryset = SafetyIncident.objects.select_related(
        "reporter", "reported_user", "assigned_to", "ride", "delivery"
    ).order_by("-created_at")

    if status:
        db_status = map_ui_status(status) or status
        queryset = queryset.filter(status=db_status)
    if priority:
        queryset = queryset.filter(severity=priority.lower())

    incidents = [_serialize_incident(item) for item in queryset[:limit]]
    counts = {
        row["status"]: row["count"]
        for row in SafetyIncident.objects.values("status").annotate(count=Count("id"))
    }
    summary = {
        "new": counts.get("open", 0),
        "assigned": counts.get("acknowledged", 0),
        "investigating": counts.get("investigating", 0),
        "resolved": counts.get("resolved", 0),
        "closed": counts.get("dismissed", 0),
        "critical_open": SafetyIncident.objects.filter(
            severity="critical", status__in=OPEN_DB_STATUSES
        ).count(),
    }
    return {
        "generated_at": timezone.now().isoformat(),
        "summary": summary,
        "incidents": incidents,
    }


def update_incident(incident_id: int, payload: dict, actor) -> dict | None:
    incident = SafetyIncident.objects.filter(id=incident_id).first()
    if not incident:
        return None

    before_status = incident.status
    if "status" in payload:
        ui_status = payload["status"]
        db_status = map_ui_status(ui_status) or ui_status
        if db_status not in dict(SafetyIncident.STATUS_CHOICES):
            return None
        incident.status = db_status
        if db_status in {"acknowledged", "investigating"} and not incident.acknowledged_at:
            incident.acknowledged_at = timezone.now()
        if db_status in {"resolved", "dismissed"}:
            incident.resolved_at = timezone.now()
    if "priority" in payload and payload["priority"]:
        incident.severity = payload["priority"].lower()
    if "assigned_to_id" in payload:
        operator_id = payload["assigned_to_id"]
        incident.assigned_to = User.objects.filter(id=operator_id).first() if operator_id else None
        if incident.status == "open":
            incident.status = "acknowledged"
            incident.acknowledged_at = timezone.now()
    if "resolution_notes" in payload:
        incident.resolution_notes = str(payload["resolution_notes"] or "").strip()
    if actor and not incident.assigned_to:
        incident.assigned_to = actor

    incident.save()

    if incident.status != before_status:
        action_map = {
            "open": "acknowledged",
            "acknowledged": "acknowledged",
            "investigating": "investigating",
            "resolved": "resolved",
            "dismissed": "dismissed",
        }
        SafetyResponseLog.objects.create(
            incident=incident,
            actor=actor,
            action=action_map.get(incident.status, "investigating"),
            note=incident.resolution_notes,
        )

    invalidate_ops_cache("trust_safety_dashboard")
    invalidate_ops_cache("trust_safety_ceo")
    return _serialize_incident(incident)


def _expected_trip_minutes(ride: Ride) -> float:
    if None not in (ride.pickup_lat, ride.pickup_lng, ride.destination_lat, ride.destination_lng):
        distance_km = haversine_km(
            ride.pickup_lat, ride.pickup_lng, ride.destination_lat, ride.destination_lng
        )
        return max(20.0, (distance_km / 25.0) * 60.0)
    return 35.0


def _latest_driver_ping_minutes(ride: Ride) -> float | None:
    latest = (
        TripLocationPing.objects.filter(ride=ride, user_id=ride.driver_id)
        .order_by("-recorded_at")
        .values_list("recorded_at", flat=True)
        .first()
    )
    if not latest:
        return None
    return (timezone.now() - latest).total_seconds() / 60.0


def scan_safety_monitoring(*, city_id: int | None = None) -> list[dict]:
    """Detect route deviation, long stops, long trips, offline drivers, and multi-SOS patterns."""
    now = timezone.now()
    alerts: list[dict] = []

    rides = Ride.objects.filter(status__in=RIDE_ACTIVE).select_related("driver", "driver__driver_profile", "rider")
    if city_id:
        rides = rides.filter(city_id=city_id)

    for ride in rides[:150]:
        expected_minutes = _expected_trip_minutes(ride)
        elapsed_minutes = (now - ride.created_at).total_seconds() / 60.0
        if ride.status == "in_progress" and elapsed_minutes >= max(
            LONG_TRIP_MIN_MINUTES, expected_minutes * LONG_TRIP_FACTOR
        ):
            alerts.append(
                {
                    "id": f"long-trip-{ride.id}",
                    "event_type": "long_trip",
                    "label": MONITORING_EVENT_LABELS["long_trip"],
                    "severity": "high",
                    "ride_id": ride.id,
                    "message": f"Ride #{ride.id} running {int(elapsed_minutes)} min (expected ~{int(expected_minutes)} min)",
                    "metadata": {"elapsed_minutes": round(elapsed_minutes, 1), "expected_minutes": round(expected_minutes, 1)},
                }
            )

        if ride.driver_id and ride.status in {"in_progress", "driver_arriving", "driver_arrived"}:
            profile = getattr(ride.driver, "driver_profile", None)
            ping_gap = _latest_driver_ping_minutes(ride)
            offline = False
            if ping_gap is not None and ping_gap >= DRIVER_OFFLINE_MINUTES:
                offline = True
            elif profile and not profile.is_available and ride.status == "in_progress":
                offline = True
            if offline:
                alerts.append(
                    {
                        "id": f"driver-offline-{ride.id}",
                        "event_type": "driver_offline",
                        "label": MONITORING_EVENT_LABELS["driver_offline"],
                        "severity": "critical" if ride.status == "in_progress" else "high",
                        "ride_id": ride.id,
                        "driver_id": ride.driver_id,
                        "message": f"Driver offline during ride #{ride.id}",
                        "metadata": {"minutes_since_ping": round(ping_gap, 1) if ping_gap is not None else None},
                    }
                )

    open_events = (
        TripSafetyEvent.objects.filter(status="open")
        .select_related("ride", "user")
        .order_by("-created_at")[:50]
    )
    for event in open_events:
        alerts.append(
            {
                "id": f"event-{event.id}",
                "event_type": event.event_type,
                "label": MONITORING_EVENT_LABELS.get(event.event_type, event.event_type),
                "severity": "high" if event.event_type == "route_deviation" else "medium",
                "ride_id": event.ride_id,
                "message": event.message,
                "metadata": event.metadata,
                "created_at": event.created_at.isoformat(),
            }
        )

    window_start = now - timedelta(hours=MULTIPLE_SOS_WINDOW_HOURS)
    multi_sos = (
        SafetyIncident.objects.filter(incident_type="sos", created_at__gte=window_start)
        .exclude(reported_user__isnull=True)
        .values("reported_user_id")
        .annotate(count=Count("id"))
        .filter(count__gte=MULTIPLE_SOS_THRESHOLD)
    )
    for row in multi_sos:
        user = User.objects.filter(id=row["reported_user_id"]).first()
        alerts.append(
            {
                "id": f"multi-sos-{row['reported_user_id']}",
                "event_type": "multiple_sos",
                "label": MONITORING_EVENT_LABELS["multiple_sos"],
                "severity": "critical",
                "user_id": row["reported_user_id"],
                "message": f"{user.get_full_name() if user else 'User'} involved in {row['count']} SOS reports (24h)",
                "metadata": {"count": row["count"], "window_hours": MULTIPLE_SOS_WINDOW_HOURS},
            }
        )

    return alerts


def build_monitoring_panel(*, city_id: int | None = None) -> dict:
    alerts = scan_safety_monitoring(city_id=city_id)
    by_type: dict[str, int] = {}
    for alert in alerts:
        by_type[alert["event_type"]] = by_type.get(alert["event_type"], 0) + 1
    return {
        "generated_at": timezone.now().isoformat(),
        "alert_count": len(alerts),
        "by_type": by_type,
        "alerts": alerts[:100],
    }


def build_driver_safety_profile(user_id: int) -> dict | None:
    user = User.objects.filter(id=user_id).select_related("driver_profile").first()
    if not user:
        return None
    profile = getattr(user, "driver_profile", None)

    emergencies = SafetyIncident.objects.filter(
        Q(reporter=user) | Q(reported_user=user), incident_type="sos"
    ).order_by("-created_at")[:20]
    complaints = FraudFlag.objects.filter(user=user).order_by("-created_at")[:20]
    tickets = []
    if profile:
        tickets = list(
            SupportTicket.objects.filter(driver=profile).order_by("-created_at")[:10].values(
                "id", "subject", "status", "ticket_type", "created_at"
            )
        )

    ratings = Ride.objects.filter(driver=user, driver_rating__isnull=False).aggregate(
        avg=Avg("driver_rating"), count=Count("id")
    )
    accidents = SafetyIncident.objects.filter(
        reported_user=user, incident_type__in=["safety_incident", "report_driver"]
    ).count()
    suspensions = not user.is_active
    documents = []
    if profile:
        documents = list(
            DriverDocument.objects.filter(driver=profile)
            .order_by("-updated_at")[:15]
            .values("id", "document_type", "status", "expires_at", "updated_at")
        )

    return {
        "user": {
            "id": user.id,
            "name": user.get_full_name() or user.email,
            "email": user.email,
            "phone": user.phone_number,
            "is_active": user.is_active,
        },
        "driver": {
            "status": profile.status if profile else None,
            "average_rating": float(profile.average_rating) if profile else None,
            "total_rides": profile.total_rides if profile else 0,
        },
        "emergency_history": [_serialize_incident(item) for item in emergencies],
        "complaints": [
            {
                "id": flag.id,
                "reason": flag.reason,
                "severity": flag.severity,
                "status": flag.status,
                "created_at": flag.created_at.isoformat(),
            }
            for flag in complaints
        ],
        "ratings": {"average": ratings["avg"], "count": ratings["count"]},
        "accidents": accidents,
        "is_suspended": suspensions,
        "support_tickets": tickets,
        "document_violations": [
            doc
            for doc in documents
            if doc["status"] == "rejected"
            or (doc["expires_at"] and doc["expires_at"] < timezone.now().date())
        ],
        "documents": documents,
    }


def build_rider_safety_profile(user_id: int) -> dict | None:
    user = User.objects.filter(id=user_id).first()
    if not user:
        return None

    record = OpsCustomerRecord.objects.filter(user=user).first()
    since = timezone.now() - timedelta(days=30)
    cancellations = Ride.objects.filter(rider=user, status="cancelled", cancelled_at__gte=since).count()
    abuse_reports = SafetyIncident.objects.filter(
        reported_user=user, incident_type__in=["report_rider", "safety_incident"]
    ).count()
    fraud_reports = FraudFlag.objects.filter(user=user).order_by("-created_at")[:20]
    payment_disputes = RefundRequest.objects.filter(customer=user).order_by("-created_at")[:15]

    return {
        "user": {
            "id": user.id,
            "name": user.get_full_name() or user.email,
            "email": user.email,
            "phone": user.phone_number,
            "is_active": user.is_active,
        },
        "frequent_cancellations": cancellations,
        "abuse_reports": abuse_reports,
        "fraud_reports": [
            {
                "id": flag.id,
                "reason": flag.reason,
                "severity": flag.severity,
                "status": flag.status,
                "created_at": flag.created_at.isoformat(),
            }
            for flag in fraud_reports
        ],
        "payment_disputes": [
            {
                "id": item.id,
                "amount": str(item.amount),
                "status": item.status,
                "reason": item.reason,
                "created_at": item.created_at.isoformat(),
            }
            for item in payment_disputes
        ],
        "blacklist": {
            "is_blacklisted": record.is_blacklisted if record else False,
            "reason": record.blacklist_reason if record else "",
            "until": record.blacklist_until.isoformat() if record and record.blacklist_until else None,
            "complaints_count": record.complaints_count if record else 0,
        },
    }


def _resolution_hours(start, end) -> float | None:
    if not start or not end:
        return None
    return round((end - start).total_seconds() / 3600.0, 2)


def _compute_safety_score() -> int:
    open_critical = SafetyIncident.objects.filter(severity="critical", status__in=OPEN_DB_STATUSES).count()
    open_total = SafetyIncident.objects.filter(status__in=OPEN_DB_STATUSES).count()
    sos_24h = SafetyIncident.objects.filter(
        incident_type="sos", created_at__gte=timezone.now() - timedelta(hours=24)
    ).count()
    score = 100
    score -= min(30, open_critical * 8)
    score -= min(25, open_total * 2)
    score -= min(20, sos_24h * 5)
    return max(0, score)


def build_ceo_safety_dashboard(*, city_id: int | None = None) -> dict:
    now = timezone.now()
    resolved = SafetyIncident.objects.filter(
        status="resolved", resolved_at__isnull=False, acknowledged_at__isnull=False
    ).order_by("-resolved_at")[:100]
    resolution_samples = [
        _resolution_hours(item.acknowledged_at, item.resolved_at)
        for item in resolved
        if _resolution_hours(item.acknowledged_at, item.resolved_at) is not None
    ]
    avg_resolution_hours = (
        round(sum(resolution_samples) / len(resolution_samples), 2) if resolution_samples else None
    )

    rides = Ride.objects.filter(status__in=RIDE_ACTIVE)
    if city_id:
        rides = rides.filter(city_id=city_id)
    hotspot_map: dict[str, dict] = {}
    for ride in rides.select_related("city")[:200]:
        if ride.pickup_lat is None or ride.pickup_lng is None:
            continue
        key = f"{round(ride.pickup_lat, 2)}:{round(ride.pickup_lng, 2)}"
        bucket = hotspot_map.setdefault(key, {"lat": ride.pickup_lat, "lng": ride.pickup_lng, "rides": 0, "sos": 0})
        bucket["rides"] += 1
    for incident in SafetyIncident.objects.filter(
        incident_type="sos", latitude__isnull=False, created_at__gte=now - timedelta(days=7)
    )[:200]:
        key = f"{round(incident.latitude, 2)}:{round(incident.longitude, 2)}"
        bucket = hotspot_map.setdefault(
            key, {"lat": incident.latitude, "lng": incident.longitude, "rides": 0, "sos": 0}
        )
        bucket["sos"] += 1

    high_risk_areas = sorted(
        hotspot_map.values(), key=lambda item: (item["sos"], item["rides"]), reverse=True
    )[:10]

    repeat_offenders = []
    for row in (
        SafetyIncident.objects.filter(reported_user__isnull=False)
        .values("reported_user_id")
        .annotate(count=Count("id"))
        .filter(count__gte=2)
        .order_by("-count")[:10]
    ):
        user = User.objects.filter(id=row["reported_user_id"]).first()
        if user:
            repeat_offenders.append(
                {
                    "user_id": user.id,
                    "name": user.get_full_name() or user.email,
                    "role": user.user_type,
                    "incident_count": row["count"],
                }
            )

    return {
        "generated_at": now.isoformat(),
        "safety_score": _compute_safety_score(),
        "open_incidents": SafetyIncident.objects.filter(status__in=OPEN_DB_STATUSES).count(),
        "emergency_alerts_24h": SafetyIncident.objects.filter(
            incident_type="sos", created_at__gte=now - timedelta(hours=24)
        ).count(),
        "active_launch_alerts": LaunchAlert.objects.filter(
            alert_type="sos_event", status="active"
        ).count(),
        "avg_resolution_hours": avg_resolution_hours,
        "high_risk_areas": high_risk_areas,
        "repeat_offenders": repeat_offenders,
        "monitoring_alerts": len(scan_safety_monitoring(city_id=city_id)),
    }


def _incident_stats(since) -> dict:
    qs = SafetyIncident.objects.filter(created_at__gte=since)
    return {
        "total": qs.count(),
        "sos": qs.filter(incident_type="sos").count(),
        "critical": qs.filter(severity="critical").count(),
        "resolved": qs.filter(status="resolved").count(),
        "closed": qs.filter(status="dismissed").count(),
        "open": qs.filter(status__in=OPEN_DB_STATUSES).count(),
    }


def build_daily_safety_report(*, city_id: int | None = None) -> dict:
    since = timezone.now() - timedelta(days=1)
    stats = _incident_stats(since)
    monitoring = build_monitoring_panel(city_id=city_id)
    return {
        "report_type": "daily_safety",
        "period_start": since.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "stats": stats,
        "monitoring_summary": monitoring["by_type"],
        "recent_sos": [
            _serialize_incident(item)
            for item in SafetyIncident.objects.filter(incident_type="sos", created_at__gte=since).order_by(
                "-created_at"
            )[:20]
        ],
    }


def build_weekly_incident_report(*, city_id: int | None = None) -> dict:
    since = timezone.now() - timedelta(days=7)
    stats = _incident_stats(since)
    by_type = list(
        SafetyIncident.objects.filter(created_at__gte=since)
        .values("incident_type")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return {
        "report_type": "weekly_incident",
        "period_start": since.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "stats": stats,
        "by_type": by_type,
        "queue_summary": build_incident_queue(limit=50)["summary"],
        "monitoring_alerts": build_monitoring_panel(city_id=city_id)["alert_count"],
    }


def build_monthly_trust_report(*, city_id: int | None = None) -> dict:
    since = timezone.now() - timedelta(days=30)
    stats = _incident_stats(since)
    fraud_open = FraudFlag.objects.filter(status="open").count()
    blacklisted = OpsCustomerRecord.objects.filter(is_blacklisted=True).count()
    suspended_drivers = DriverProfile.objects.filter(user__is_active=False).count()
    return {
        "report_type": "monthly_trust",
        "period_start": since.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "stats": stats,
        "fraud_flags_open": fraud_open,
        "blacklisted_users": blacklisted,
        "suspended_drivers": suspended_drivers,
        "safety_score": _compute_safety_score(),
        "ceo": build_ceo_safety_dashboard(city_id=city_id),
    }


def build_safety_kpi_dashboard(*, city_id: int | None = None) -> dict:
    now = timezone.now()
    return {
        "generated_at": now.isoformat(),
        "safety_score": _compute_safety_score(),
        "last_24h": _incident_stats(now - timedelta(hours=24)),
        "last_7d": _incident_stats(now - timedelta(days=7)),
        "last_30d": _incident_stats(now - timedelta(days=30)),
        "emergency_dispatches_24h": EmergencyAlert.objects.filter(
            dispatched_at__gte=now - timedelta(hours=24)
        ).count(),
        "open_monitoring_events": TripSafetyEvent.objects.filter(status="open").count(),
        "audit_events_24h": AuditLog.objects.filter(
            created_at__gte=now - timedelta(hours=24),
            action__in=["verification_event", "admin_action"],
        ).count(),
    }


def get_trust_safety_audit_trail(limit: int = 50) -> list[dict]:
    logs = AuditLog.objects.select_related("actor").filter(
        action__in=["verification_event", "admin_action"]
    ).order_by("-created_at")[:limit]
    return [
        {
            "id": log.id,
            "action": log.action,
            "summary": log.summary,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "actor": (log.actor.get_full_name() or log.actor.email) if log.actor else "",
            "created_at": log.created_at.isoformat(),
            "details": log.details or {},
        }
        for log in logs
    ]


def build_trust_safety_dashboard(*, city_id: int | None = None) -> dict:
    def _builder():
        active_rides = Ride.objects.filter(status__in=RIDE_ACTIVE)
        if city_id:
            active_rides = active_rides.filter(city_id=city_id)
        active_trips = []
        sos_by_ride = {
            row["ride_id"]: row["count"]
            for row in SafetyIncident.objects.filter(
                incident_type="sos", status__in=OPEN_DB_STATUSES, ride_id__isnull=False
            )
            .values("ride_id")
            .annotate(count=Count("id"))
        }
        for ride in active_rides.select_related("driver", "driver__driver_profile", "rider")[:80]:
            snapshot = ride_snapshot(ride)
            snapshot["active_sos_count"] = sos_by_ride.get(ride.id, 0)
            active_trips.append(snapshot)

        return {
            "generated_at": timezone.now().isoformat(),
            "safety_score": _compute_safety_score(),
            "incident_queue": build_incident_queue(limit=100),
            "monitoring": build_monitoring_panel(city_id=city_id),
            "ceo_preview": build_ceo_safety_dashboard(city_id=city_id),
            "kpi": build_safety_kpi_dashboard(city_id=city_id),
            "active_trips": active_trips,
            "recent_emergencies": [
                _serialize_incident(item)
                for item in SafetyIncident.objects.filter(incident_type="sos")
                .select_related("reporter", "reported_user")
                .order_by("-created_at")[:15]
            ],
            "audit_trail": get_trust_safety_audit_trail(limit=30),
        }

    return cached_ops_call("trust_safety_dashboard", _builder, city_id=city_id)


def notify_sos_to_operations(incident: SafetyIncident) -> None:
    """Create CEO/Launch alert and broadcast to Operations Center."""
    LaunchAlert.objects.create(
        alert_type="sos_event",
        severity="critical",
        title=f"Emergency SOS {incident.reference}",
        message=incident.description[:500] or "SOS triggered — immediate response required.",
        metadata={
            "incident_id": incident.id,
            "reference": incident.reference,
            "ride_id": incident.ride_id,
            "delivery_id": incident.delivery_id,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
        },
    )
    try:
        from .operations_center_broadcast import broadcast_safety_alert

        broadcast_safety_alert(
            {
                "type": "safety_sos",
                "incident_id": incident.id,
                "reference": incident.reference,
                "ride_id": incident.ride_id,
                "delivery_id": incident.delivery_id,
                "latitude": incident.latitude,
                "longitude": incident.longitude,
            }
        )
    except Exception:
        pass
    invalidate_ops_cache("trust_safety_dashboard")
    invalidate_ops_cache("trust_safety_ceo")
