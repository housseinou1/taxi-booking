"""Phase 25 — Launch Operations Command Center service layer."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from payments.models import PaymentRecord, WithdrawalRequest
from safety.models import SafetyIncident
from security.models import AuditLog
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .ai_operations_service import build_hotspot_map, build_predictive_alerts, build_surge_monitor
from .beta_dashboard_service import build_beta_ceo_summary
from .executive_service import build_live_metrics
from .fleet_performance_service import build_fleet_ceo_metrics
from .launch_service import (
    build_launch_control_dashboard,
    build_support_queue,
    list_launch_alerts,
    list_ops_incidents,
    sync_launch_alerts,
)
from .models import BetaFeedback, OpsIncident, PlatformSetting
from .operations_center_service import (
    OPEN_INCIDENT_STATUSES,
    build_emergency_center,
    build_fleet_snapshot,
    build_live_alerts,
    build_ops_map,
    build_operations_center_dashboard,
)

User = get_user_model()

ALERT_TYPE_MAP = {
    "driver_shortage": "Driver shortage",
    "courier_shortage": "Courier shortage",
    "payment_failures": "Payment failures",
    "gps_outage": "GPS outages",
    "high_cancellation_rate": "High cancellation rate",
    "surge_demand": "Surge demand",
    "api_degradation": "API degradation",
    "offline_services": "Offline services",
}


def _dec(value) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)):.2f}"


def build_live_operations(city_id=None) -> dict:
    live = build_live_metrics(city_id=city_id)
    fleet = build_fleet_snapshot(city_id)
    control = build_launch_control_dashboard(city_id=city_id)
    metrics = control.get("metrics", {})
    support = build_support_queue({})
    feedback_open = BetaFeedback.objects.filter(status__in=["open", "assigned", "waiting"]).count()
    legacy_tickets = support.get("counts", {}).get("open_tickets", 0)
    safety_open = SafetyIncident.objects.filter(status__in=OPEN_INCIDENT_STATUSES).count()
    ops_open = OpsIncident.objects.filter(status__in=["open", "investigating"]).count()
    pending_withdrawals = WithdrawalRequest.objects.filter(status__in=["pending", "approved"]).aggregate(
        total=Sum("amount"), count=Count("id")
    )
    failed_payments = PaymentRecord.objects.filter(
        status="failed", created_at__date=timezone.localdate()
    ).aggregate(count=Count("id"), total=Sum("amount"))
    sync_launch_alerts()
    system_alert_count = len(list_launch_alerts(include_resolved=False))

    return {
        "generated_at": timezone.now().isoformat(),
        "active_rides": live["live"].get("active_trips", 0),
        "active_deliveries": live["live"].get("active_deliveries", 0),
        "online_drivers": fleet["counts"].get("online_drivers", live["live"].get("active_drivers", 0)),
        "online_couriers": fleet["counts"].get("online_couriers", live["live"].get("active_couriers", 0)),
        "open_incidents": safety_open + ops_open,
        "open_safety_incidents": safety_open,
        "open_ops_incidents": ops_open,
        "open_support_tickets": legacy_tickets + feedback_open,
        "pending_withdrawals": {
            "count": pending_withdrawals["count"] or 0,
            "amount": _dec(pending_withdrawals["total"]),
        },
        "failed_payments": {
            "count": failed_payments["count"] or metrics.get("failed_payments_today", 0),
            "amount": _dec(failed_payments["total"]),
        },
        "system_alerts": system_alert_count,
        "platform_status": control.get("platform_status"),
        "infrastructure": control.get("infrastructure", {}),
        "waiting_riders": fleet["counts"].get("waiting_riders", 0),
        "fleet_counts": fleet["counts"],
    }


def build_city_heat_map(city_id=None, period: str = "hour") -> dict:
    heat = build_hotspot_map(period=period, city_id=city_id)
    surge = build_surge_monitor(city_id=city_id)
    live_map = build_ops_map(city_id)

    shortages = []
    for zone in surge.get("zones", []):
        if zone.get("demand_ratio", 0) >= 2 or zone.get("waiting_riders", 0) >= 3:
            shortages.append(
                {
                    "lat": zone["lat"],
                    "lng": zone["lng"],
                    "label": zone.get("label") or "High demand zone",
                    "type": "shortage",
                    "demand_ratio": zone.get("demand_ratio"),
                    "waiting_riders": zone.get("waiting_riders", 0),
                    "drivers_nearby": zone.get("drivers_nearby", 0),
                }
            )

    long_eta = []
    for ride in Ride.objects.filter(status__in={"requested", "driver_arriving"}).exclude(
        pickup_lat__isnull=True
    )[:50]:
        wait_min = int((timezone.now() - ride.created_at).total_seconds() / 60)
        if wait_min >= 15:
            long_eta.append(
                {
                    "ride_id": ride.id,
                    "lat": ride.pickup_lat,
                    "lng": ride.pickup_lng,
                    "label": ride.pickup,
                    "wait_minutes": wait_min,
                    "type": "long_eta",
                }
            )

    driver_density = len(live_map.get("markers", {}).get("drivers", []))
    courier_density = len(live_map.get("markers", {}).get("couriers", []))

    return {
        "period": period,
        "generated_at": timezone.now().isoformat(),
        "ride_demand": heat.get("summary", {}).get("ride_requests", 0),
        "delivery_demand": heat.get("summary", {}).get("delivery_requests", 0),
        "driver_density": driver_density,
        "courier_density": courier_density,
        "heat_points": heat.get("points", [])[:120],
        "shortage_areas": shortages[:30],
        "long_eta_areas": long_eta[:30],
        "surge_zones": surge.get("zones", [])[:20],
        "live_markers": live_map.get("markers", {}),
    }


def _normalize_alert(alert: dict, source: str) -> dict:
    alert_type = alert.get("type") or alert.get("alert_type") or "unknown"
    mapped = alert_type
    if alert_type in {"excessive_waiting", "ride_waiting_too_long", "surge_demand"}:
        mapped = "surge_demand"
    elif alert_type in {"driver_offline_during_trip", "gps_stale"}:
        mapped = "gps_outage"
    elif alert_type in {"failed_payments", "payment_failure"}:
        mapped = "payment_failures"
    elif alert_type in {"high_cancellation_rate", "driver_likely_to_cancel"}:
        mapped = "high_cancellation_rate"
    elif alert_type.startswith("api_") or alert_type == "api_degradation":
        mapped = "api_degradation"
    elif alert_type.endswith("_offline") or alert_type in {"celery_stopped", "database_offline", "redis_offline"}:
        mapped = "offline_services"

    return {
        **alert,
        "source": source,
        "category": mapped,
        "category_label": ALERT_TYPE_MAP.get(mapped, alert_type.replace("_", " ").title()),
    }


def build_operations_alerts(city_id=None) -> dict:
    sync_launch_alerts()
    merged = []
    seen = set()

    for alert in list_launch_alerts(include_resolved=False):
        normalized = _normalize_alert(alert, "launch")
        key = normalized.get("id") or f"launch-{alert.get('alert_type')}-{alert.get('id')}"
        if key not in seen:
            seen.add(key)
            merged.append(normalized)

    for alert in build_live_alerts():
        normalized = _normalize_alert(alert, "live")
        if normalized["id"] not in seen:
            seen.add(normalized["id"])
            merged.append(normalized)

    for alert in build_predictive_alerts():
        normalized = _normalize_alert(alert, "predictive")
        if normalized["id"] not in seen:
            seen.add(normalized["id"])
            merged.append(normalized)

    fleet = build_fleet_snapshot(city_id)
    counts = fleet.get("counts", {})
    if counts.get("waiting_riders", 0) > max(counts.get("online_drivers", 0), 1) * 2:
        merged.append(
            {
                "id": "cmd-driver-shortage",
                "category": "driver_shortage",
                "category_label": ALERT_TYPE_MAP["driver_shortage"],
                "severity": "high",
                "message": f"{counts['waiting_riders']} riders waiting with {counts['online_drivers']} drivers online",
                "source": "command",
            }
        )
    if counts.get("active_deliveries", 0) > max(counts.get("online_couriers", 0), 1) * 2:
        merged.append(
            {
                "id": "cmd-courier-shortage",
                "category": "courier_shortage",
                "category_label": ALERT_TYPE_MAP["courier_shortage"],
                "severity": "high",
                "message": f"{counts['active_deliveries']} active deliveries with {counts['online_couriers']} couriers online",
                "source": "command",
            }
        )

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    merged.sort(key=lambda item: severity_order.get(item.get("severity", "medium"), 4))

    by_category = {}
    for item in merged:
        cat = item.get("category", "other")
        by_category.setdefault(cat, 0)
        by_category[cat] += 1

    return {
        "generated_at": timezone.now().isoformat(),
        "total": len(merged),
        "critical_count": sum(1 for item in merged if item.get("severity") == "critical"),
        "by_category": by_category,
        "alerts": merged[:150],
    }


def build_ceo_daily_summary(city_id=None) -> dict:
    summary = build_beta_ceo_summary(city_id=city_id)
    fleet_ceo = build_fleet_ceo_metrics(city_id=city_id)
    live = build_live_operations(city_id)
    today = timezone.localdate()
    week_start = today - timedelta(days=6)

    new_riders = User.objects.filter(user_type="rider", date_joined__date__gte=week_start).count()
    new_drivers = DriverProfile.objects.filter(
        status="approved", user__date_joined__date__gte=week_start
    ).count()

    return {
        **summary,
        "utilization": {
            "driver_utilization_pct": fleet_ceo.get("driver_utilization_pct"),
            "fleet_utilization_pct": fleet_ceo.get("fleet_utilization_pct"),
            "online_drivers": live.get("online_drivers"),
            "online_couriers": live.get("online_couriers"),
        },
        "customer_growth": {
            "new_riders_7d": new_riders,
            "new_drivers_7d": new_drivers,
        },
        "payment_summary": summary.get("payments", {}),
        "support_summary": {
            "open_tickets": live.get("open_support_tickets"),
            **(summary.get("support") or {}),
        },
        "incident_summary": {
            "open_count": live.get("open_incidents"),
            "safety_open": live.get("open_safety_incidents"),
            "ops_open": live.get("open_ops_incidents"),
            "recent": summary.get("incidents", {}).get("recent", []),
        },
    }


def build_command_audit_trail(*, limit: int = 80) -> dict:
    logs = (
        AuditLog.objects.filter(
            Q(action__in=["admin_action", "status_change", "payment_change"])
            | Q(entity_type__in=["ride", "delivery", "driver", "system", "launch_alert"])
        )
        .select_related("actor")
        .order_by("-created_at")[:limit]
    )
    entries = []
    for log in logs:
        details = log.details or {}
        entries.append(
            {
                "id": log.id,
                "user": log.actor.email if log.actor else "System",
                "timestamp": log.created_at.isoformat(),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "summary": log.summary,
                "amount": details.get("amount"),
                "before": details.get("before") or details.get("from") or details.get("previous"),
                "after": details.get("after") or details.get("to") or details.get("new_status"),
                "details": details,
            }
        )
    return {"count": len(entries), "entries": entries}


def build_launch_command_dashboard(city_id=None, period: str = "hour") -> dict:
    onboarding_paused = PlatformSetting.get_value("driver_onboarding_paused", {"enabled": False}) or {
        "enabled": False
    }
    ops_center = build_operations_center_dashboard(city_id)
    emergency = build_emergency_center()

    return {
        "generated_at": timezone.now().isoformat(),
        "live_operations": build_live_operations(city_id),
        "heat_map": build_city_heat_map(city_id, period=period),
        "alerts": build_operations_alerts(city_id),
        "ceo_summary": build_ceo_daily_summary(city_id),
        "incidents": {
            "safety": emergency,
            "ops": list_ops_incidents({"status": "open"})[:50],
        },
        "trips": ops_center.get("trips"),
        "deliveries": ops_center.get("deliveries"),
        "timeline": ops_center.get("timeline", [])[:30],
        "analytics": ops_center.get("analytics"),
        "onboarding_paused": onboarding_paused,
        "audit": build_command_audit_trail(limit=50),
    }


def build_ceo_summary_export_rows(city_id=None) -> list[dict]:
    summary = build_ceo_daily_summary(city_id)
    rows = [
        {"metric": "date", "value": summary.get("date", ""), "section": "meta"},
        {"metric": "revenue_gross_today_mru", "value": summary.get("revenue", {}).get("gross_today_mru", ""), "section": "revenue"},
        {"metric": "completed_rides_today", "value": summary.get("trips", {}).get("completed_rides_today", ""), "section": "trips"},
        {"metric": "completed_deliveries_today", "value": summary.get("deliveries", {}).get("completed_deliveries_today", ""), "section": "deliveries"},
        {
            "metric": "driver_utilization_pct",
            "value": summary.get("utilization", {}).get("driver_utilization_pct", ""),
            "section": "utilization",
        },
        {
            "metric": "fleet_utilization_pct",
            "value": summary.get("utilization", {}).get("fleet_utilization_pct", ""),
            "section": "utilization",
        },
        {
            "metric": "new_riders_7d",
            "value": summary.get("customer_growth", {}).get("new_riders_7d", ""),
            "section": "growth",
        },
        {
            "metric": "open_support_tickets",
            "value": summary.get("support_summary", {}).get("open_tickets", ""),
            "section": "support",
        },
        {
            "metric": "open_incidents",
            "value": summary.get("incident_summary", {}).get("open_count", ""),
            "section": "incidents",
        },
        {
            "metric": "failed_payments_today",
            "value": summary.get("payment_summary", {}).get("failed_today", ""),
            "section": "payments",
        },
        {
            "metric": "pending_withdrawals",
            "value": summary.get("withdrawals", {}).get("pending", ""),
            "section": "payments",
        },
    ]
    return rows


def get_onboarding_pause_state() -> dict:
    return PlatformSetting.get_value("driver_onboarding_paused", {"enabled": False}) or {"enabled": False}


def set_onboarding_pause(enabled: bool, reason: str, user) -> dict:
    payload = {
        "enabled": enabled,
        "reason": reason,
        "updated_at": timezone.now().isoformat(),
        "updated_by": user.id if user else None,
    }
    PlatformSetting.set_value("driver_onboarding_paused", payload, user=user)
    return payload
