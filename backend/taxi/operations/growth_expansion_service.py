"""Phase 26 — Growth & Expansion Dashboard service layer (CEO)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from locations.models import City
from payments.models import PaymentRecord
from promotions.models import PromoCodeUsage
from referrals.models import DriverReferral, RiderReferral, RiderReferralCode
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .ai_operations_service import build_financial_insights, build_surge_monitor
from .business_ops_service import build_marketing_analytics, build_marketing_dashboard
from .executive_service import _dec, _payment_qs, build_finance_dashboard
from .fleet_performance_service import build_fleet_ceo_metrics
from .launch_service import build_business_kpis, _retention_rate

User = get_user_model()


def _month_start():
    return timezone.localdate().replace(day=1)


def build_growth_metrics(city_id=None) -> dict:
    today = timezone.localdate()
    month_start = _month_start()
    week_start = today - timedelta(days=6)

    riders = User.objects.filter(user_type="rider")
    total_riders = riders.count()
    new_riders_month = riders.filter(date_joined__date__gte=month_start).count()
    new_riders_week = riders.filter(date_joined__date__gte=week_start).count()
    new_riders_today = riders.filter(date_joined__date=today).count()

    kpis = build_business_kpis(city_id=city_id)
    user_metrics = kpis.get("users", {})

    approved_drivers = DriverProfile.objects.filter(status="approved")
    if city_id:
        approved_drivers = approved_drivers.filter(user__city_id=city_id)
    new_drivers_month = approved_drivers.filter(user__date_joined__date__gte=month_start).count()

    courier_ids = set(
        Delivery.objects.filter(driver__isnull=False).values_list("driver_id", flat=True).distinct()
    )
    new_couriers_month = User.objects.filter(
        id__in=courier_ids, date_joined__date__gte=month_start
    ).count()

    referral_codes = RiderReferralCode.objects.count()
    rider_referrals_total = RiderReferral.objects.count()
    rider_referrals_month = RiderReferral.objects.filter(created_at__date__gte=month_start).count()
    driver_referrals_total = DriverReferral.objects.count()
    driver_referrals_month = DriverReferral.objects.filter(created_at__date__gte=month_start).count()

    registration_chart = []
    cursor = today - timedelta(days=13)
    while cursor <= today:
        registration_chart.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "riders": riders.filter(date_joined__date=cursor).count(),
                "drivers": DriverProfile.objects.filter(
                    status="approved", user__date_joined__date=cursor
                ).count(),
            }
        )
        cursor += timedelta(days=1)

    return {
        "total_registered_riders": total_riders,
        "monthly_active_riders": user_metrics.get("mau", 0),
        "daily_active_riders": user_metrics.get("dau", 0),
        "weekly_active_riders": user_metrics.get("wau", 0),
        "new_registrations": {
            "today": new_riders_today,
            "week": new_riders_week,
            "month": new_riders_month,
        },
        "referral_growth": {
            "rider_codes": referral_codes,
            "rider_referrals_total": rider_referrals_total,
            "rider_referrals_month": rider_referrals_month,
            "driver_referrals_total": driver_referrals_total,
            "driver_referrals_month": driver_referrals_month,
        },
        "driver_growth": {
            "approved_total": approved_drivers.count(),
            "new_month": new_drivers_month,
        },
        "courier_growth": {
            "active_total": len(courier_ids),
            "new_month": new_couriers_month,
        },
        "registration_chart": registration_chart,
    }


def build_revenue_growth(city_id=None) -> dict:
    today = timezone.localdate()
    daily = build_finance_dashboard(period="daily", city_id=city_id)
    weekly = build_finance_dashboard(period="weekly", city_id=city_id)
    monthly = build_finance_dashboard(period="monthly", city_id=city_id)
    kpis = build_business_kpis(city_id=city_id)

    month_start = _month_start()
    rides = Ride.objects.filter(status="completed", completed_at__date__gte=month_start)
    deliveries = Delivery.objects.filter(status="delivered", delivered_at__date__gte=month_start)
    if city_id:
        rides = rides.filter(city_id=city_id)

    ride_count = rides.count()
    delivery_count = deliveries.count()
    ride_revenue = rides.aggregate(total=Sum("fare"))["total"] or Decimal("0")
    delivery_revenue = deliveries.aggregate(total=Sum("fare"))["total"] or Decimal("0")

    trend = []
    cursor = today - timedelta(days=29)
    while cursor <= today:
        day_payments = _payment_qs(cursor, cursor)
        trend.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "revenue": float(day_payments.aggregate(total=Sum("amount"))["total"] or 0),
                "commission": float(day_payments.aggregate(total=Sum("app_fee"))["total"] or 0),
            }
        )
        cursor += timedelta(days=1)

    return {
        "daily": daily.get("summary", {}),
        "weekly": weekly.get("summary", {}),
        "monthly": monthly.get("summary", {}),
        "revenue_trend": trend,
        "average_revenue_per_ride": _dec(ride_revenue / ride_count) if ride_count else "0.00",
        "average_revenue_per_delivery": _dec(delivery_revenue / delivery_count) if delivery_count else "0.00",
        "averages_from_kpis": kpis.get("averages", {}),
    }


def build_marketing_performance() -> dict:
    marketing = build_marketing_dashboard()
    analytics = build_marketing_analytics()
    today = timezone.localdate()
    month_start = _month_start()
    thirty_days_ago = timezone.now() - timedelta(days=30)

    new_riders_30d = User.objects.filter(
        user_type="rider", date_joined__gte=thirty_days_ago
    ).count()
    promo_usages_30d = PromoCodeUsage.objects.filter(created_at__gte=thirty_days_ago)
    promo_discount_total = promo_usages_30d.aggregate(total=Sum("discount_amount"))["total"] or Decimal("0")
    cac_estimate = (
        _dec(promo_discount_total / new_riders_30d) if new_riders_30d else "0.00"
    )

    repeat_riders = (
        Ride.objects.filter(status="completed")
        .values("rider_id")
        .annotate(trip_count=Count("id"))
        .filter(trip_count__gte=2)
        .count()
    )
    total_riders_with_trips = (
        Ride.objects.filter(status="completed").values("rider_id").distinct().count()
    )
    repeat_rate = (
        round(100 * repeat_riders / total_riders_with_trips, 1) if total_riders_with_trips else 0
    )

    sixty_days_ago = today - timedelta(days=60)
    thirty_days_back = today - timedelta(days=30)
    reactivated = 0
    for rider_id in Ride.objects.filter(
        status="completed", completed_at__date__gte=thirty_days_back
    ).values_list("rider_id", flat=True).distinct():
        had_prior = Ride.objects.filter(
            rider_id=rider_id,
            status="completed",
            completed_at__date__lt=thirty_days_back,
            completed_at__date__gte=sixty_days_ago,
        ).exists()
        had_gap = not Ride.objects.filter(
            rider_id=rider_id,
            status="completed",
            completed_at__date__gte=thirty_days_back,
            completed_at__date__lt=thirty_days_back,
        ).exists()
        recent = Ride.objects.filter(
            rider_id=rider_id,
            status="completed",
            completed_at__date__gte=thirty_days_back,
        ).exists()
        if had_prior and had_gap and recent:
            reactivated += 1

    referral_campaigns = [
        c for c in marketing.get("campaigns", []) if c.get("channel") == "referral"
    ] or marketing.get("campaigns", [])[:5]

    kpis = build_business_kpis()
    retention = kpis.get("retention", {})

    today = timezone.localdate()
    riders_prev = set(
        Ride.objects.filter(
            completed_at__date__gte=today - timedelta(days=13),
            completed_at__date__lt=today - timedelta(days=6),
        ).values_list("rider_id", flat=True)
    )
    riders_curr = set(
        Ride.objects.filter(completed_at__date__gte=today - timedelta(days=6)).values_list(
            "rider_id", flat=True
        )
    )
    rider_retention_pct = _retention_rate(riders_prev, riders_curr)

    return {
        "referral_campaigns": referral_campaigns,
        "promo_code_usage": marketing.get("promo_codes", {}),
        "recent_promos": marketing.get("recent_promos", []),
        "referrals": marketing.get("referrals", {}),
        "analytics": analytics,
        "customer_acquisition_cost_estimate": cac_estimate,
        "retention_rate_pct": rider_retention_pct,
        "driver_retention_pct": retention.get("driver_retention_pct"),
        "courier_retention_pct": retention.get("courier_retention_pct"),
        "repeat_riders": repeat_riders,
        "repeat_rider_rate_pct": repeat_rate,
        "reactivated_users_30d": reactivated,
        "new_riders_30d": new_riders_30d,
    }


def build_geographic_expansion(city_id=None) -> dict:
    active_cities = list(
        City.objects.filter(is_active=True).values("id", "name", "slug", "latitude", "longitude")
    )
    city_rows = []

    for city in active_cities:
        cid = city["id"]
        ride_demand = Ride.objects.filter(city_id=cid, created_at__date__gte=_month_start()).count()
        completed_rides = Ride.objects.filter(
            city_id=cid, status="completed", completed_at__date__gte=_month_start()
        ).count()
        delivery_demand = Delivery.objects.filter(
            service_city__icontains=city["name"], created_at__date__gte=_month_start()
        ).count()
        supply = DriverProfile.objects.filter(status="approved", user__city_id=cid).count()
        online_supply = DriverProfile.objects.filter(
            status="approved", user__city_id=cid, is_available=True
        ).count()
        demand_total = ride_demand + delivery_demand
        ratio = round(demand_total / max(supply, 1), 2)

        city_rows.append(
            {
                "city_id": cid,
                "city_name": city["name"],
                "demand": demand_total,
                "ride_demand": ride_demand,
                "delivery_demand": delivery_demand,
                "completed_rides": completed_rides,
                "supply": supply,
                "online_supply": online_supply,
                "demand_supply_ratio": ratio,
            }
        )

    city_rows.sort(key=lambda row: row["demand"], reverse=True)

    surge = build_surge_monitor(city_id=city_id)
    recommendations = []
    for zone in surge.get("zones", [])[:15]:
        if zone.get("demand_ratio", 0) >= 1.5 or zone.get("waiting_riders", 0) >= 2:
            recommendations.append(
                {
                    "lat": zone.get("lat"),
                    "lng": zone.get("lng"),
                    "label": zone.get("label") or "High-demand zone",
                    "demand_ratio": zone.get("demand_ratio"),
                    "waiting_riders": zone.get("waiting_riders", 0),
                    "suggested_action": zone.get("suggested_action", "Add drivers or expand service area"),
                }
            )

    inactive_cities = City.objects.filter(is_active=False).values("id", "name")[:10]
    for city in inactive_cities:
        delivery_interest = Delivery.objects.filter(service_city__icontains=city["name"]).count()
        if delivery_interest >= 5:
            recommendations.append(
                {
                    "city_id": city["id"],
                    "label": city["name"],
                    "demand_ratio": None,
                    "waiting_riders": delivery_interest,
                    "suggested_action": "Activate city — latent delivery demand detected",
                }
            )

    return {
        "active_cities": active_cities,
        "city_performance": city_rows,
        "recommended_expansion_areas": recommendations[:20],
    }


def build_ceo_forecast(city_id=None) -> dict:
    insights = build_financial_insights()
    kpis = build_business_kpis(city_id=city_id)
    fleet = build_fleet_ceo_metrics(city_id=city_id)

    growth_chart = kpis.get("growth_chart", [])
    if len(growth_chart) >= 7:
        recent_users = sum(row.get("active_users", 0) for row in growth_chart[-7:])
        prior_users = sum(row.get("active_users", 0) for row in growth_chart[-14:-7]) or 1
        monthly_growth_pct = round(100 * (recent_users - prior_users) / prior_users, 1)
    else:
        monthly_growth_pct = None

    daily_forecast = Decimal(insights.get("forecast", {}).get("daily_revenue", "0"))
    monthly_revenue_forecast = _dec(daily_forecast * 30)

    approved_drivers = DriverProfile.objects.filter(status="approved").count()
    online_drivers = DriverProfile.objects.filter(status="approved", is_available=True).count()
    utilization = fleet.get("fleet_utilization_pct", 0)

    waiting_riders = Ride.objects.filter(status="requested", driver__isnull=True).count()
    driver_demand_estimate = max(waiting_riders, 0) + max(
        int((100 - (utilization or 0)) / 10), 0
    )

    fleet_requirement = {
        "current_approved": approved_drivers,
        "online_now": online_drivers,
        "utilization_pct": utilization,
        "additional_drivers_recommended": driver_demand_estimate,
        "rationale": "Based on waiting riders and fleet utilization",
    }

    return {
        "monthly_growth_pct": monthly_growth_pct,
        "driver_demand_estimate": driver_demand_estimate,
        "revenue_forecast": {
            "daily": insights.get("forecast", {}).get("daily_revenue"),
            "weekly": insights.get("forecast", {}).get("weekly_revenue"),
            "monthly": monthly_revenue_forecast,
        },
        "actual_baseline": insights.get("actual", {}),
        "fleet_requirements": fleet_requirement,
        "disclaimer": insights.get("disclaimer"),
    }


def build_growth_expansion_dashboard(city_id=None) -> dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "growth_metrics": build_growth_metrics(city_id),
        "revenue_growth": build_revenue_growth(city_id),
        "marketing_performance": build_marketing_performance(),
        "geographic_expansion": build_geographic_expansion(city_id),
        "ceo_forecast": build_ceo_forecast(city_id),
    }


def build_growth_export_rows(city_id=None) -> list[dict]:
    dashboard = build_growth_expansion_dashboard(city_id)
    rows = [{"section": "meta", "metric": "generated_at", "value": dashboard["generated_at"]}]

    growth = dashboard["growth_metrics"]
    for key, value in {
        "total_registered_riders": growth.get("total_registered_riders"),
        "monthly_active_riders": growth.get("monthly_active_riders"),
        "daily_active_riders": growth.get("daily_active_riders"),
        "new_registrations_month": growth.get("new_registrations", {}).get("month"),
        "driver_growth_total": growth.get("driver_growth", {}).get("approved_total"),
        "courier_growth_total": growth.get("courier_growth", {}).get("active_total"),
    }.items():
        rows.append({"section": "growth", "metric": key, "value": value})

    revenue = dashboard["revenue_growth"]
    for key, value in {
        "daily_gross_revenue": revenue.get("daily", {}).get("gross_revenue"),
        "weekly_gross_revenue": revenue.get("weekly", {}).get("gross_revenue"),
        "monthly_gross_revenue": revenue.get("monthly", {}).get("gross_revenue"),
        "avg_revenue_per_ride": revenue.get("average_revenue_per_ride"),
        "avg_revenue_per_delivery": revenue.get("average_revenue_per_delivery"),
    }.items():
        rows.append({"section": "revenue", "metric": key, "value": value})

    marketing = dashboard["marketing_performance"]
    for key, value in {
        "cac_estimate": marketing.get("customer_acquisition_cost_estimate"),
        "repeat_riders": marketing.get("repeat_riders"),
        "reactivated_users_30d": marketing.get("reactivated_users_30d"),
        "promo_usages": marketing.get("promo_code_usage", {}).get("total_usages"),
    }.items():
        rows.append({"section": "marketing", "metric": key, "value": value})

    forecast = dashboard["ceo_forecast"]
    for key, value in {
        "monthly_growth_pct": forecast.get("monthly_growth_pct"),
        "monthly_revenue_forecast": forecast.get("revenue_forecast", {}).get("monthly"),
        "driver_demand_estimate": forecast.get("driver_demand_estimate"),
        "additional_drivers_recommended": forecast.get("fleet_requirements", {}).get(
            "additional_drivers_recommended"
        ),
    }.items():
        rows.append({"section": "forecast", "metric": key, "value": value})

    for city in dashboard["geographic_expansion"].get("city_performance", [])[:15]:
        rows.append(
            {
                "section": "geography",
                "metric": f"city_{city['city_name']}_demand",
                "value": city.get("demand"),
            }
        )

    return rows
