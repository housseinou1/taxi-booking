"""Phase 37 — Business Intelligence & Data Warehouse unified analytics layer.

This module provides a read-only, cached aggregation layer that reuses
existing services and ORM queries. It does not introduce new operational
business logic; it exposes existing data in a BI-friendly shape.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from merchants.models import Merchant, MerchantOrder
from payments.models import PaymentRecord, RefundRequest, WithdrawalRequest
from referrals.models import DriverReferral, RiderReferral
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .ai_operations_service import (
    build_financial_insights,
    build_hotspot_map,
    build_predictive_alerts,
    build_surge_monitor,
)
from .executive_service import _dec, build_finance_dashboard, build_live_metrics, build_qa_reconciliation
from .growth_expansion_service import build_business_kpis, build_ceo_forecast, build_growth_metrics
from .incentive_engine_service import build_ceo_dashboard as build_incentive_ceo_dashboard
from .launch_command_service import build_city_heat_map
from .trust_safety_service import build_ceo_safety_dashboard

User = get_user_model()

SUBJECT_AREAS = {
    "rides",
    "deliveries",
    "merchants",
    "drivers",
    "couriers",
    "customers",
    "wallets",
    "payments",
    "finance",
    "support",
    "trust_safety",
    "incentives",
    "marketing",
}


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


def subject_area_rides(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    qs = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        qs = qs.filter(city_id=city_id)
    return {
        "subject": "rides",
        "period": period,
        "completed": qs.filter(status="completed").count(),
        "cancelled": qs.filter(status="cancelled").count(),
        "total": qs.count(),
        "revenue_mru": _dec(
            PaymentRecord.objects.filter(
                status="paid",
                ride_id__in=qs.values_list("id", flat=True),
                created_at__date__gte=start,
                created_at__date__lte=end,
            ).aggregate(t=Sum("amount"))["t"]
            or 0
        ),
        "driver_earnings_mru": _dec(
            qs.filter(status="completed").aggregate(t=Sum("driver_earning"))["t"] or 0
        ),
        "avg_wait_time_minutes": _avg_wait_time(qs),
    }


def subject_area_deliveries(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    qs = Delivery.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        from locations.models import City

        city = City.objects.filter(id=city_id).first()
        if city:
            qs = qs.filter(service_city__iexact=city.name)
    return {
        "subject": "deliveries",
        "period": period,
        "completed": qs.filter(status="delivered").count(),
        "cancelled": qs.filter(status="cancelled").count(),
        "total": qs.count(),
        "delivery_fees_mru": _dec(
            qs.filter(status="delivered").aggregate(t=Sum("fare"))["t"] or 0
        ),
    }


def subject_area_merchants(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    qs = Merchant.objects.filter(status="active")
    if city_id:
        qs = qs.filter(city_id=city_id)
    orders = MerchantOrder.objects.filter(
        status__in=["paid", "delivered"],
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    if city_id:
        orders = orders.filter(merchant__city_id=city_id)
    return {
        "subject": "merchants",
        "active": qs.count(),
        "pending": Merchant.objects.filter(status="pending").count(),
        "sales_mru": _dec(orders.aggregate(t=Sum("total"))["t"] or 0),
        "orders": orders.count(),
    }


def subject_area_drivers(city_id=None, period="monthly"):
    qs = DriverProfile.objects.filter(user__user_type="driver")
    if city_id:
        qs = qs.filter(user__city_id=city_id)
    approved = qs.filter(status="approved")
    return {
        "subject": "drivers",
        "approved": approved.count(),
        "online": approved.filter(is_available=True).count(),
        "pending": qs.filter(status="pending").count(),
        "avg_rating": _avg_driver_rating(qs),
    }


def subject_area_couriers(city_id=None, period="monthly"):
    qs = DriverProfile.objects.filter(user__user_type="courier")
    if city_id:
        qs = qs.filter(user__city_id=city_id)
    approved = qs.filter(status="approved")
    return {
        "subject": "couriers",
        "approved": approved.count(),
        "online": approved.filter(is_available=True).count(),
        "pending": qs.filter(status="pending").count(),
    }


def subject_area_customers(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    qs = User.objects.filter(user_type="rider")
    if city_id:
        qs = qs.filter(city_id=city_id)
    return {
        "subject": "customers",
        "total": qs.count(),
        "active": qs.filter(is_active=True).count(),
        "new_period": qs.filter(date_joined__date__gte=start).count(),
        "referrals": RiderReferral.objects.filter(created_at__date__gte=start).count(),
    }


def subject_area_wallets(city_id=None, period="monthly"):
    from payments.models import WalletAccount

    return {
        "subject": "wallets",
        "total_balance_mru": _dec(WalletAccount.objects.aggregate(t=Sum("balance"))["t"] or 0),
        "pending_withdrawals_mru": _dec(
            WithdrawalRequest.objects.filter(status__in=["pending", "approved"])
            .aggregate(t=Sum("amount"))["t"]
            or 0
        ),
        "completed_withdrawals_count": WithdrawalRequest.objects.filter(
            status__in=["approved", "paid"]
        ).count(),
    }


def subject_area_payments(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    qs = PaymentRecord.objects.filter(status="paid", created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        ride_ids = Ride.objects.filter(city_id=city_id).values_list("id", flat=True)
        qs = qs.filter(ride_id__in=ride_ids)
    return {
        "subject": "payments",
        "gross_mru": _dec(qs.aggregate(t=Sum("amount"))["t"] or 0),
        "commission_mru": _dec(qs.aggregate(t=Sum("app_fee"))["t"] or 0),
        "refunds_mru": _dec(
            RefundRequest.objects.filter(
                status="refunded", created_at__date__gte=start, created_at__date__lte=end
            ).aggregate(t=Sum("amount"))["t"]
            or 0
        ),
        "failed_count": PaymentRecord.objects.filter(
            status="failed", created_at__date__gte=start
        ).count(),
    }


def subject_area_finance(city_id=None, period="monthly"):
    dashboard = build_finance_dashboard(period=period, city_id=city_id)
    return {"subject": "finance", **dashboard.get("summary", {}), "period": period}


def subject_area_support(city_id=None, period="monthly"):
    from .executive_service import build_support_panel

    return {"subject": "support", **build_support_panel()}


def subject_area_trust_safety(city_id=None, period="monthly"):
    return {"subject": "trust_safety", **build_ceo_safety_dashboard(city_id=city_id)}


def subject_area_incentives(city_id=None, period="monthly"):
    return {"subject": "incentives", **build_incentive_ceo_dashboard(city_id=city_id)}


def subject_area_marketing(city_id=None, period="monthly"):
    start, end = _date_bounds(period)
    return {
        "subject": "marketing",
        "rider_referrals": RiderReferral.objects.filter(created_at__date__gte=start).count(),
        "driver_referrals": DriverReferral.objects.filter(created_at__date__gte=start).count(),
        "active_merchants": Merchant.objects.filter(status="active").count(),
    }


def _avg_wait_time(qs):
    waiting = qs.filter(status="requested", driver__isnull=True)
    if not waiting.exists():
        return 0
    total = sum((timezone.now() - r.created_at).total_seconds() / 60 for r in waiting[:100])
    return round(total / min(waiting.count(), 100), 1)


def _avg_driver_rating(qs):
    avg = qs.filter(average_rating__isnull=False).aggregate(a=Avg("average_rating"))["a"]
    return round(float(avg), 1) if avg else None


def get_subject_area(name: str, city_id=None, period="monthly") -> dict:
    if name not in SUBJECT_AREAS:
        return {"error": "Invalid subject area"}
    builders = {
        "rides": subject_area_rides,
        "deliveries": subject_area_deliveries,
        "merchants": subject_area_merchants,
        "drivers": subject_area_drivers,
        "couriers": subject_area_couriers,
        "customers": subject_area_customers,
        "wallets": subject_area_wallets,
        "payments": subject_area_payments,
        "finance": subject_area_finance,
        "support": subject_area_support,
        "trust_safety": subject_area_trust_safety,
        "incentives": subject_area_incentives,
        "marketing": subject_area_marketing,
    }
    return builders[name](city_id=city_id, period=period)


def build_subject_area_summary(city_id=None, period="monthly", areas=None) -> dict:
    if areas is None:
        areas = list(SUBJECT_AREAS)
    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "city_id": city_id,
        "subject_areas": {area: get_subject_area(area, city_id=city_id, period=period) for area in areas},
    }


def build_executive_analytics(city_id=None, period="monthly") -> dict:
    start, end = _date_bounds(period)
    finance = build_finance_dashboard(period=period, city_id=city_id)
    growth = build_growth_metrics(city_id=city_id)
    forecast = build_ceo_forecast(city_id=city_id)

    rides_completed = Ride.objects.filter(
        status="completed", completed_at__date__gte=start, completed_at__date__lte=end
    )
    deliveries_completed = Delivery.objects.filter(
        status="delivered", delivered_at__date__gte=start, delivered_at__date__lte=end
    )
    if city_id:
        rides_completed = rides_completed.filter(city_id=city_id)

    previous_start = start - (end - start + timedelta(days=1))
    previous_end = start - timedelta(days=1)
    prev_rides = Ride.objects.filter(
        status="completed", completed_at__date__gte=previous_start, completed_at__date__lte=previous_end
    )
    if city_id:
        prev_rides = prev_rides.filter(city_id=city_id)

    ride_growth = _pct_change(prev_rides.count(), rides_completed.count())
    delivery_growth = _pct_change(
        Delivery.objects.filter(
            status="delivered", delivered_at__date__gte=previous_start, delivered_at__date__lte=previous_end
        ).count(),
        deliveries_completed.count(),
    )

    revenue_current = Decimal(finance.get("summary", {}).get("gross_revenue", "0"))
    payments_prev = PaymentRecord.objects.filter(
        status="paid", created_at__date__gte=previous_start, created_at__date__lte=previous_end
    )
    revenue_prev = payments_prev.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    revenue_growth = _pct_change(revenue_prev, revenue_current)

    rides_qs = Ride.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if city_id:
        rides_qs = rides_qs.filter(city_id=city_id)

    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "revenue_mru": _dec(revenue_current),
        "gmv_mru": _dec(revenue_current),
        "completed_rides": rides_completed.count(),
        "completed_deliveries": deliveries_completed.count(),
        "ride_growth_pct": ride_growth,
        "delivery_growth_pct": delivery_growth,
        "revenue_growth_pct": revenue_growth,
        "customer_retention_pct": forecast.get("retention_metrics", {}).get("rider_retention_30d"),
        "driver_retention_pct": forecast.get("retention_metrics", {}).get("driver_retention_30d"),
        "merchant_growth": Merchant.objects.filter(status="active").count(),
        "avg_response_time_minutes": _avg_support_response(),
        "avg_wait_time_minutes": _avg_wait_time(rides_qs),
        "growth_summary": growth.get("summary", {}),
    }


def _pct_change(previous, current):
    if not previous:
        return None
    try:
        return round(float((current - previous) / previous * 100), 1)
    except Exception:
        return None


def _avg_support_response():
    from taxi.drivers.models import SupportTicket

    resolved = SupportTicket.objects.filter(resolved_at__isnull=False, created_at__isnull=False)
    if not resolved.exists():
        return None
    total = 0
    count = 0
    for ticket in resolved[:200]:
        total += (ticket.resolved_at - ticket.created_at).total_seconds() / 60
        count += 1
    return round(total / count, 1) if count else None


def build_geographic_intelligence(city_id=None) -> dict:
    heat = build_city_heat_map(city_id=city_id, period="hour")
    surge = build_surge_monitor(city_id=city_id)
    growth = build_growth_metrics(city_id=city_id)

    ride_density = []
    for row in (
        Ride.objects.filter(status="completed")
        .values("city_id")
        .annotate(count=Count("id"))
        .order_by("-count")[:20]
    ):
        ride_density.append({"city_id": row["city_id"], "rides": row["count"]})

    revenue_by_district = []
    from locations.models import City

    for city in City.objects.filter(is_active=True)[:30]:
        total = PaymentRecord.objects.filter(
            status="paid",
            ride_id__in=Ride.objects.filter(city_id=city.id).values_list("id", flat=True),
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        if total:
            revenue_by_district.append({"city_id": city.id, "revenue_mru": _dec(total)})
    revenue_by_district.sort(key=lambda row: Decimal(row["revenue_mru"]), reverse=True)
    revenue_by_district = revenue_by_district[:20]

    return {
        "generated_at": timezone.now().isoformat(),
        "demand_heatpoints": heat.get("heat_points", []),
        "supply_demand": {
            "shortage_areas": heat.get("shortage_areas", []),
            "long_eta_areas": heat.get("long_eta_areas", []),
            "surge_zones": surge.get("zones", []),
        },
        "ride_density": ride_density,
        "delivery_density": list(
            Delivery.objects.filter(status="delivered")
            .values("service_city")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        ),
        "revenue_by_district": revenue_by_district,
        "expansion_opportunities": growth.get("recommended_expansion_areas", []),
    }


def build_predictive_analytics(city_id=None) -> dict:
    financial = build_financial_insights()
    alerts = build_predictive_alerts()
    forecast = build_ceo_forecast(city_id=city_id)
    heat = build_hotspot_map(period="day", city_id=city_id)

    return {
        "generated_at": timezone.now().isoformat(),
        "demand_forecast": {
            "peak_hours": build_surge_monitor(city_id=city_id).get("peak_hours", []),
            "hotspot_summary": heat.get("summary", {}),
        },
        "driver_supply_forecast": forecast.get("fleet_requirement", {}),
        "revenue_forecast": financial.get("forecast", {}),
        "merchant_demand": list(
            MerchantOrder.objects.filter(status__in=["paid", "delivered"])
            .values("merchant__business_name")
            .annotate(orders=Count("id"))
            .order_by("-orders")[:10]
        ),
        "predictive_alerts": alerts[:20],
    }


def build_bi_export_rows(report_type: str, city_id=None, period="monthly") -> list[dict]:
    rows = []
    if report_type == "subject_areas":
        summary = build_subject_area_summary(city_id=city_id, period=period)
        for area, data in summary["subject_areas"].items():
            for key, value in data.items():
                if key in ("subject", "period"):
                    continue
                rows.append({"subject_area": area, "metric": key, "value": value})
    elif report_type == "executive_analytics":
        data = build_executive_analytics(city_id=city_id, period=period)
        for key, value in data.items():
            if key != "generated_at":
                rows.append({"section": "Executive Analytics", "metric": key, "value": value})
    elif report_type == "geographic":
        data = build_geographic_intelligence(city_id=city_id)
        rows.append({"section": "Geographic", "metric": "demand_heatpoints_count", "value": len(data.get("demand_heatpoints", []))})
        rows.append({"section": "Geographic", "metric": "shortage_areas_count", "value": len(data.get("supply_demand", {}).get("shortage_areas", []))})
        rows.append({"section": "Geographic", "metric": "expansion_opportunities_count", "value": len(data.get("expansion_opportunities", []))})
    elif report_type == "predictive":
        data = build_predictive_analytics(city_id=city_id)
        rows.append({"section": "Predictive", "metric": "daily_revenue_forecast", "value": data["revenue_forecast"].get("daily_revenue")})
        rows.append({"section": "Predictive", "metric": "weekly_revenue_forecast", "value": data["revenue_forecast"].get("weekly_revenue")})
        rows.append({"section": "Predictive", "metric": "predictive_alerts_count", "value": len(data.get("predictive_alerts", []))})
    return rows


def build_bi_data_warehouse_overview(city_id=None, period="monthly") -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "period": period,
        "city_id": city_id,
        "subject_areas": build_subject_area_summary(city_id=city_id, period=period)["subject_areas"],
        "executive_analytics": build_executive_analytics(city_id=city_id, period=period),
        "geographic_intelligence": build_geographic_intelligence(city_id=city_id),
        "predictive_analytics": build_predictive_analytics(city_id=city_id),
        "data_quality": build_qa_reconciliation(),
        "data_governance": {
            "subject_areas": sorted(SUBJECT_AREAS),
            "refresh_schedule": "on-demand aggregation with 5-minute cache",
            "access_roles": ["CEO", "Finance", "Operations", "Analytics"],
            "retention_policy": "Aggregated metrics only; no PII in BI exports",
            "audit_logging": "Report exports and admin actions are audited",
        },
    }
