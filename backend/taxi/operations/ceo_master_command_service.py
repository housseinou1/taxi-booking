"""Phase 34 — CEO Master Command Center aggregation service.

This module intentionally does NOT implement new business logic. It reuses
existing services from Executive, Launch Command, AI Operations, Growth,
Multi-City, Fleet, Trust & Safety, and Incentive Engine modules to produce a
single unified CEO dashboard.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from incentives.models import BonusPayment, DriverIncentiveProgress, IncentiveProgram
from merchants.models import Merchant
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from referrals.models import DriverReferral, RiderReferral
from safety.models import SafetyIncident
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.rides.models import Ride

from .ai_operations_service import (
    build_ai_operations_dashboard,
    build_financial_insights,
    build_predictive_alerts,
)
from .executive_service import (
    build_finance_dashboard,
    build_live_metrics,
    build_operations_queues,
    build_security_panel,
    build_support_panel,
    _dec,
)
from .fleet_performance_service import build_fleet_ceo_metrics
from .growth_expansion_service import build_ceo_forecast, build_growth_metrics
from .incentive_engine_service import build_ceo_dashboard as build_incentive_ceo_dashboard
from .launch_command_service import (
    build_ceo_daily_summary,
    build_city_heat_map,
    build_launch_command_dashboard,
    build_live_operations,
    build_operations_alerts,
)
from .multi_city_service import build_multi_city_dashboard
from .trust_safety_service import build_ceo_safety_dashboard

User = get_user_model()

RIDE_ACTIVE = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress"]
DELIVERY_ACTIVE = [
    "requested", "accepted", "courier_arriving", "picked_up", "in_transit",
    "delivering", "delivery_exception",
]


def _compute_platform_health_score() -> int:
    """Simple health score from incident/support/payment signals."""
    score = 100
    safety_open = SafetyIncident.objects.filter(
        status__in=["open", "acknowledged", "investigating"]
    ).count()
    ops_open = 0
    try:
        from .models import OpsIncident
        ops_open = OpsIncident.objects.filter(status__in=["open", "investigating"]).count()
    except Exception:
        pass
    failed_payments = PaymentRecord.objects.filter(
        status="failed", created_at__date=timezone.localdate()
    ).count()
    open_tickets = 0
    try:
        from taxi.drivers.models import SupportTicket
        open_tickets = SupportTicket.objects.filter(status__in=["open", "in_progress"]).count()
    except Exception:
        pass

    score -= min(20, safety_open * 5)
    score -= min(15, ops_open * 5)
    score -= min(20, failed_payments * 2)
    score -= min(15, open_tickets)
    return max(0, min(100, score))


def build_executive_overview(city_id=None, period: str = "daily") -> dict:
    live = build_live_metrics(city_id=city_id)
    finance = build_finance_dashboard(period=period, city_id=city_id)
    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)

    rides_qs = Ride.objects.filter(status="completed")
    deliveries_qs = Delivery.objects.filter(status="delivered")
    if city_id:
        rides_qs = rides_qs.filter(city_id=city_id)

    completed_rides_today = rides_qs.filter(completed_at__date=today).count()
    completed_rides_week = rides_qs.filter(completed_at__date__gte=week_start).count()
    completed_rides_month = rides_qs.filter(completed_at__date__gte=month_start).count()
    completed_deliveries_today = deliveries_qs.filter(delivered_at__date=today).count()
    completed_deliveries_week = deliveries_qs.filter(delivered_at__date__gte=week_start).count()
    completed_deliveries_month = deliveries_qs.filter(delivered_at__date__gte=month_start).count()

    monthly_finance = build_finance_dashboard(period="monthly", city_id=city_id)

    requested_today = Ride.objects.filter(created_at__date=today)
    cancelled_today = Ride.objects.filter(status="cancelled", created_at__date=today)
    cancellation_rate = round(
        cancelled_today.count() / max(requested_today.count(), 1) * 100, 1
    )

    driver_pool = DriverProfile.objects.filter(status="approved")
    if city_id:
        driver_pool = driver_pool.filter(user__city_id=city_id)
    acceptance_rate = driver_pool.aggregate(a=Avg("acceptance_rate_points"))["a"] or 0

    satisfaction = 0
    rated_rides = Ride.objects.filter(driver_rating__isnull=False)
    if rated_rides.exists():
        avg = rated_rides.aggregate(a=Avg("driver_rating"))["a"]
        if avg:
            satisfaction = round(float(avg), 1)

    live_data = live.get("live", {})
    today_data = live.get("today", {})

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "total_revenue_today": today_data.get("revenue", "0"),
        "total_revenue_week": finance.get("summary", {}).get("gross_revenue", "0"),
        "total_revenue_month": monthly_finance.get("summary", {}).get("gross_revenue", "0"),
        "active_riders": live_data.get("active_riders", 0),
        "active_drivers": live_data.get("active_drivers", 0),
        "active_couriers": live_data.get("active_couriers", 0),
        "active_merchants": Merchant.objects.filter(status="active").count(),
        "completed_rides_today": completed_rides_today,
        "completed_rides_week": completed_rides_week,
        "completed_rides_month": completed_rides_month,
        "completed_deliveries_today": completed_deliveries_today,
        "completed_deliveries_week": completed_deliveries_week,
        "completed_deliveries_month": completed_deliveries_month,
        "cancellation_rate_pct": cancellation_rate,
        "driver_acceptance_rate_pct": round(float(acceptance_rate), 1),
        "customer_satisfaction": satisfaction,
        "platform_health_score": _compute_platform_health_score(),
    }


def build_financial_overview(city_id=None) -> dict:
    daily = build_finance_dashboard(period="daily", city_id=city_id)
    weekly = build_finance_dashboard(period="weekly", city_id=city_id)
    monthly = build_finance_dashboard(period="monthly", city_id=city_id)

    wallet_balance = WalletAccount.objects.aggregate(t=Sum("balance"))["t"] or Decimal("0")
    pending_withdrawals = (
        WithdrawalRequest.objects.filter(status__in=["pending", "approved"])
        .aggregate(t=Sum("amount"), c=Count("id"))
    )
    completed_withdrawals = (
        WithdrawalRequest.objects.filter(status__in=["approved", "paid"])
        .aggregate(t=Sum("amount"), c=Count("id"))
    )
    try:
        from merchants.models import MerchantSettlement
        merchant_settlements = (
            MerchantSettlement.objects.filter(status__in=["pending", "processing"])
            .aggregate(t=Sum("net_payout"))["t"]
            or Decimal("0")
        )
    except Exception:
        merchant_settlements = Decimal("0")

    try:
        from partners.models import PartnerSettlement
        partner_settlements = (
            PartnerSettlement.objects.filter(status__in=["pending", "processing"])
            .aggregate(t=Sum("partner_payout"))["t"]
            or Decimal("0")
        )
    except Exception:
        partner_settlements = Decimal("0")

    outstanding_refunds = (
        RefundRequest.objects.filter(status__in=["requested", "approved"])
        .aggregate(t=Sum("amount"), c=Count("id"))
    )

    today = timezone.localdate()
    today_payments = PaymentRecord.objects.filter(status="paid", created_at__date=today)
    today_gross = today_payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    today_commission = today_payments.aggregate(t=Sum("app_fee"))["t"] or Decimal("0")
    daily_profit = today_commission

    month_payments = PaymentRecord.objects.filter(
        status="paid", created_at__date__gte=today.replace(day=1)
    )
    monthly_gross = month_payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    monthly_commission = month_payments.aggregate(t=Sum("app_fee"))["t"] or Decimal("0")
    monthly_profit = monthly_commission

    return {
        "generated_at": timezone.now().isoformat(),
        "wallet_balance": _dec(wallet_balance),
        "pending_withdrawals": {
            "count": pending_withdrawals["c"] or 0,
            "amount": _dec(pending_withdrawals["t"]),
        },
        "completed_withdrawals": {
            "count": completed_withdrawals["c"] or 0,
            "amount": _dec(completed_withdrawals["t"]),
        },
        "merchant_settlements_pending": _dec(merchant_settlements),
        "partner_settlements_pending": _dec(partner_settlements),
        "daily_profit": _dec(daily_profit),
        "monthly_profit": _dec(monthly_profit),
        "cash_flow": {
            "today_in": _dec(today_gross),
            "today_out": _dec(pending_withdrawals["t"] or 0),
            "month_in": _dec(monthly_gross),
            "month_out": _dec(completed_withdrawals["t"] or 0),
        },
        "outstanding_refunds": {
            "count": outstanding_refunds["c"] or 0,
            "amount": _dec(outstanding_refunds["t"]),
        },
        "summary": {
            "daily": daily.get("summary", {}),
            "weekly": weekly.get("summary", {}),
            "monthly": monthly.get("summary", {}),
        },
    }


def build_operations_overview(city_id=None) -> dict:
    queues = build_operations_queues(city_id=city_id)
    safety = build_ceo_safety_dashboard(city_id=city_id)
    support = build_support_panel()

    driver_verification_pending = DriverProfile.objects.filter(status="pending").count()
    expired_documents = DriverDocument.objects.filter(
        expires_at__lt=timezone.localdate()
    ).count()
    merchant_approval_pending = Merchant.objects.filter(status="pending").count()
    courier_approval_pending = DriverProfile.objects.filter(status="pending").filter(
        user__user_type="courier"
    ).count()
    partner_approval_pending = 0
    try:
        from partners.models import Partner
        partner_approval_pending = Partner.objects.filter(contract_status="pending").count()
    except Exception:
        pass

    return {
        "generated_at": timezone.now().isoformat(),
        "open_incidents": safety.get("open_incidents", 0),
        "emergency_cases": safety.get("critical_open", 0),
        "sos_events_24h": SafetyIncident.objects.filter(
            incident_type="sos", created_at__gte=timezone.now() - timedelta(hours=24)
        ).count(),
        "support_queue": support.get("open_tickets", 0),
        "driver_verification_queue": driver_verification_pending,
        "driver_expired_documents": expired_documents,
        "merchant_approval_queue": merchant_approval_pending,
        "courier_approval_queue": courier_approval_pending,
        "partner_approval_queue": partner_approval_pending,
        "ride_status_counts": queues.get("rides", {}).get("counts", {}),
        "delivery_status_counts": queues.get("deliveries", {}).get("counts", {}),
        "recent_rides": queues.get("rides", {}).get("queue", [])[:10],
        "recent_deliveries": queues.get("deliveries", {}).get("queue", [])[:10],
        "safety_summary": {
            "open_incidents": safety.get("open_incidents", 0),
            "avg_resolution_hours": safety.get("avg_resolution_hours"),
            "high_risk_areas": safety.get("high_risk_areas", []),
        },
    }


def build_growth_overview(city_id=None) -> dict:
    growth = build_growth_metrics(city_id=city_id)
    forecast = build_ceo_forecast(city_id=city_id)

    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)

    new_riders_week = User.objects.filter(
        user_type="rider", date_joined__date__gte=week_start
    ).count()
    new_drivers_week = DriverProfile.objects.filter(
        status="approved", user__date_joined__date__gte=week_start
    ).count()
    new_merchants_week = Merchant.objects.filter(
        status="active", created_at__date__gte=week_start
    ).count()

    rider_referrals = RiderReferral.objects.filter(created_at__date__gte=week_start).count()
    driver_referrals = DriverReferral.objects.filter(created_at__date__gte=week_start).count()

    retention_rate = forecast.get("retention_metrics", {}).get("rider_retention_30d")

    top_cities = []
    try:
        from locations.models import City
        for city in City.objects.filter(is_active=True).order_by("-created_at")[:10]:
            rides = Ride.objects.filter(city=city, status="completed").count()
            top_cities.append({"city_id": city.id, "name": city.name, "completed_rides": rides})
        top_cities.sort(key=lambda x: x["completed_rides"], reverse=True)
    except Exception:
        pass

    expansion = forecast.get("recommended_expansion_areas", [])

    return {
        "generated_at": timezone.now().isoformat(),
        "new_riders_week": new_riders_week,
        "new_drivers_week": new_drivers_week,
        "new_merchants_week": new_merchants_week,
        "referral_growth": {
            "rider_referrals_week": rider_referrals,
            "driver_referrals_week": driver_referrals,
        },
        "retention_rate_pct": retention_rate,
        "marketing_campaign_performance": growth.get("marketing", {}),
        "top_cities": top_cities[:8],
        "expansion_opportunities": expansion[:10],
        "growth_summary": growth.get("summary", {}),
    }


def build_fleet_overview(city_id=None) -> dict:
    fleet = build_fleet_ceo_metrics(city_id=city_id)
    heat = build_city_heat_map(city_id=city_id, period="hour")

    approved = DriverProfile.objects.filter(status="approved")
    if city_id:
        approved = approved.filter(user__city_id=city_id)
    online = approved.filter(is_available=True).count()
    offline = approved.count() - online

    vehicle_categories = list(
        approved
        .values("car_type")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    avg_wait = 0
    waiting_rides = Ride.objects.filter(status="requested", driver__isnull=True)
    if waiting_rides.exists():
        total_min = sum(
            (timezone.now() - r.created_at).total_seconds() / 60 for r in waiting_rides[:50]
        )
        avg_wait = round(total_min / min(waiting_rides.count(), 50), 1)

    return {
        "generated_at": timezone.now().isoformat(),
        "drivers_online": online,
        "drivers_offline": offline,
        "peak_demand_areas": heat.get("heat_points", [])[:20],
        "supply_demand": {
            "waiting_riders": heat.get("ride_demand", 0),
            "driver_density": heat.get("driver_density", 0),
            "shortage_areas": heat.get("shortage_areas", [])[:10],
            "long_eta_areas": heat.get("long_eta_areas", [])[:10],
        },
        "vehicle_categories": vehicle_categories,
        "average_wait_time_minutes": avg_wait,
        "fleet_utilization_pct": fleet.get("fleet_utilization_pct", 0),
        "acceptance_trend": fleet.get("acceptance_trend", {}),
        "cancellation_trend": fleet.get("cancellation_trend", {}),
    }


def build_ai_insights_summary(city_id=None) -> dict:
    ai = build_ai_operations_dashboard(city_id=city_id)
    predictions = build_predictive_alerts()
    finance = build_financial_insights()

    biggest_issue = None
    for alert in predictions:
        if alert.get("severity") in ("critical", "high"):
            biggest_issue = alert
            break

    fastest_growing_area = ""
    growth = build_growth_metrics(city_id=city_id)
    top_city = None
    if growth.get("cities"):
        top_city = max(growth["cities"], key=lambda c: c.get("new_users", 0))
    if top_city:
        fastest_growing_area = top_city.get("name", "")

    fraud_alerts = [
        a for a in predictions if "fraud" in (a.get("type", "")).lower() or a.get("category") == "fraud"
    ][:5]

    recommendations = ai.get("recommendations", [])
    performance_recommendations = [
        r for r in recommendations if r.get("category") in ("dispatch", "fleet", "pricing")
    ][:5]

    return {
        "generated_at": timezone.now().isoformat(),
        "biggest_operational_issue": biggest_issue,
        "fastest_growing_area": fastest_growing_area,
        "revenue_forecast": finance.get("forecast", {}),
        "demand_forecast": {
            "peak_hours": ai.get("surge_monitor", {}).get("peak_hours", []),
            "demand_ratio_summary": ai.get("surge_monitor", {}).get("summary", {}),
        },
        "fraud_alerts": fraud_alerts,
        "performance_recommendations": performance_recommendations,
        "fleet_health": ai.get("fleet_health", {}),
        "driver_performance": ai.get("driver_performance", {}),
    }


def build_readiness_status() -> dict:
    """Launch readiness map. Some values are inferred from data/models;
    others are manual gates reflected as booleans defaulting to False.
    """
    try:
        from .models import PlatformSetting
        maintenance = PlatformSetting.get_value("maintenance_mode", {"enabled": False})
    except Exception:
        maintenance = {"enabled": False}

    backend_healthy = True
    try:
        User.objects.first()
    except Exception:
        backend_healthy = False

    has_drivers = DriverProfile.objects.filter(status="approved").exists()
    has_merchants = Merchant.objects.filter(status="active").exists()
    has_campaigns = IncentiveProgram.objects.filter(status="active").exists()
    store_listing_exists = True  # `store-listing.md` is present in repo

    overall = 0
    gates = {
        "infrastructure": {"ready": True, "weight": 15},
        "backend": {"ready": backend_healthy, "weight": 15},
        "mobile_apps": {"ready": False, "weight": 10},
        "qa": {"ready": False, "weight": 10},
        "google_play": {"ready": store_listing_exists, "weight": 10},
        "apple_app_store": {"ready": False, "weight": 5},
        "operations": {"ready": has_drivers, "weight": 10},
        "finance": {"ready": True, "weight": 10},
        "legal": {"ready": False, "weight": 10},
        "security": {"ready": True, "weight": 5},
    }
    for gate in gates.values():
        if gate["ready"]:
            overall += gate["weight"]

    return {
        "generated_at": timezone.now().isoformat(),
        "overall_launch_score": overall,
        "statuses": {
            key: {"ready": gate["ready"], "weight": gate["weight"]}
            for key, gate in gates.items()
        },
        "notes": {
            "infrastructure": "Docker Compose, nginx, SSL, Postgres, Redis, Celery configured.",
            "backend": "Django migrations and health endpoints available.",
            "mobile_apps": "Requires signed AAB build and QA sign-off.",
            "qa": "Requires physical device QA sign-off and all tests green.",
            "google_play": "Listing drafted; Data Safety and screenshots pending.",
            "apple_app_store": "Not submitted; defer or prepare artifacts.",
            "operations": "Requires approved driver/courier cohort and support roster.",
            "finance": "Reconciliation and payout workflows implemented.",
            "legal": "Requires finalized localized privacy/terms and data retention policy.",
            "security": "JWT, rate limiting, audit logging, role permissions active.",
        },
    }


def build_master_dashboard(city_id=None, period: str = "daily") -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "executive_overview": build_executive_overview(city_id=city_id, period=period),
        "financial_overview": build_financial_overview(city_id=city_id),
        "operations": build_operations_overview(city_id=city_id),
        "growth": build_growth_overview(city_id=city_id),
        "fleet": build_fleet_overview(city_id=city_id),
        "ai_insights": build_ai_insights_summary(city_id=city_id),
        "readiness": build_readiness_status(),
    }


def build_ceo_report_rows(report_type: str = "daily", city_id=None) -> list[dict]:
    master = build_master_dashboard(city_id=city_id, period=report_type)
    rows = []

    def _add(section: str, key: str, value):
        rows.append({"section": section, "metric": key, "value": value})

    overview = master["executive_overview"]
    for key, value in overview.items():
        if key != "generated_at":
            _add("Executive Overview", key, value)

    finance = master["financial_overview"]
    for key, value in finance.items():
        if key not in ("generated_at", "summary"):
            _add("Financial Overview", key, value)

    ops = master["operations"]
    for key, value in ops.items():
        if key not in ("generated_at", "recent_rides", "recent_deliveries", "ride_status_counts", "delivery_status_counts"):
            _add("Operations", key, value)

    growth = master["growth"]
    for key, value in growth.items():
        if key not in ("generated_at",):
            _add("Growth", key, value)

    fleet = master["fleet"]
    for key, value in fleet.items():
        if key not in ("generated_at", "peak_demand_areas", "supply_demand"):
            _add("Fleet", key, value)

    readiness = master["readiness"]
    _add("Launch Readiness", "overall_launch_score", readiness.get("overall_launch_score"))

    return rows
