"""Phase 27 — Multi-City Operations Platform service layer."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from locations.models import City
from payments.models import PaymentRecord, WalletAccount, WithdrawalRequest
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .executive_service import DELIVERY_ACTIVE, RIDE_ACTIVE, _dec, _payment_qs
from .launch_service import build_business_kpis
from .models import OpsCityProfile
from .operations_center_service import build_fleet_snapshot, build_hourly_analytics

User = get_user_model()

TARGET_CITY_NAMES = [
    "Nouakchott",
    "Nouadhibou",
    "Rosso",
    "Kaédi",
    "Kaedi",
    "Kiffa",
    "Atar",
    "Zouerat",
    "Zouerate",
]


def _month_start():
    return timezone.localdate().replace(day=1)


def _city_rides(city_id: int, start=None, end=None):
    qs = Ride.objects.filter(city_id=city_id)
    if start:
        qs = qs.filter(created_at__date__gte=start)
    if end:
        qs = qs.filter(created_at__date__lte=end)
    return qs


def _city_deliveries(city_name: str, start=None, end=None):
    qs = Delivery.objects.filter(service_city__icontains=city_name)
    if start:
        qs = qs.filter(created_at__date__gte=start)
    if end:
        qs = qs.filter(created_at__date__lte=end)
    return qs


def _serialize_city_profile(profile: OpsCityProfile) -> dict:
    city = profile.city
    return {
        "id": profile.id,
        "city_id": city.id,
        "name": city.name,
        "slug": city.name.lower().replace(" ", "-").replace("é", "e").replace("è", "e"),
        "status": profile.status,
        "is_active": city.is_active,
        "latitude": city.latitude,
        "longitude": city.longitude,
        "timezone": profile.timezone,
        "currency": profile.currency,
        "service_zones": profile.service_zones or [],
        "operations_manager_id": profile.operations_manager_id,
        "operations_manager_email": profile.operations_manager.email if profile.operations_manager else None,
        "finance_manager_id": profile.finance_manager_id,
        "finance_manager_email": profile.finance_manager.email if profile.finance_manager else None,
        "support_manager_id": profile.support_manager_id,
        "support_manager_email": profile.support_manager.email if profile.support_manager else None,
        "notes": profile.notes,
        "updated_at": profile.updated_at.isoformat(),
    }


def list_city_profiles(city_ids: list[int] | None = None) -> list[dict]:
    qs = OpsCityProfile.objects.select_related(
        "city", "operations_manager", "finance_manager", "support_manager"
    )
    if city_ids is not None:
        qs = qs.filter(city_id__in=city_ids)
    return [_serialize_city_profile(p) for p in qs.order_by("city__name")]


def get_city_profile(city_id: int) -> dict | None:
    profile = (
        OpsCityProfile.objects.select_related(
            "city", "operations_manager", "finance_manager", "support_manager"
        )
        .filter(city_id=city_id)
        .first()
    )
    if not profile:
        return None
    return _serialize_city_profile(profile)


def build_city_fleet_metrics(city_id: int, city_name: str) -> dict:
    fleet = build_fleet_snapshot(city_id)
    counts = fleet.get("counts", {})
    riders = User.objects.filter(user_type="rider", city_id=city_id).count()
    drivers = DriverProfile.objects.filter(status="approved", user__city_id=city_id).count()
    couriers = (
        Delivery.objects.filter(service_city__icontains=city_name, driver__isnull=False)
        .values("driver_id")
        .distinct()
        .count()
    )

    return {
        "city_id": city_id,
        "city_name": city_name,
        "drivers": drivers,
        "couriers": couriers,
        "riders": riders,
        "online_drivers": counts.get("online_drivers", 0),
        "online_couriers": counts.get("online_couriers", 0),
        "active_rides": counts.get("active_trips", 0),
        "active_deliveries": counts.get("active_deliveries", 0),
        "waiting_riders": counts.get("waiting_riders", 0),
    }


def build_city_financial_metrics(city_id: int, city_name: str) -> dict:
    today = timezone.localdate()
    month_start = _month_start()

    rides = _city_rides(city_id, month_start, today).filter(status="completed")
    ride_revenue = rides.aggregate(total=Sum("fare"))["total"] or Decimal("0")
    commission = rides.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")

    payments = PaymentRecord.objects.filter(status="paid", created_at__date__gte=month_start)
    failed = PaymentRecord.objects.filter(status="failed", created_at__date__gte=month_start).aggregate(
        count=Count("id"), total=Sum("amount")
    )

    driver_ids = DriverProfile.objects.filter(user__city_id=city_id).values_list("user_id", flat=True)
    withdrawals = WithdrawalRequest.objects.filter(
        driver_id__in=driver_ids,
        created_at__date__gte=month_start,
    ).aggregate(
        pending=Sum("amount", filter=Q(status__in=["pending", "approved"])),
        paid=Sum("amount", filter=Q(status="paid")),
        count=Count("id"),
    )

    wallet_balance = WalletAccount.objects.filter(owner__city_id=city_id).aggregate(
        total=Sum("balance")
    )["total"] or Decimal("0")

    return {
        "city_id": city_id,
        "city_name": city_name,
        "revenue": _dec(ride_revenue),
        "commission": _dec(commission),
        "gross_payments": _dec(payments.aggregate(total=Sum("amount"))["total"]),
        "withdrawals_pending": _dec(withdrawals["pending"]),
        "withdrawals_paid": _dec(withdrawals["paid"]),
        "withdrawals_count": withdrawals["count"] or 0,
        "wallet_balance": _dec(wallet_balance),
        "failed_payments": {
            "count": failed["count"] or 0,
            "amount": _dec(failed["total"]),
        },
    }


def build_city_performance_metrics(city_id: int, city_name: str) -> dict:
    month_start = _month_start()
    today = timezone.localdate()
    rides = _city_rides(city_id, month_start, today)
    deliveries = _city_deliveries(city_name, month_start, today)

    ride_total = rides.count()
    ride_completed = rides.filter(status="completed").count()
    ride_cancelled = rides.filter(status="cancelled").count()
    ride_accepted = rides.filter(driver__isnull=False).count()

    delivery_total = deliveries.count()
    delivery_completed = deliveries.filter(status="delivered").count()

    hourly = build_hourly_analytics(city_id)

    return {
        "city_id": city_id,
        "city_name": city_name,
        "average_eta_minutes": hourly.get("average_eta_minutes"),
        "ride_completion_rate_pct": round(100 * ride_completed / ride_total, 1) if ride_total else 0,
        "delivery_completion_rate_pct": round(100 * delivery_completed / delivery_total, 1)
        if delivery_total
        else 0,
        "driver_acceptance_rate_pct": round(100 * ride_accepted / ride_total, 1) if ride_total else 0,
        "cancellation_rate_pct": round(100 * ride_cancelled / ride_total, 1) if ride_total else 0,
    }


def build_city_detail(city_id: int) -> dict:
    profile = OpsCityProfile.objects.select_related("city").filter(city_id=city_id).first()
    if not profile:
        city = City.objects.filter(id=city_id).first()
        if not city:
            return {}
        city_name = city.name
        admin = {"city_id": city_id, "name": city_name, "status": "pilot"}
    else:
        city_name = profile.city.name
        admin = get_city_profile(city_id)

    return {
        "admin": admin,
        "fleet": build_city_fleet_metrics(city_id, city_name),
        "financial": build_city_financial_metrics(city_id, city_name),
        "performance": build_city_performance_metrics(city_id, city_name),
    }


def build_ceo_national_overview() -> dict:
    today = timezone.localdate()
    month_start = _month_start()
    profiles = list(OpsCityProfile.objects.select_related("city").order_by("city__name"))

    city_rows = []
    national_revenue = Decimal("0")
    for profile in profiles:
        fin = build_city_financial_metrics(profile.city_id, profile.city.name)
        perf = build_city_performance_metrics(profile.city_id, profile.city.name)
        fleet = build_city_fleet_metrics(profile.city_id, profile.city.name)
        revenue = Decimal(fin.get("revenue", "0"))
        national_revenue += revenue
        city_rows.append(
            {
                "city_id": profile.city_id,
                "city_name": profile.city.name,
                "status": profile.status,
                "revenue": fin.get("revenue"),
                "fleet_utilization_pct": round(
                    100 * fleet["online_drivers"] / max(fleet["drivers"], 1), 1
                ),
                "ride_completion_rate_pct": perf.get("ride_completion_rate_pct"),
                "cancellation_rate_pct": perf.get("cancellation_rate_pct"),
                "online_drivers": fleet.get("online_drivers"),
                "active_rides": fleet.get("active_rides"),
                "attention_score": _attention_score(perf, fleet, profile.status),
            }
        )

    city_rows.sort(key=lambda row: Decimal(str(row.get("revenue") or "0")), reverse=True)
    best = city_rows[0] if city_rows else None
    attention = sorted(city_rows, key=lambda row: row.get("attention_score", 0), reverse=True)

    kpis = build_business_kpis()
    growth_chart = kpis.get("growth_chart", [])

    return {
        "national_revenue": _dec(national_revenue),
        "revenue_by_city": [
            {"city_id": r["city_id"], "city_name": r["city_name"], "revenue": r["revenue"]}
            for r in city_rows
        ],
        "growth_by_city": city_rows,
        "fleet_utilization": [
            {
                "city_id": r["city_id"],
                "city_name": r["city_name"],
                "utilization_pct": r.get("fleet_utilization_pct"),
            }
            for r in city_rows
        ],
        "best_performing_city": best,
        "cities_requiring_attention": [c for c in attention if c.get("attention_score", 0) >= 2][:5],
        "platform_growth_chart": growth_chart,
        "active_city_count": sum(1 for p in profiles if p.status == "active"),
        "pilot_city_count": sum(1 for p in profiles if p.status == "pilot"),
    }


def _attention_score(perf: dict, fleet: dict, status: str) -> int:
    score = 0
    if status == "suspended":
        score += 3
    if (perf.get("cancellation_rate_pct") or 0) >= 25:
        score += 2
    if (perf.get("ride_completion_rate_pct") or 100) < 70:
        score += 2
    if fleet.get("waiting_riders", 0) >= 5:
        score += 2
    if fleet.get("drivers", 0) and fleet.get("online_drivers", 0) / fleet["drivers"] < 0.2:
        score += 1
    return score


def build_multi_city_dashboard(city_ids: list[int] | None = None, include_finance: bool = True) -> dict:
    qs = OpsCityProfile.objects.select_related("city").order_by("city__name")
    if city_ids is not None:
        qs = qs.filter(city_id__in=city_ids)

    cities = []
    for profile in qs:
        detail = build_city_detail(profile.city_id)
        if not include_finance:
            detail.pop("financial", None)
        cities.append(detail)

    payload = {
        "generated_at": timezone.now().isoformat(),
        "cities": cities,
        "city_administration": list_city_profiles(city_ids),
    }
    if city_ids is None:
        payload["ceo_overview"] = build_ceo_national_overview()
    return payload


def build_multi_city_export_rows(city_ids: list[int] | None = None) -> list[dict]:
    dashboard = build_multi_city_dashboard(city_ids=city_ids)
    rows = [{"section": "meta", "metric": "generated_at", "value": dashboard["generated_at"]}]
    if dashboard.get("ceo_overview"):
        overview = dashboard["ceo_overview"]
        rows.append({"section": "national", "metric": "national_revenue", "value": overview.get("national_revenue")})
    for city in dashboard.get("cities", []):
        name = city.get("admin", {}).get("name") or city.get("fleet", {}).get("city_name")
        rows.append({"section": "fleet", "metric": f"{name}_drivers", "value": city.get("fleet", {}).get("drivers")})
        rows.append({"section": "financial", "metric": f"{name}_revenue", "value": city.get("financial", {}).get("revenue")})
        rows.append(
            {
                "section": "performance",
                "metric": f"{name}_completion_rate",
                "value": city.get("performance", {}).get("ride_completion_rate_pct"),
            }
        )
    return rows
