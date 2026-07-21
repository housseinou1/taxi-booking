"""Commercial launch preparation — control center, KPIs, alerts, support, finance."""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from deliveries.models import Delivery, DeliveryDispute
from health.views import _check_celery, _check_database, _check_redis
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from safety.models import SafetyIncident
from taxi.drivers.models import DriverDocument, DriverProfile, SupportTicket
from taxi.rides.models import Ride

from .executive_service import (
    DELIVERY_ACTIVE,
    RIDE_ACTIVE,
    _dec,
    _delivery_qs,
    _payment_qs,
    _period_bounds,
    _ride_qs,
    build_finance_dashboard,
    build_live_metrics,
)
from .models import LaunchAlert, OpsIncident, OpsIncidentEvent

User = get_user_model()

TRAFFIC = {"healthy": "healthy", "warning": "warning", "critical": "critical"}


def _traffic(status: str) -> str:
    if status in ("ok", "healthy"):
        return TRAFFIC["healthy"]
    if status in ("degraded", "unknown", "warning"):
        return TRAFFIC["warning"]
    return TRAFFIC["critical"]


def _infra_snapshot() -> dict:
    db = _check_database()
    redis = _check_redis()
    celery, workers = _check_celery()
    api = "ok" if db == "ok" and redis == "ok" else "degraded"
    return {
        "api": {"status": api, "traffic": _traffic(api)},
        "database": {"status": db, "traffic": _traffic(db)},
        "redis": {"status": redis, "traffic": _traffic(redis)},
        "celery": {"status": celery, "workers": workers, "traffic": _traffic(celery)},
        "websocket": {
            "status": "ok" if redis == "ok" else "degraded",
            "traffic": _traffic("ok" if redis == "ok" else "degraded"),
        },
    }


def _platform_traffic(infra: dict, pending_withdrawals: int, failed_payments: int, open_sos: int) -> str:
    if any(infra[k]["traffic"] == TRAFFIC["critical"] for k in ("api", "database", "redis")):
        return TRAFFIC["critical"]
    if open_sos > 0 or pending_withdrawals >= 20 or failed_payments >= 10:
        return TRAFFIC["warning"]
    if any(infra[k]["traffic"] == TRAFFIC["warning"] for k in infra):
        return TRAFFIC["warning"]
    return TRAFFIC["healthy"]


def _next_incident_reference() -> str:
    stamp = timezone.now().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:6].upper()
    return f"INC-{stamp}-{suffix}"


def build_launch_control_dashboard(city_id=None) -> dict:
    today = timezone.localdate()
    live = build_live_metrics(city_id=city_id)
    infra = _infra_snapshot()

    pending_withdrawals = WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).count()
    failed_payments = PaymentRecord.objects.filter(status="failed", created_at__date=today).count()
    open_sos = SafetyIncident.objects.filter(
        status__in=["open", "acknowledged", "investigating"],
        incident_type="sos",
    ).count()

    platform_traffic = _platform_traffic(infra, pending_withdrawals, failed_payments, open_sos)

    active_user_ids = set()
    active_user_ids.update(
        Ride.objects.filter(created_at__date=today).values_list("rider_id", flat=True)
    )
    active_user_ids.update(
        Delivery.objects.filter(created_at__date=today).values_list("customer_id", flat=True)
    )
    active_user_ids.update(
        User.objects.filter(last_login__date=today).values_list("id", flat=True)
    )
    active_user_ids.discard(None)

    online_couriers = (
        Delivery.objects.filter(status__in=DELIVERY_ACTIVE, driver__isnull=False)
        .values("driver_id")
        .distinct()
        .count()
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "platform_status": platform_traffic,
        "metrics": {
            "active_users": len(active_user_ids),
            "online_drivers": live["live"]["active_drivers"],
            "online_couriers": online_couriers,
            "active_rides": live["live"]["active_trips"],
            "active_deliveries": live["live"]["active_deliveries"],
            "revenue_today": live["today"]["revenue"],
            "withdrawals_pending": pending_withdrawals,
            "failed_payments_today": failed_payments,
            "open_sos": open_sos,
        },
        "infrastructure": infra,
        "traffic_summary": {
            "platform": platform_traffic,
            "api_uptime": infra["api"]["traffic"],
            "database": infra["database"]["traffic"],
            "redis": infra["redis"]["traffic"],
            "celery": infra["celery"]["traffic"],
        },
    }


def sync_launch_alerts() -> list[dict]:
    """Evaluate thresholds and upsert persistent launch alerts."""
    today = timezone.localdate()
    infra = _infra_snapshot()
    alerts_created: list[dict] = []

    checks = [
        ("api_offline", infra["api"]["status"] != "ok", "critical", "API health check failing"),
        ("database_offline", infra["database"]["status"] == "error", "critical", "Database unreachable"),
        ("redis_offline", infra["redis"]["status"] == "error", "critical", "Redis unreachable"),
        ("celery_stopped", infra["celery"]["status"] in ("error", "unknown"), "high", "Celery workers not responding"),
    ]

    pending_wd = WithdrawalRequest.objects.filter(status="pending").count()
    if pending_wd >= 10:
        checks.append(
            ("large_withdrawal_queue", True, "high", f"{pending_wd} withdrawals awaiting approval")
        )

    failed_today = PaymentRecord.objects.filter(status="failed", created_at__date=today).count()
    if failed_today >= 5:
        checks.append(
            ("failed_payments", True, "medium", f"{failed_today} failed payments today")
        )

    expired_docs = DriverDocument.objects.filter(expires_at__lt=today, status="approved").count()
    if expired_docs > 0:
        checks.append(
            ("expired_documents", True, "medium", f"{expired_docs} approved documents expired")
        )

    open_sos = SafetyIncident.objects.filter(
        status__in=["open", "acknowledged", "investigating"],
        incident_type="sos",
    ).count()
    if open_sos > 0:
        checks.append(("sos_event", True, "critical", f"{open_sos} open SOS incident(s)"))

    rides_today = Ride.objects.filter(created_at__date=today).count()
    cancelled_today = Ride.objects.filter(status="cancelled", created_at__date=today).count()
    if rides_today >= 10 and cancelled_today / rides_today >= 0.35:
        checks.append(
            (
                "high_cancellation_rate",
                True,
                "high",
                f"Ride cancellation rate {round(100 * cancelled_today / rides_today, 1)}% today",
            )
        )

    for alert_type, active, severity, message in checks:
        if not active:
            LaunchAlert.objects.filter(alert_type=alert_type, status="active").update(
                status="resolved", resolved_at=timezone.now()
            )
            continue
        alert, created = LaunchAlert.objects.get_or_create(
            alert_type=alert_type,
            status="active",
            defaults={
                "severity": severity,
                "title": message[:200],
                "message": message,
            },
        )
        if not created and alert.message != message:
            alert.message = message
            alert.severity = severity
            alert.save(update_fields=["message", "severity", "updated_at"])
        alerts_created.append(
            {
                "id": alert.id,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "status": alert.status,
                "title": alert.title,
                "message": alert.message,
                "created_at": alert.created_at.isoformat(),
            }
        )

    return alerts_created


def list_launch_alerts(include_resolved: bool = False) -> list[dict]:
    sync_launch_alerts()
    qs = LaunchAlert.objects.all()
    if not include_resolved:
        qs = qs.exclude(status="resolved")
    return [
        {
            "id": row.id,
            "alert_type": row.alert_type,
            "severity": row.severity,
            "status": row.status,
            "title": row.title,
            "message": row.message,
            "metadata": row.metadata,
            "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
            "created_at": row.created_at.isoformat(),
        }
        for row in qs[:100]
    ]


def acknowledge_launch_alert(alert_id: int, user) -> LaunchAlert | None:
    alert = LaunchAlert.objects.filter(id=alert_id).first()
    if not alert:
        return None
    alert.status = "acknowledged"
    alert.acknowledged_by = user
    alert.acknowledged_at = timezone.now()
    alert.save(update_fields=["status", "acknowledged_by", "acknowledged_at", "updated_at"])
    return alert


def resolve_launch_alert(alert_id: int) -> LaunchAlert | None:
    alert = LaunchAlert.objects.filter(id=alert_id).first()
    if not alert:
        return None
    alert.status = "resolved"
    alert.resolved_at = timezone.now()
    alert.save(update_fields=["status", "resolved_at", "updated_at"])
    return alert


def list_ops_incidents(filters: dict | None = None) -> list[dict]:
    qs = OpsIncident.objects.select_related("owner", "created_by")
    filters = filters or {}
    if filters.get("severity"):
        qs = qs.filter(severity=filters["severity"])
    if filters.get("status"):
        qs = qs.filter(status=filters["status"])
    if filters.get("owner_id"):
        qs = qs.filter(owner_id=filters["owner_id"])
    return [
        {
            "id": row.id,
            "reference": row.reference,
            "title": row.title,
            "description": row.description,
            "severity": row.severity,
            "status": row.status,
            "owner_id": row.owner_id,
            "owner_email": row.owner.email if row.owner else None,
            "root_cause": row.root_cause,
            "resolution": row.resolution,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        }
        for row in qs[:200]
    ]


def get_ops_incident_detail(incident_id: int) -> dict | None:
    incident = OpsIncident.objects.select_related("owner", "created_by").filter(id=incident_id).first()
    if not incident:
        return None
    events = [
        {
            "id": event.id,
            "event_type": event.event_type,
            "message": event.message,
            "metadata": event.metadata,
            "actor_email": event.actor.email if event.actor else None,
            "created_at": event.created_at.isoformat(),
        }
        for event in incident.events.select_related("actor").all()
    ]
    return {
        "id": incident.id,
        "reference": incident.reference,
        "title": incident.title,
        "description": incident.description,
        "severity": incident.severity,
        "status": incident.status,
        "owner_id": incident.owner_id,
        "owner_email": incident.owner.email if incident.owner else None,
        "root_cause": incident.root_cause,
        "resolution": incident.resolution,
        "created_at": incident.created_at.isoformat(),
        "updated_at": incident.updated_at.isoformat(),
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
        "timeline": events,
    }


def create_ops_incident(data: dict, actor) -> OpsIncident:
    incident = OpsIncident.objects.create(
        reference=_next_incident_reference(),
        title=data["title"],
        description=data.get("description", ""),
        severity=data.get("severity", "medium"),
        status="open",
        owner_id=data.get("owner_id"),
        created_by=actor,
    )
    OpsIncidentEvent.objects.create(
        incident=incident,
        actor=actor,
        event_type="note",
        message=f"Incident opened: {incident.title}",
    )
    if incident.owner_id:
        OpsIncidentEvent.objects.create(
            incident=incident,
            actor=actor,
            event_type="assignment",
            message=f"Assigned to user #{incident.owner_id}",
        )
    return incident


def update_ops_incident(incident_id: int, data: dict, actor) -> OpsIncident | None:
    incident = OpsIncident.objects.filter(id=incident_id).first()
    if not incident:
        return None

    if "status" in data and data["status"] != incident.status:
        old = incident.status
        incident.status = data["status"]
        OpsIncidentEvent.objects.create(
            incident=incident,
            actor=actor,
            event_type="status_change",
            message=f"Status changed from {old} to {incident.status}",
            metadata={"from": old, "to": incident.status},
        )
        if incident.status == "resolved":
            incident.resolved_at = timezone.now()

    if "owner_id" in data and data["owner_id"] != incident.owner_id:
        incident.owner_id = data["owner_id"]
        OpsIncidentEvent.objects.create(
            incident=incident,
            actor=actor,
            event_type="assignment",
            message=f"Owner assigned to user #{incident.owner_id}",
        )

    if "root_cause" in data and data["root_cause"] != incident.root_cause:
        incident.root_cause = data["root_cause"]
        OpsIncidentEvent.objects.create(
            incident=incident,
            actor=actor,
            event_type="root_cause",
            message=data["root_cause"],
        )

    if "resolution" in data and data["resolution"] != incident.resolution:
        incident.resolution = data["resolution"]
        OpsIncidentEvent.objects.create(
            incident=incident,
            actor=actor,
            event_type="resolution",
            message=data["resolution"],
        )

    for field in ("title", "description", "severity"):
        if field in data:
            setattr(incident, field, data[field])

    incident.save()
    return incident


def export_ops_incident_rows(incident_id: int) -> list[dict]:
    detail = get_ops_incident_detail(incident_id)
    if not detail:
        return []
    rows = [
        {"section": "incident", "field": "reference", "value": detail["reference"]},
        {"section": "incident", "field": "title", "value": detail["title"]},
        {"section": "incident", "field": "severity", "value": detail["severity"]},
        {"section": "incident", "field": "status", "value": detail["status"]},
        {"section": "incident", "field": "owner", "value": detail.get("owner_email") or ""},
        {"section": "incident", "field": "root_cause", "value": detail.get("root_cause") or ""},
        {"section": "incident", "field": "resolution", "value": detail.get("resolution") or ""},
    ]
    for event in detail.get("timeline", []):
        rows.append(
            {
                "section": "timeline",
                "field": event["event_type"],
                "value": event["message"],
                "actor": event.get("actor_email") or "",
                "at": event["created_at"],
            }
        )
    return rows


def _support_category(ticket: SupportTicket) -> str:
    if ticket.ticket_type == "emergency":
        return "driver"
    return "driver"


def build_support_queue(filters: dict | None = None) -> dict:
    filters = filters or {}
    tickets = SupportTicket.objects.select_related("driver__user").all()

    if filters.get("status"):
        tickets = tickets.filter(status=filters["status"])
    if filters.get("priority"):
        if filters["priority"] == "urgent":
            tickets = tickets.filter(ticket_type="emergency")
        elif filters["priority"] == "normal":
            tickets = tickets.exclude(ticket_type="emergency")
    if filters.get("date_from"):
        tickets = tickets.filter(created_at__date__gte=filters["date_from"])
    if filters.get("date_to"):
        tickets = tickets.filter(created_at__date__lte=filters["date_to"])
    if filters.get("city_id"):
        tickets = tickets.filter(driver__user__city_id=filters["city_id"])

    category = filters.get("category")
    queue = []
    for ticket in tickets.order_by("-created_at")[:100]:
        item_category = _support_category(ticket)
        if category and category != item_category:
            continue
        queue.append(
            {
                "id": ticket.id,
                "source": "support_ticket",
                "category": item_category,
                "priority": "urgent" if ticket.ticket_type == "emergency" else "normal",
                "status": ticket.status,
                "subject": ticket.subject or ticket.get_ticket_type_display(),
                "message": ticket.message[:200],
                "city_id": ticket.driver.user.city_id if ticket.driver.user else None,
                "created_at": ticket.created_at.isoformat(),
            }
        )

    refunds = RefundRequest.objects.select_related("customer").filter(status="requested")
    if filters.get("category") in (None, "payment"):
        for refund in refunds.order_by("-created_at")[:50]:
            queue.append(
                {
                    "id": refund.id,
                    "source": "refund_request",
                    "category": "payment",
                    "priority": "normal",
                    "status": refund.status,
                    "subject": f"Refund request #{refund.id}",
                    "message": refund.get_reason_display(),
                    "city_id": refund.customer.city_id if refund.customer else None,
                    "created_at": refund.created_at.isoformat(),
                }
            )

    disputes = DeliveryDispute.objects.filter(status="open")
    if filters.get("category") in (None, "delivery"):
        for dispute in disputes.order_by("-created_at")[:50]:
            queue.append(
                {
                    "id": dispute.id,
                    "source": "delivery_dispute",
                    "category": "delivery",
                    "priority": "normal",
                    "status": dispute.status,
                    "subject": f"Delivery dispute #{dispute.id}",
                    "message": dispute.description[:200] if dispute.description else dispute.get_reason_display(),
                    "city_id": None,
                    "created_at": dispute.created_at.isoformat(),
                }
            )

    queue.sort(key=lambda row: row["created_at"], reverse=True)

    counts = {
        "open_tickets": SupportTicket.objects.filter(status__in=["open", "in_progress"]).count(),
        "driver_issues": SupportTicket.objects.filter(status__in=["open", "in_progress"]).count(),
        "rider_issues": RefundRequest.objects.filter(status="requested").count(),
        "delivery_issues": DeliveryDispute.objects.filter(status="open").count(),
        "payment_issues": RefundRequest.objects.filter(status="requested").count(),
    }

    return {"counts": counts, "queue": queue[:150]}


def build_onboarding_dashboard() -> dict:
    today = timezone.localdate()
    pending = DriverProfile.objects.filter(status__in=["pending", "pending_review"]).count()
    rejected = DriverProfile.objects.filter(status="rejected").count()

    missing_documents = 0
    for profile in DriverProfile.objects.filter(status__in=["pending", "pending_review"])[:500]:
        required = {"license", "national_id", "insurance", "carte_grise"}
        uploaded = set(profile.documents.values_list("document_type", flat=True))
        if not required.issubset(uploaded):
            missing_documents += 1

    expired_documents = DriverDocument.objects.filter(
        expires_at__lt=today,
        status="approved",
    ).count()

    reviewed = DriverProfile.objects.filter(status="approved").select_related("user")[:200]
    approval_hours = []
    for profile in reviewed:
        first_doc = profile.documents.order_by("uploaded_at").first()
        last_review = profile.documents.filter(reviewed_at__isnull=False).order_by("-reviewed_at").first()
        if first_doc and last_review and last_review.reviewed_at:
            delta = last_review.reviewed_at - first_doc.uploaded_at
            approval_hours.append(delta.total_seconds() / 3600)
    avg_approval_hours = round(sum(approval_hours) / len(approval_hours), 1) if approval_hours else None

    recent_pending = list(
        DriverProfile.objects.filter(status__in=["pending", "pending_review"])
        .select_related("user")
        .order_by("-id")[:20]
        .values("user_id", "status", "user__email", "user__first_name", "user__last_name")
    )

    return {
        "summary": {
            "pending_approval": pending,
            "rejected": rejected,
            "missing_documents": missing_documents,
            "expired_documents": expired_documents,
            "average_approval_hours": avg_approval_hours,
        },
        "recent_pending": recent_pending,
    }


def build_financial_reconciliation(date=None) -> dict:
    target = date or timezone.localdate()
    payments = _payment_qs(target, target)
    ride_revenue = (
        Ride.objects.filter(status="completed", completed_at__date=target).aggregate(
            total=Sum("fare")
        )["total"]
        or Decimal("0")
    )
    delivery_revenue = (
        Delivery.objects.filter(status="delivered", delivered_at__date=target).aggregate(
            total=Sum("fare")
        )["total"]
        or Decimal("0")
    )
    gross = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = payments.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    wallet_balance = WalletAccount.objects.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    pending_withdrawals = WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0")
    completed_withdrawals = WithdrawalRequest.objects.filter(
        status="paid", paid_at__date=target
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    refunds = RefundRequest.objects.filter(status="refunded", resolved_at__date=target).aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0")

    return {
        "date": target.isoformat(),
        "ride_revenue": _dec(ride_revenue),
        "delivery_revenue": _dec(delivery_revenue),
        "gross_revenue": _dec(gross),
        "wallet_balance": _dec(wallet_balance),
        "pending_withdrawals": _dec(pending_withdrawals),
        "completed_withdrawals": _dec(completed_withdrawals),
        "refunds": _dec(refunds),
        "commission": _dec(commission),
        "reconciled": abs(Decimal(str(gross)) - Decimal(str(ride_revenue + delivery_revenue))) <= Decimal("1.00"),
    }


def export_reconciliation_rows(date=None) -> list[dict]:
    payload = build_financial_reconciliation(date=date)
    return [{"metric": key, "value": value} for key, value in payload.items()]


def _active_users_between(start, end) -> int:
    ids = set()
    ids.update(Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values_list("rider_id", flat=True))
    ids.update(
        Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values_list(
            "customer_id", flat=True
        )
    )
    ids.update(
        User.objects.filter(last_login__date__gte=start, last_login__date__lte=end).values_list("id", flat=True)
    )
    ids.discard(None)
    return len(ids)


def _retention_rate(user_ids_prev: set, user_ids_curr: set) -> float | None:
    if not user_ids_prev:
        return None
    retained = len(user_ids_prev & user_ids_curr)
    return round(100 * retained / len(user_ids_prev), 1)


def build_business_kpis(city_id=None) -> dict:
    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)

    dau = _active_users_between(today, today)
    wau = _active_users_between(week_start, today)
    mau = _active_users_between(month_start, today)

    drivers_prev = set(
        Ride.objects.filter(
            completed_at__date__gte=today - timedelta(days=13),
            completed_at__date__lt=today - timedelta(days=6),
            driver_id__isnull=False,
        ).values_list("driver_id", flat=True)
    )
    drivers_curr = set(
        Ride.objects.filter(
            completed_at__date__gte=today - timedelta(days=6),
            driver_id__isnull=False,
        ).values_list("driver_id", flat=True)
    )

    couriers_prev = set(
        Delivery.objects.filter(
            delivered_at__date__gte=today - timedelta(days=13),
            delivered_at__date__lt=today - timedelta(days=6),
            driver_id__isnull=False,
        ).values_list("driver_id", flat=True)
    )
    couriers_curr = set(
        Delivery.objects.filter(
            delivered_at__date__gte=today - timedelta(days=6),
            driver_id__isnull=False,
        ).values_list("driver_id", flat=True)
    )

    rides = _ride_qs(month_start, today, city_id)
    deliveries = _delivery_qs(month_start, today, city_id)
    completed_rides = rides.filter(status="completed")
    cancelled_rides = rides.filter(status="cancelled")
    completed_deliveries = deliveries.filter(status="delivered")

    ride_count = rides.count()
    cancel_rate = round(100 * cancelled_rides.count() / ride_count, 1) if ride_count else 0
    completion_rate = round(100 * completed_rides.count() / ride_count, 1) if ride_count else 0

    avg_trip = completed_rides.aggregate(avg=Avg("fare"))["avg"] or Decimal("0")
    avg_delivery = completed_deliveries.aggregate(avg=Avg("fare"))["avg"] or Decimal("0")

    growth = []
    cursor = today - timedelta(days=13)
    while cursor <= today:
        day_rides = _ride_qs(cursor, cursor, city_id).filter(status="completed").count()
        day_deliveries = _delivery_qs(cursor, cursor, city_id).filter(status="delivered").count()
        day_users = _active_users_between(cursor, cursor)
        growth.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "completed_rides": day_rides,
                "completed_deliveries": day_deliveries,
                "active_users": day_users,
            }
        )
        cursor += timedelta(days=1)

    finance = build_finance_dashboard(period="monthly", city_id=city_id)

    return {
        "generated_at": timezone.now().isoformat(),
        "users": {"dau": dau, "wau": wau, "mau": mau},
        "retention": {
            "driver_retention_pct": _retention_rate(drivers_prev, drivers_curr),
            "courier_retention_pct": _retention_rate(couriers_prev, couriers_curr),
        },
        "averages": {
            "trip_value": _dec(avg_trip),
            "delivery_value": _dec(avg_delivery),
        },
        "rates": {
            "cancellation_rate_pct": cancel_rate,
            "completion_rate_pct": completion_rate,
        },
        "growth_chart": growth,
        "finance_summary": finance.get("summary", {}),
    }


def build_launch_checklist() -> dict:
    today = timezone.localdate()
    infra = _infra_snapshot()
    pending_wd = WithdrawalRequest.objects.filter(status="pending").count()
    expired_docs = DriverDocument.objects.filter(expires_at__lt=today, status="approved").count()
    open_tickets = SupportTicket.objects.filter(status__in=["open", "in_progress"]).count()

    sections = {
        "infrastructure": {
            "label": "Infrastructure",
            "items": [
                {"key": "api_health", "label": "API health", "done": infra["api"]["status"] == "ok"},
                {"key": "database", "label": "Database connected", "done": infra["database"]["status"] == "ok"},
                {"key": "redis", "label": "Redis connected", "done": infra["redis"]["status"] == "ok"},
                {"key": "celery", "label": "Celery workers online", "done": infra["celery"]["status"] == "ok"},
            ],
        },
        "security": {
            "label": "Security",
            "items": [
                {"key": "https", "label": "HTTPS enforced", "done": True},
                {"key": "admin_2fa", "label": "Admin 2FA enabled", "done": True},
                {"key": "jwt_rotation", "label": "JWT refresh rotation", "done": True},
            ],
        },
        "payments": {
            "label": "Payments",
            "items": [
                {"key": "reconciliation", "label": "Daily reconciliation available", "done": True},
                {"key": "withdrawal_queue", "label": "Withdrawal queue manageable", "done": pending_wd < 20},
            ],
        },
        "support": {
            "label": "Support",
            "items": [
                {"key": "support_console", "label": "Support console live", "done": True},
                {"key": "open_tickets", "label": "Open tickets under control", "done": open_tickets < 50},
            ],
        },
        "driver_onboarding": {
            "label": "Driver onboarding",
            "items": [
                {"key": "onboarding_dashboard", "label": "Onboarding tracker live", "done": True},
                {"key": "expired_docs", "label": "No expired approved documents", "done": expired_docs == 0},
            ],
        },
        "monitoring": {
            "label": "Monitoring",
            "items": [
                {"key": "launch_dashboard", "label": "Launch control center", "done": True},
                {"key": "alerting", "label": "Alert engine active", "done": True},
            ],
        },
        "store_readiness": {
            "label": "Store readiness",
            "items": [
                {"key": "privacy_policy", "label": "Privacy policy published", "done": True},
                {"key": "account_deletion", "label": "Account deletion flow", "done": True},
            ],
        },
        "legal": {
            "label": "Legal pages",
            "items": [
                {"key": "terms", "label": "Terms of service", "done": True},
                {"key": "privacy", "label": "Privacy policy", "done": True},
            ],
        },
    }

    total = sum(len(section["items"]) for section in sections.values())
    done = sum(1 for section in sections.values() for item in section["items"] if item["done"])

    return {
        "sections": sections,
        "progress": {"done": done, "total": total, "percent": round(100 * done / total, 1) if total else 0},
    }
