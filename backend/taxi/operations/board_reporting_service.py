"""Phase 35 — Board & Investor Reporting Suite.

Reuses existing analytics, dashboards, and reporting modules. No new business
logic is introduced; this layer aggregates data into board-ready packages.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from locations.models import City
from merchants.models import Merchant, MerchantOrder
from payments.models import PaymentRecord, RefundRequest, WalletAccount, WithdrawalRequest
from referrals.models import DriverReferral, RiderReferral
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .ai_operations_service import build_financial_insights, build_predictive_alerts
from .executive_service import _dec, build_finance_dashboard, build_live_metrics
from .growth_expansion_service import build_business_kpis, build_ceo_forecast, build_growth_metrics
from .multi_city_service import build_multi_city_dashboard

User = get_user_model()


def _date_bounds(period: str):
    today = timezone.localdate()
    if period == "daily":
        start = today
    elif period == "weekly":
        start = today - timedelta(days=today.weekday())
    elif period == "monthly":
        start = today.replace(day=1)
    elif period == "quarterly":
        month = (today.month - 1) // 3 * 3 + 1
        start = today.replace(month=month, day=1)
    elif period == "annual":
        start = today.replace(month=1, day=1)
    else:
        start = today
    return start, today


def build_executive_summary(period: str = "weekly", city_id=None) -> dict:
    start, end = _date_bounds(period)
    live = build_live_metrics(city_id=city_id)

    rides_qs = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        rides_qs = rides_qs.filter(city_id=city_id)
    completed_rides = rides_qs.filter(status="completed").count()
    cancelled_rides = rides_qs.filter(status="cancelled").count()
    total_rides = rides_qs.count()
    cancellation_rate = round(cancelled_rides / max(total_rides, 1) * 100, 1)

    deliveries_qs = Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    completed_deliveries = deliveries_qs.filter(status="delivered").count()

    payments = PaymentRecord.objects.filter(status="paid", created_at__date__gte=start, created_at__date__lte=end)
    gmv = payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    commission = payments.aggregate(t=Sum("app_fee"))["t"] or Decimal("0")

    active_riders = User.objects.filter(user_type="rider", is_active=True).count()
    active_drivers = DriverProfile.objects.filter(status="approved", user__is_active=True).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "highlights": [
            f"GMV: {_dec(gmv)} MRU",
            f"Completed rides: {completed_rides}",
            f"Completed deliveries: {completed_deliveries}",
            f"Cancellation rate: {cancellation_rate}%",
            f"Active riders: {active_riders}",
            f"Active drivers: {active_drivers}",
        ],
        "completed_rides": completed_rides,
        "completed_deliveries": completed_deliveries,
        "gmv_mru": _dec(gmv),
        "platform_commission_mru": _dec(commission),
        "cancellation_rate_pct": cancellation_rate,
        "active_riders": active_riders,
        "active_drivers": active_drivers,
        "live_snapshot": live.get("live", {}),
    }


def build_business_kpis_report(city_id=None) -> dict:
    kpis = build_business_kpis(city_id=city_id)
    forecast = build_ceo_forecast(city_id=city_id)

    payments = PaymentRecord.objects.filter(status="paid")
    if city_id:
        payments = payments.filter(ride__city_id=city_id)
    gmv = payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")

    completed_rides = Ride.objects.filter(status="completed")
    completed_deliveries = Delivery.objects.filter(status="delivered")
    if city_id:
        completed_rides = completed_rides.filter(city_id=city_id)

    ride_count = completed_rides.count()
    delivery_count = completed_deliveries.count()

    avg_ride_fare = "0"
    if ride_count:
        avg_ride_fare = _dec(gmv / max(ride_count, 1))

    aov = "0"
    order_count = MerchantOrder.objects.filter(status__in=["paid", "delivered"]).count()
    if order_count:
        merchant_gmv = (
            MerchantOrder.objects.filter(status__in=["paid", "delivered"])
            .aggregate(t=Sum("total"))["t"]
            or Decimal("0")
        )
        aov = _dec(merchant_gmv / order_count)

    active_riders = User.objects.filter(user_type="rider", is_active=True).count()
    active_drivers = DriverProfile.objects.filter(status="approved", user__is_active=True).count()
    active_couriers = DriverProfile.objects.filter(
        status="approved", user__is_active=True, user__user_type="courier"
    ).count()

    retention_rate = forecast.get("retention_metrics", {}).get("rider_retention_30d")
    driver_retention = forecast.get("retention_metrics", {}).get("driver_retention_30d")

    # Revenue growth compared to prior month
    this_month = timezone.localdate().replace(day=1)
    last_month_end = this_month - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    this_month_revenue = (
        PaymentRecord.objects.filter(status="paid", created_at__date__gte=this_month)
        .aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )
    last_month_revenue = (
        PaymentRecord.objects.filter(
            status="paid", created_at__date__gte=last_month_start, created_at__date__lte=last_month_end
        )
        .aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )
    revenue_growth = 0
    if last_month_revenue:
        revenue_growth = round(float((this_month_revenue - last_month_revenue) / last_month_revenue * 100), 1)

    return {
        "generated_at": timezone.now().isoformat(),
        "revenue_mru": _dec(this_month_revenue),
        "gmv_mru": _dec(gmv),
        "completed_rides": ride_count,
        "completed_deliveries": delivery_count,
        "merchant_sales_mru": _dec(
            MerchantOrder.objects.filter(status__in=["paid", "delivered"])
            .aggregate(t=Sum("total"))["t"]
            or Decimal("0")
        ),
        "active_riders": active_riders,
        "active_drivers": active_drivers,
        "active_couriers": active_couriers,
        "driver_retention_pct": driver_retention,
        "customer_retention_pct": retention_rate,
        "average_order_value_mru": aov,
        "average_ride_fare_mru": avg_ride_fare,
        "revenue_growth_pct": revenue_growth,
        "kpi_summary": kpis,
    }


def build_financial_report(period: str = "monthly", city_id=None) -> dict:
    finance = build_finance_dashboard(period=period, city_id=city_id)
    start, end = _date_bounds(period)

    payments = PaymentRecord.objects.filter(
        status="paid", created_at__date__gte=start, created_at__date__lte=end
    )
    if city_id:
        payments = payments.filter(ride__city_id=city_id)

    gross = payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    commission = payments.aggregate(t=Sum("app_fee"))["t"] or Decimal("0")
    driver_earnings = (
        Ride.objects.filter(status="completed", completed_at__date__gte=start, completed_at__date__lte=end)
        .aggregate(t=Sum("driver_earning"))["t"]
        or Decimal("0")
    )
    if city_id:
        driver_earnings = (
            Ride.objects.filter(
                status="completed",
                city_id=city_id,
                completed_at__date__gte=start,
                completed_at__date__lte=end,
            )
            .aggregate(t=Sum("driver_earning"))["t"]
            or Decimal("0")
        )

    operating_expenses = driver_earnings + (
        WithdrawalRequest.objects.filter(
            status__in=["approved", "paid"],
            created_at__date__gte=start,
            created_at__date__lte=end,
        ).aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )

    merchant_commission = Decimal("0")
    try:
        from merchants.models import MerchantSettlement

        merchant_commission = (
            MerchantSettlement.objects.filter(
                period_end__gte=start,
                period_start__lte=end,
            ).aggregate(t=Sum("commission_amount"))["t"]
            or Decimal("0")
        )
    except Exception:
        pass

    partner_revenue_share = Decimal("0")
    try:
        from partners.models import PartnerSettlement

        partner_revenue_share = (
            PartnerSettlement.objects.filter(
                period_end__gte=start,
                period_start__lte=end,
            ).aggregate(t=Sum("partner_payout"))["t"]
            or Decimal("0")
        )
    except Exception:
        pass

    wallet_balance = WalletAccount.objects.aggregate(t=Sum("balance"))["t"] or Decimal("0")
    pending_withdrawals = (
        WithdrawalRequest.objects.filter(status__in=["pending", "approved"])
        .aggregate(t=Sum("amount"), c=Count("id"))
    )
    outstanding_refunds = (
        RefundRequest.objects.filter(status__in=["requested", "approved"])
        .aggregate(t=Sum("amount"), c=Count("id"))
    )

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "income_summary": {
            "gross_revenue_mru": _dec(gross),
            "platform_commission_mru": _dec(commission),
            "merchant_commission_mru": _dec(merchant_commission),
            "partner_revenue_share_mru": _dec(partner_revenue_share),
        },
        "operating_expenses_mru": _dec(operating_expenses),
        "net_operating_income_mru": _dec(commission + merchant_commission - operating_expenses),
        "cash_flow": {
            "in": _dec(gross),
            "out": _dec(operating_expenses),
            "net": _dec(gross - operating_expenses),
        },
        "cash_flow_summary": {
            "cash_in_mru": _dec(gross),
            "cash_out_mru": _dec(operating_expenses),
            "net_cash_flow_mru": _dec(gross - operating_expenses),
        },
        "outstanding_liabilities_mru": _dec((pending_withdrawals["t"] or 0) + (outstanding_refunds["t"] or 0)),
        "wallet_balance_mru": _dec(wallet_balance),
        "refund_summary": {
            "count": outstanding_refunds["c"] or 0,
            "amount_mru": _dec(outstanding_refunds["t"]),
        },
        "summary": finance.get("summary", {}),
    }


def _platform_uptime_pct() -> float | None:
    """Derive uptime indicator from live infrastructure health checks."""
    from .launch_service import _infra_snapshot

    infra = _infra_snapshot()
    statuses = [infra[key]["status"] for key in ("api", "database", "redis", "celery")]
    if all(status == "ok" for status in statuses):
        return 100.0
    if any(status not in ("ok", "degraded", "unknown") for status in statuses):
        return 95.0
    if any(status in ("degraded", "unknown") for status in statuses):
        return 98.0
    return None


def build_operational_report(city_id=None) -> dict:
    from .ai_operations_service import build_driver_performance_scores, build_fleet_health
    from .executive_service import build_operations_queues, build_support_panel
    from .launch_command_service import build_live_operations, build_operations_alerts
    from .trust_safety_service import build_ceo_safety_dashboard

    live = build_live_operations(city_id=city_id)
    safety = build_ceo_safety_dashboard(city_id=city_id)
    alerts = build_operations_alerts(city_id=city_id)
    queues = build_operations_queues(city_id=city_id)
    support = build_support_panel()
    fleet_health = build_fleet_health()
    driver_perf = build_driver_performance_scores(limit=20)

    completed_rides = Ride.objects.filter(status="completed")
    if city_id:
        completed_rides = completed_rides.filter(city_id=city_id)
    total_completed = completed_rides.count()
    avg_driver_rating = "0"
    if total_completed:
        avg = completed_rides.aggregate(a=Avg("driver_rating"))["a"]
        if avg:
            avg_driver_rating = _dec(avg)

    incidents_open = 0
    try:
        from safety.models import SafetyIncident
        incidents_open = SafetyIncident.objects.filter(
            status__in=["open", "acknowledged", "investigating"]
        ).count()
    except Exception:
        pass

    return {
        "generated_at": timezone.now().isoformat(),
        "ride_performance": {
            "completed": total_completed,
            "cancelled": Ride.objects.filter(status="cancelled").count(),
            "avg_driver_rating": avg_driver_rating,
        },
        "delivery_performance": {
            "completed": Delivery.objects.filter(status="delivered").count(),
            "cancelled": Delivery.objects.filter(status="cancelled").count(),
        },
        "driver_performance": driver_perf,
        "merchant_performance": list(
            Merchant.objects.filter(status="active")
            .annotate(order_count=Count("orders"))
            .order_by("-order_count")
            .values("business_name", "order_count")[:10]
        ),
        "support_metrics": support,
        "safety_metrics": {
            "open_incidents": incidents_open,
            "safety_score": safety.get("safety_score"),
            "emergency_alerts_24h": safety.get("emergency_alerts_24h", 0),
            "avg_resolution_hours": safety.get("avg_resolution_hours"),
        },
        "incident_statistics": {
            "open_count": live.get("open_incidents", 0),
            "open_safety": live.get("open_safety_incidents", 0),
            "open_ops": live.get("open_ops_incidents", 0),
        },
        "platform_uptime_pct": _platform_uptime_pct(),
        "alerts": alerts,
        "fleet_health": fleet_health,
        "queues": queues,
    }


def build_growth_report(city_id=None) -> dict:
    growth = build_growth_metrics(city_id=city_id)

    today = timezone.localdate()
    month_start = today.replace(day=1)
    week_start = today - timedelta(days=6)

    new_riders_month = User.objects.filter(
        user_type="rider", date_joined__date__gte=month_start
    ).count()
    new_drivers_month = DriverProfile.objects.filter(
        status="approved", user__date_joined__date__gte=month_start
    ).count()
    new_merchants_month = Merchant.objects.filter(
        status="active", created_at__date__gte=month_start
    ).count()

    rider_referrals = RiderReferral.objects.filter(created_at__date__gte=month_start).count()
    driver_referrals = DriverReferral.objects.filter(created_at__date__gte=month_start).count()

    active_cities = list(
        City.objects.filter(is_active=True).values("id", "name").order_by("name")[:20]
    )
    city_growth = []
    for city in active_cities:
        ride_count = Ride.objects.filter(city_id=city["id"], status="completed").count()
        city_growth.append({**city, "completed_rides": ride_count})
    city_growth.sort(key=lambda c: c["completed_rides"], reverse=True)

    return {
        "generated_at": timezone.now().isoformat(),
        "customer_growth": {
            "new_riders_month": new_riders_month,
            "new_drivers_month": new_drivers_month,
            "new_merchants_month": new_merchants_month,
            "active_riders": User.objects.filter(user_type="rider", is_active=True).count(),
            "active_drivers": DriverProfile.objects.filter(status="approved").count(),
        },
        "city_growth": city_growth[:10],
        "merchant_growth": new_merchants_month,
        "driver_growth": new_drivers_month,
        "referral_growth": {
            "rider_referrals_month": rider_referrals,
            "driver_referrals_month": driver_referrals,
        },
        "marketing_campaign_results": growth.get("marketing", {}),
        "growth_summary": growth.get("summary", {}),
    }


def build_risk_dashboard() -> dict:
    """Computes a dynamic risk view based on current platform signals and
    cross-references the compliance risk register.
    """
    from .compliance_governance_service import build_ceo_governance_dashboard, build_risk_register

    governance = build_ceo_governance_dashboard()
    risk_register = build_risk_register(limit=50)
    compliance_score = governance.get("compliance_score", 60)
    open_risks = risk_register.get("summary", {}).get("by_status", {}).get("open", 0)
    critical_open = risk_register.get("summary", {}).get("critical_open", 0)

    try:
        from safety.models import SafetyIncident
        safety_open = SafetyIncident.objects.filter(
            status__in=["open", "acknowledged", "investigating"]
        ).count()
        sos_24h = SafetyIncident.objects.filter(
            incident_type="sos", created_at__gte=timezone.now() - timedelta(hours=24)
        ).count()
    except Exception:
        safety_open = 0
        sos_24h = 0

    failed_payments_24h = PaymentRecord.objects.filter(
        status="failed", created_at__gte=timezone.now() - timedelta(hours=24)
    ).count()

    pending_withdrawals = (
        WithdrawalRequest.objects.filter(status__in=["pending", "approved"])
        .aggregate(c=Count("id"))["c"]
        or 0
    )

    open_support = 0
    try:
        from taxi.drivers.models import SupportTicket
        open_support = SupportTicket.objects.filter(status__in=["open", "in_progress"]).count()
    except Exception:
        pass

    fraud_flags = 0
    try:
        from security.models import FraudFlag
        fraud_flags = FraudFlag.objects.filter(status="open").count()
    except Exception:
        pass

    overall_score = 100
    overall_score -= min(25, safety_open * 5)
    overall_score -= min(20, failed_payments_24h * 2)
    overall_score -= min(15, pending_withdrawals)
    overall_score -= min(15, open_support)
    overall_score -= min(15, fraud_flags * 3)
    overall_score -= min(10, sos_24h * 2)
    overall_score = max(0, overall_score)

    risk_level = "low"
    if overall_score < 50:
        risk_level = "critical"
    elif overall_score < 70:
        risk_level = "high"
    elif overall_score < 85:
        risk_level = "medium"

    return {
        "generated_at": timezone.now().isoformat(),
        "overall_risk_score": overall_score,
        "risk_level": risk_level,
        "categories": {
            "operational": {
                "score": max(0, 100 - safety_open * 5 - open_support * 2),
                "top_issues": [
                    f"{safety_open} open safety incidents",
                    f"{open_support} open support tickets",
                ],
            },
            "financial": {
                "score": max(0, 100 - failed_payments_24h * 2 - pending_withdrawals),
                "top_issues": [
                    f"{failed_payments_24h} failed payments (24h)",
                    f"{pending_withdrawals} pending withdrawals",
                ],
            },
            "security": {
                "score": max(0, 100 - fraud_flags * 5 - sos_24h * 2),
                "top_issues": [
                    f"{fraud_flags} open fraud flags",
                    f"{sos_24h} SOS events (24h)",
                ],
            },
            "compliance": {
                "score": compliance_score,
                "top_issues": governance.get("legal_action_items", [])[:5]
                or ["Google Play Data Safety incomplete", "Apple App Store not submitted"],
            },
            "technology": {
                "score": max(0, 100 - critical_open * 10 - open_risks * 2),
                "top_issues": [
                    f"{critical_open} critical open risks",
                    f"{open_risks} open compliance risks",
                ],
            },
        },
        "mitigation_status": {
            "open_risks": open_risks,
            "critical_open": critical_open,
            "by_status": risk_register.get("summary", {}).get("by_status", {}),
            "summary": f"{open_risks} open risks, {critical_open} critical — see compliance governance dashboard",
        },
        "governance_summary": {
            "compliance_score": compliance_score,
            "critical_risks": governance.get("critical_risks", 0),
            "outstanding_approvals": governance.get("outstanding_approvals", {}),
        },
    }


def build_strategic_planning(city_id=None) -> dict:
    multi_city = build_multi_city_dashboard(city_ids=[city_id] if city_id else None)
    forecast = build_ceo_forecast(city_id=city_id)
    readiness = []

    inactive_cities = City.objects.filter(is_active=False)
    for city in inactive_cities[:10]:
        ride_demand = Ride.objects.filter(pickup__icontains=city.name, status="completed").count()
        if ride_demand >= 5:
            readiness.append({
                "city_id": city.id,
                "name": city.name,
                "demand_signal": f"{ride_demand} completed rides mention this city",
                "ready": ride_demand >= 20,
            })

    investment_priorities = []
    if not inactive_cities.exists():
        investment_priorities.append("Expand to next city once Nouakchott metrics stabilize.")
    if forecast.get("driver_demand_estimate", 0) > 10:
        investment_priorities.append(
            f"Recruit {forecast['driver_demand_estimate']} additional drivers to close supply gap."
        )
    investment_priorities.append("Complete offsite backups and disaster recovery drills.")
    investment_priorities.append("Finalize Google Play compliance and Apple App Store submission.")

    return {
        "generated_at": timezone.now().isoformat(),
        "top_opportunities": [
            "Expand to cities with latent ride/delivery demand",
            "Launch corporate subscription packages",
            "Introduce scheduled delivery and multi-stop courier routes",
            "Scale driver incentive programs with proven ROI",
        ],
        "expansion_readiness": readiness,
        "new_city_readiness": readiness[:3],
        "investment_priorities": investment_priorities,
        "hiring_priorities": [
            "Operations Manager for second city",
            "QA Engineer for device and automation testing",
            "DevOps / SRE for monitoring and DR",
        ],
        "technology_priorities": [
            "Deploy staging environment",
            "Implement PgBouncer and Redis DB separation",
            "Add automated mobile UI/E2E tests",
            "Introduce CDN for static assets",
        ],
        "multi_city_summary": multi_city.get("ceo_overview", {}),
        "fleet_demand_forecast": forecast.get("fleet_requirement", {}),
    }


def build_board_reporting_suite(period: str = "weekly", city_id=None) -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "executive_summary": build_executive_summary(period=period, city_id=city_id),
        "business_kpis": build_business_kpis_report(city_id=city_id),
        "financial_report": build_financial_report(period=period, city_id=city_id),
        "operational_report": build_operational_report(city_id=city_id),
        "growth_report": build_growth_report(city_id=city_id),
        "risk_dashboard": build_risk_dashboard(),
        "strategic_planning": build_strategic_planning(city_id=city_id),
        "export_formats": ["csv", "excel", "pdf", "presentation"],
    }


def build_board_report_rows(report_type: str = "executive", period: str = "weekly", city_id=None) -> list[dict]:
    suite = build_board_reporting_suite(period=period, city_id=city_id)
    rows = []

    if report_type == "executive":
        summary = suite["executive_summary"]
        rows = [
            {"section": "Executive Summary", "metric": "period", "value": summary["period"]},
            {"section": "Executive Summary", "metric": "gmv_mru", "value": summary["gmv_mru"]},
            {"section": "Executive Summary", "metric": "completed_rides", "value": summary["completed_rides"]},
            {"section": "Executive Summary", "metric": "completed_deliveries", "value": summary["completed_deliveries"]},
            {"section": "Executive Summary", "metric": "cancellation_rate_pct", "value": summary["cancellation_rate_pct"]},
            {"section": "Executive Summary", "metric": "active_riders", "value": summary["active_riders"]},
            {"section": "Executive Summary", "metric": "active_drivers", "value": summary["active_drivers"]},
        ]
    elif report_type == "business_kpis":
        kpis = suite["business_kpis"]
        rows = [
            {"section": "Business KPIs", "metric": "revenue_mru", "value": kpis["revenue_mru"]},
            {"section": "Business KPIs", "metric": "gmv_mru", "value": kpis["gmv_mru"]},
            {"section": "Business KPIs", "metric": "completed_rides", "value": kpis["completed_rides"]},
            {"section": "Business KPIs", "metric": "completed_deliveries", "value": kpis["completed_deliveries"]},
            {"section": "Business KPIs", "metric": "active_riders", "value": kpis["active_riders"]},
            {"section": "Business KPIs", "metric": "active_drivers", "value": kpis["active_drivers"]},
            {"section": "Business KPIs", "metric": "revenue_growth_pct", "value": kpis["revenue_growth_pct"]},
        ]
    elif report_type == "financial":
        fin = suite["financial_report"]
        rows = [
            {"section": "Financial", "metric": "gross_revenue_mru", "value": fin["income_summary"]["gross_revenue_mru"]},
            {"section": "Financial", "metric": "platform_commission_mru", "value": fin["income_summary"]["platform_commission_mru"]},
            {"section": "Financial", "metric": "partner_revenue_share_mru", "value": fin["income_summary"]["partner_revenue_share_mru"]},
            {"section": "Financial", "metric": "operating_expenses_mru", "value": fin["operating_expenses_mru"]},
            {"section": "Financial", "metric": "net_cash_flow_mru", "value": fin["cash_flow_summary"]["net_cash_flow_mru"]},
            {"section": "Financial", "metric": "net_operating_income_mru", "value": fin["net_operating_income_mru"]},
            {"section": "Financial", "metric": "wallet_balance_mru", "value": fin["wallet_balance_mru"]},
            {"section": "Financial", "metric": "outstanding_liabilities_mru", "value": fin["outstanding_liabilities_mru"]},
        ]
    elif report_type == "operational":
        ops = suite["operational_report"]
        rows = [
            {"section": "Operational", "metric": "completed_rides", "value": ops["ride_performance"]["completed"]},
            {"section": "Operational", "metric": "completed_deliveries", "value": ops["delivery_performance"]["completed"]},
            {"section": "Operational", "metric": "open_incidents", "value": ops["incident_statistics"]["open_count"]},
            {"section": "Operational", "metric": "platform_uptime_pct", "value": ops["platform_uptime_pct"]},
        ]
    elif report_type == "growth":
        gr = suite["growth_report"]
        rows = [
            {"section": "Growth", "metric": "new_riders_month", "value": gr["customer_growth"]["new_riders_month"]},
            {"section": "Growth", "metric": "new_drivers_month", "value": gr["customer_growth"]["new_drivers_month"]},
            {"section": "Growth", "metric": "new_merchants_month", "value": gr["customer_growth"]["new_merchants_month"]},
            {"section": "Growth", "metric": "referral_growth_rider", "value": gr["referral_growth"]["rider_referrals_month"]},
            {"section": "Growth", "metric": "referral_growth_driver", "value": gr["referral_growth"]["driver_referrals_month"]},
        ]
    elif report_type == "risk":
        risk = suite["risk_dashboard"]
        rows = [
            {"section": "Risk", "metric": "overall_risk_score", "value": risk["overall_risk_score"]},
            {"section": "Risk", "metric": "risk_level", "value": risk["risk_level"]},
        ]
        for cat, vals in risk.get("categories", {}).items():
            rows.append({"section": "Risk", "metric": f"{cat}_score", "value": vals["score"]})
    elif report_type == "strategic":
        strat = suite["strategic_planning"]
        rows = [
            {"section": "Strategic", "metric": "new_city_candidates", "value": len(strat["new_city_readiness"])},
            {"section": "Strategic", "metric": "investment_priorities", "value": "; ".join(strat["investment_priorities"])},
        ]
    else:
        rows = [{"section": "Board Report", "metric": "type", "value": report_type}]

    return rows
