"""Closed beta operations dashboard aggregations."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from deliveries.models import Delivery, DriverDeliverySettings
from operations.beta_feedback_service import build_beta_feedback_dashboard
from operations.executive_service import build_live_metrics
from operations.launch_service import (
    build_financial_reconciliation,
    build_launch_control_dashboard,
    build_support_queue,
    list_ops_incidents,
)
from operations.models import OpsIncident, PlatformSetting
from operations.operations_center_service import build_hourly_analytics
from payments.models import PaymentRecord, WithdrawalRequest
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()

CLOSED_BETA_CAPS = {"max_drivers": 20, "max_couriers": 10, "max_riders": 100}

DEFAULT_PERF = {
    "p50_ms": 926,
    "p95_ms": 4086,
    "http_5xx": 0,
    "source": "rc2_certification",
    "measured_at": "2026-07-21",
}


def _dec(value) -> str:
    if value is None:
        return "0.00"
    return str(Decimal(value).quantize(Decimal("0.01")))


def _beta_caps() -> dict:
    stored = PlatformSetting.get_value("closed_beta", {})
    return {**CLOSED_BETA_CAPS, **(stored or {})}


def _pilot_config() -> dict:
    soft = PlatformSetting.get_value("soft_launch", {}) or {}
    caps = _beta_caps()
    return {
        "pilot_city": soft.get("pilot_city", "Nouakchott"),
        "max_drivers": caps["max_drivers"],
        "max_couriers": caps["max_couriers"],
        "max_riders": caps["max_riders"],
        "enabled": soft.get("enabled", True),
        "release": soft.get("release", "v1.0.0-rc2"),
    }


def _seven_day_window():
    today = timezone.localdate()
    return today - timedelta(days=6), today


def _active_drivers_between(start, end) -> int:
    return (
        Ride.objects.filter(
            status="completed",
            completed_at__date__gte=start,
            completed_at__date__lte=end,
            driver_id__isnull=False,
        )
        .values("driver_id")
        .distinct()
        .count()
    )


def _active_couriers_between(start, end) -> int:
    return (
        Delivery.objects.filter(
            status="delivered",
            delivered_at__date__gte=start,
            delivered_at__date__lte=end,
            driver_id__isnull=False,
        )
        .values("driver_id")
        .distinct()
        .count()
    )


def _active_riders_between(start, end) -> int:
    ride_riders = set(
        Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values_list(
            "rider_id", flat=True
        )
    )
    delivery_riders = set(
        Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values_list(
            "customer_id", flat=True
        )
    )
    return len({uid for uid in ride_riders | delivery_riders if uid})


def _active_riders_today() -> int:
    today = timezone.localdate()
    return _active_riders_between(today, today)


def _build_seven_day_kpis(city_id=None) -> dict:
    start, end = _seven_day_window()
    rides = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        rides = rides.filter(city_id=city_id)

    deliveries = Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end)

    ride_total = rides.count()
    ride_completed = rides.filter(status="completed").count()
    ride_cancelled = rides.filter(status="cancelled").count()
    ride_accepted = rides.exclude(status="requested").count()

    delivery_total = deliveries.count()
    delivery_completed = deliveries.filter(status="delivered").count()

    payments = PaymentRecord.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    pay_total = payments.count()
    pay_paid = payments.filter(status="paid").count()

    withdrawals = WithdrawalRequest.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    wd_total = withdrawals.count()
    wd_paid = withdrawals.filter(status="paid").count()

    pickup_samples = []
    trip_duration_samples = []
    for ride in rides.filter(status="completed", driver_arrived_at__isnull=False)[:300]:
        if ride.driver_arrived_at and ride.created_at:
            pickup_samples.append((ride.driver_arrived_at - ride.created_at).total_seconds() / 60.0)
        start_trip = ride.pickup_pin_verified_at or ride.driver_arrived_at
        if start_trip and ride.completed_at:
            trip_duration_samples.append((ride.completed_at - start_trip).total_seconds() / 60.0)

    avg_pickup = round(sum(pickup_samples) / len(pickup_samples), 1) if pickup_samples else None
    avg_trip = round(sum(trip_duration_samples) / len(trip_duration_samples), 1) if trip_duration_samples else None

    mobile_metrics = PlatformSetting.get_value("beta_mobile_metrics", {}) or {}

    return {
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "driver_acceptance_rate_pct": round(100 * ride_accepted / ride_total, 1) if ride_total else None,
        "ride_completion_rate_pct": round(100 * ride_completed / ride_total, 1) if ride_total else None,
        "delivery_completion_rate_pct": (
            round(100 * delivery_completed / delivery_total, 1) if delivery_total else None
        ),
        "cancellation_rate_pct": round(100 * ride_cancelled / ride_total, 1) if ride_total else None,
        "average_pickup_time_minutes": avg_pickup,
        "average_trip_duration_minutes": avg_trip,
        "payment_success_rate_pct": round(100 * pay_paid / pay_total, 1) if pay_total else None,
        "cash_out_success_rate_pct": round(100 * wd_paid / wd_total, 1) if wd_total else None,
        "crash_free_sessions_pct": mobile_metrics.get("crash_free_sessions_pct"),
        "crash_free_source": mobile_metrics.get("source", "manual"),
    }


def _build_pilot_cohort() -> dict:
    today = timezone.localdate()
    week_start, week_end = _seven_day_window()
    caps = _pilot_config()
    cohort_track = PlatformSetting.get_value("beta_cohort_tracking", {}) or {}

    approved_drivers = DriverProfile.objects.filter(status="approved").count()
    pending_drivers = DriverProfile.objects.filter(status__in=["pending", "pending_review"]).count()

    couriers_qs = DriverDeliverySettings.objects.filter(delivery_mode_enabled=True)
    approved_couriers = couriers_qs.filter(driver__driver_profile__status="approved").count()
    pending_couriers = couriers_qs.filter(
        driver__driver_profile__status__in=["pending", "pending_review"]
    ).count()

    riders = User.objects.filter(is_active=True, is_staff=False).exclude(driver_profile__isnull=False)
    registered_riders = riders.count()

    drivers_active_today = (
        Ride.objects.filter(status="completed", completed_at__date=today, driver_id__isnull=False)
        .values("driver_id")
        .distinct()
        .count()
    )
    couriers_active_today = (
        Delivery.objects.filter(status="delivered", delivered_at__date=today, driver_id__isnull=False)
        .values("driver_id")
        .distinct()
        .count()
    )

    return {
        "caps": caps,
        "drivers": {
            "invited": cohort_track.get("drivers_invited", approved_drivers + pending_drivers),
            "approved": approved_drivers,
            "active_today": drivers_active_today,
            "active_7d": _active_drivers_between(week_start, week_end),
            "gap_to_cap": max(0, caps["max_drivers"] - approved_drivers),
        },
        "couriers": {
            "invited": cohort_track.get("couriers_invited", approved_couriers + pending_couriers),
            "approved": approved_couriers,
            "active_today": couriers_active_today,
            "active_7d": _active_couriers_between(week_start, week_end),
            "gap_to_cap": max(0, caps["max_couriers"] - approved_couriers),
        },
        "riders": {
            "invited": cohort_track.get("riders_invited", registered_riders),
            "registered": registered_riders,
            "active_today": _active_riders_today(),
            "active_7d": _active_riders_between(week_start, week_end),
            "gap_to_cap": max(0, caps["max_riders"] - registered_riders),
        },
    }


def _build_launch_blockers() -> dict:
    qa_status = PlatformSetting.get_value(
        "physical_qa_status",
        {"signed": False, "pass_count": 0, "total_tests": 80, "p0_open": 0},
    ) or {}
    backup_status = PlatformSetting.get_value(
        "backup_offsite_status",
        {"configured": False, "last_success": None, "local_backup_ok": True},
    ) or {}
    store_status = PlatformSetting.get_value(
        "store_readiness",
        {
            "google_play": {"status": "partial", "closed_testing": False, "items_open": 4},
            "apple_app_store": {"status": "not_submitted", "submitted": False},
        },
    ) or {}

    p0_open = 0
    p1_open = 0
    blockers = []

    if not qa_status.get("signed"):
        p0_open += 1
        blockers.append(
            {
                "id": "BLK-P0-001",
                "title": "Physical Android device QA not signed off",
                "priority": "P0",
                "status": "open",
                "owner": "QA Lead",
            }
        )

    if not backup_status.get("configured"):
        p0_open += 1
        blockers.append(
            {
                "id": "BLK-P0-002",
                "title": "Offsite encrypted backups not configured",
                "priority": "P0",
                "status": "open",
                "owner": "DevOps",
            }
        )

    perf = PlatformSetting.get_value("launch_perf_metrics", DEFAULT_PERF) or DEFAULT_PERF
    if perf.get("p95_ms", 0) >= 2000:
        p1_open += 1
        blockers.append(
            {
                "id": "BLK-P1-001",
                "title": f"p95 API latency {perf.get('p95_ms')} ms (target < 2000 ms)",
                "priority": "P1",
                "status": "open",
                "owner": "Engineering",
            }
        )

    play = store_status.get("google_play", {})
    if play.get("status") != "live":
        p1_open += 1
        blockers.append(
            {
                "id": "BLK-P1-002",
                "title": "Google Play closed testing / attestation incomplete",
                "priority": "P1",
                "status": play.get("status", "partial"),
                "owner": "Product",
            }
        )

    apple = store_status.get("apple_app_store", {})
    if not apple.get("submitted"):
        p1_open += 1
        blockers.append(
            {
                "id": "BLK-P1-003",
                "title": "Apple App Store not submitted",
                "priority": "P1",
                "status": "open",
                "owner": "Product",
            }
        )

    caps = _beta_caps()
    approved_drivers = DriverProfile.objects.filter(status="approved").count()
    if approved_drivers < min(5, caps["max_drivers"]):
        p1_open += 1
        blockers.append(
            {
                "id": "BLK-P1-004",
                "title": f"Pilot cohort under-recruited ({approved_drivers}/{caps['max_drivers']} drivers)",
                "priority": "P1",
                "status": "open",
                "owner": "Operations",
            }
        )

    return {
        "p0_open": p0_open,
        "p1_open": p1_open,
        "items": blockers,
        "physical_qa_status": {
            "signed": bool(qa_status.get("signed")),
            "pass_count": qa_status.get("pass_count", 0),
            "total_tests": qa_status.get("total_tests", 80),
            "p0_open": qa_status.get("p0_open", 0),
        },
        "offsite_backup_status": {
            "configured": bool(backup_status.get("configured")),
            "last_success": backup_status.get("last_success"),
            "local_backup_ok": backup_status.get("local_backup_ok", True),
        },
        "google_play_status": play,
        "apple_app_store_status": apple,
    }


def _build_overview(city_id=None) -> dict:
    control = build_launch_control_dashboard(city_id=city_id)
    live = build_live_metrics(city_id=city_id)
    support = build_support_queue({})
    feedback_support = build_beta_feedback_dashboard()
    metrics = control.get("metrics", {})
    today = timezone.localdate()

    completed_rides_today = Ride.objects.filter(status="completed", completed_at__date=today).count()
    completed_deliveries_today = Delivery.objects.filter(status="delivered", delivered_at__date=today).count()

    open_incidents = OpsIncident.objects.filter(status__in=["open", "investigating"]).count()
    legacy_open = support.get("counts", {}).get("open_tickets", 0)
    open_tickets = legacy_open + feedback_support.get("open_tickets", 0)

    week_start, week_end = _seven_day_window()

    return {
        "active_riders_today": _active_riders_today(),
        "active_riders_7d": _active_riders_between(week_start, week_end),
        "active_drivers_7d": _active_drivers_between(week_start, week_end),
        "active_couriers_7d": _active_couriers_between(week_start, week_end),
        "online_drivers": metrics.get("online_drivers", live["live"].get("active_drivers", 0)),
        "online_couriers": metrics.get("online_couriers", 0),
        "completed_rides_today": completed_rides_today,
        "completed_deliveries_today": completed_deliveries_today,
        "revenue_today": metrics.get("revenue_today", live["today"].get("revenue", "0.00")),
        "withdrawals_pending": metrics.get("withdrawals_pending", 0),
        "open_incidents": open_incidents,
        "support_tickets_open": open_tickets,
        "platform_status": control.get("platform_status"),
        "failed_payments_today": metrics.get("failed_payments_today", 0),
    }


def _build_performance_metrics(city_id=None) -> dict:
    hourly = build_hourly_analytics(city_id=city_id)
    perf = PlatformSetting.get_value("launch_perf_metrics", DEFAULT_PERF) or DEFAULT_PERF
    return {
        "seven_day": _build_seven_day_kpis(city_id=city_id),
        "current_hour": {
            "acceptance_rate_pct": hourly.get("acceptance_rate"),
            "average_eta_minutes": hourly.get("average_eta_minutes"),
            "average_wait_minutes": hourly.get("average_wait_minutes"),
        },
        "api": {
            "p50_ms": perf.get("p50_ms"),
            "p95_ms": perf.get("p95_ms"),
            "http_5xx": perf.get("http_5xx", 0),
            "source": perf.get("source", "manual"),
            "measured_at": perf.get("measured_at"),
        },
    }


def _build_action_items(city_id=None) -> list[dict]:
    items = []
    blockers = _build_launch_blockers()
    for blocker in blockers["items"][:3]:
        items.append(
            {
                "priority": blocker["priority"],
                "action": f"Resolve: {blocker['title']}",
                "owner": blocker["owner"],
            }
        )

    control = build_launch_control_dashboard(city_id=city_id)
    metrics = control.get("metrics", {})
    if metrics.get("withdrawals_pending", 0) > 0:
        items.append(
            {
                "priority": "P1",
                "action": f"Process {metrics['withdrawals_pending']} pending withdrawals",
                "owner": "Finance",
            }
        )
    if metrics.get("failed_payments_today", 0) > 0:
        items.append(
            {
                "priority": "P1",
                "action": f"Investigate {metrics['failed_payments_today']} failed payments today",
                "owner": "Finance",
            }
        )

    cohort = _build_pilot_cohort()
    if cohort["drivers"]["gap_to_cap"] > 0:
        items.append(
            {
                "priority": "P2",
                "action": f"Recruit {cohort['drivers']['gap_to_cap']} more drivers for beta cap",
                "owner": "Operations",
            }
        )

    return items[:5]


def build_beta_dashboard(city_id=None) -> dict:
    control = build_launch_control_dashboard(city_id=city_id)

    return {
        "generated_at": timezone.now().isoformat(),
        "release": _pilot_config().get("release", "v1.0.0-rc2"),
        "overview": _build_overview(city_id=city_id),
        "live_kpis": _build_performance_metrics(city_id=city_id),
        "launch_blockers": _build_launch_blockers(),
        "pilot_cohort": _build_pilot_cohort(),
        "infrastructure": control.get("infrastructure", {}),
        "ceo_summary": build_beta_ceo_summary(city_id=city_id),
    }


def build_beta_ceo_summary(city_id=None) -> dict:
    overview = _build_overview(city_id=city_id)
    cohort = _build_pilot_cohort()
    kpis = _build_seven_day_kpis(city_id=city_id)
    finance = build_financial_reconciliation()
    control = build_launch_control_dashboard(city_id=city_id)
    incidents = list_ops_incidents({"status": "open"})[:10]
    open_incidents = OpsIncident.objects.filter(status__in=["open", "investigating"]).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "date": timezone.localdate().isoformat(),
        "revenue": {
            "gross_today_mru": overview.get("revenue_today"),
            "net_estimate_mru": finance.get("gross_revenue"),
            "refunds_today_mru": finance.get("refunds"),
        },
        "trips": {
            "completed_rides_today": overview.get("completed_rides_today"),
            "ride_completion_rate_7d_pct": kpis.get("ride_completion_rate_pct"),
            "cancellation_rate_7d_pct": kpis.get("cancellation_rate_pct"),
        },
        "deliveries": {
            "completed_deliveries_today": overview.get("completed_deliveries_today"),
            "delivery_completion_rate_7d_pct": kpis.get("delivery_completion_rate_pct"),
        },
        "fleet_health": {
            "online_drivers": overview.get("online_drivers"),
            "online_couriers": overview.get("online_couriers"),
            "active_drivers_7d": cohort["drivers"]["active_7d"],
            "active_couriers_7d": cohort["couriers"]["active_7d"],
            "active_riders_today": overview.get("active_riders_today"),
            "drivers_approved": cohort["drivers"]["approved"],
            "drivers_cap": cohort["caps"]["max_drivers"],
        },
        "payments": {
            "failed_today": overview.get("failed_payments_today"),
            "success_rate_7d_pct": kpis.get("payment_success_rate_pct"),
        },
        "withdrawals": {
            "pending": overview.get("withdrawals_pending"),
            "cash_out_success_rate_7d_pct": kpis.get("cash_out_success_rate_pct"),
        },
        "incidents": {
            "open_count": open_incidents,
            "recent": incidents[:5],
        },
        "support": build_beta_feedback_dashboard(),
        "infrastructure_status": control.get("platform_status"),
        "infrastructure": control.get("infrastructure", {}),
        "action_items": _build_action_items(city_id=city_id),
    }
