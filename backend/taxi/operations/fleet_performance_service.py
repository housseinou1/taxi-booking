"""Fleet & Driver Performance Center aggregations (Phase 22)."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from cities.models import City
from payments.models import Payment, WalletAccount
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.performance import calculate_driver_performance
from taxi.drivers.services.document_service import get_document_display_status
from taxi.rides.models import Ride

from .ai_operations_service import build_hotspot_map, build_surge_monitor
from .executive_service import RIDE_ACTIVE
from .operations_center_service import build_fleet_snapshot, build_ops_map

User = get_user_model()

DOCUMENT_TYPE_LABELS = {
    "license": "Driver License",
    "insurance": "Insurance",
    "carte_grise": "Registration",
    "vignette": "Vehicle Inspection",
    "vehicle_registration": "Registration",
    "national_id": "National ID",
}

REMINDER_WINDOWS = (30, 15, 7, 1)


def _dec(value) -> str:
    if value is None:
        return "0.00"
    return str(Decimal(value).quantize(Decimal("0.01")))


def _driver_status(profile: DriverProfile, busy_ids: set[int]) -> str:
    user = profile.user
    if not user.is_active:
        return "suspended"
    if user.id in busy_ids:
        return "busy"
    if profile.is_available:
        return "online"
    return "offline"


def _driver_badges(profile: DriverProfile, perf: dict, expiring_doc: bool) -> list[str]:
    badges = []
    if perf.get("score", 0) >= 90:
        badges.append("top_performer")
    if perf.get("acceptance_rate", 100) < 70:
        badges.append("low_acceptance")
    if perf.get("cancellation_rate", 0) > 25:
        badges.append("high_cancellation")
    if expiring_doc:
        badges.append("document_expiring")
    if not profile.user.is_active:
        badges.append("suspended")
    return badges


def _revenue_for_drivers(user_ids: list[int], start, end) -> dict[int, Decimal]:
    if not user_ids:
        return {}
    rides = Ride.objects.filter(
        driver_id__in=user_ids,
        status="completed",
        completed_at__gte=start,
        completed_at__lte=end,
    ).values("driver_id", "id")
    ride_driver = {row["id"]: row["driver_id"] for row in rides}
    if not ride_driver:
        return {uid: Decimal("0") for uid in user_ids}

    totals: dict[int, Decimal] = {uid: Decimal("0") for uid in user_ids}
    for payment in Payment.objects.filter(ride_id__in=ride_driver.keys(), status="paid").values(
        "ride_id", "driver_earning"
    ):
        driver_id = ride_driver.get(payment["ride_id"])
        if driver_id:
            totals[driver_id] = totals.get(driver_id, Decimal("0")) + (payment["driver_earning"] or Decimal("0"))
    return totals


def build_fleet_overview(city_id=None) -> dict:
    profiles = DriverProfile.objects.select_related("user")
    if city_id:
        profiles = profiles.filter(user__city_id=city_id)

    today = timezone.localdate()
    expired_driver_ids = set(
        DriverDocument.objects.filter(expires_at__lt=today, status="approved").values_list("driver_id", flat=True)
    )

    total_registered = profiles.count()
    approved = profiles.filter(status="approved").count()
    suspended = profiles.filter(user__is_active=False).count()
    expired_docs = len(expired_driver_ids)

    snapshot = build_fleet_snapshot(city_id=city_id)
    counts = snapshot.get("counts", {})

    return {
        "generated_at": timezone.now().isoformat(),
        "total_registered": total_registered,
        "approved_drivers": approved,
        "online_drivers": counts.get("online_drivers", 0),
        "busy_drivers": counts.get("busy_drivers", 0),
        "offline_drivers": counts.get("offline_drivers", 0),
        "suspended_drivers": suspended,
        "expired_document_drivers": expired_docs,
        "active_trips": counts.get("active_trips", 0),
        "waiting_riders": counts.get("waiting_riders", 0),
    }


def build_fleet_map_bundle(city_id=None) -> dict:
    surge = build_surge_monitor(city_id=city_id)
    zones = surge.get("zones", [])
    busy_zones = [z for z in zones if z.get("severity") in {"high", "medium"}][:20]
    low_coverage = [
        z
        for z in zones
        if z.get("waiting_riders", 0) >= 2 and z.get("drivers_nearby", 0) <= 1
    ][:20]

    return {
        "live_map": build_ops_map(city_id=city_id),
        "heat_map": build_hotspot_map(period="hour", city_id=city_id),
        "busy_zones": busy_zones,
        "low_coverage_zones": low_coverage,
    }


def build_driver_performance_rows(city_id=None, limit: int = 500) -> list[dict]:
    profiles = DriverProfile.objects.select_related("user").order_by("-performance_points")
    if city_id:
        profiles = profiles.filter(user__city_id=city_id)

    busy_ids = set(
        Ride.objects.filter(status__in=RIDE_ACTIVE, driver__isnull=False).values_list("driver_id", flat=True)
    )
    today = timezone.localdate()
    month_start = today.replace(day=1)
    week_start = today - timedelta(days=today.weekday())
    now = timezone.now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_dt = timezone.make_aware(datetime.combine(week_start, datetime.min.time()))
    month_dt = timezone.make_aware(datetime.combine(month_start, datetime.min.time()))

    profile_list = list(profiles[:limit])
    user_ids = [p.user_id for p in profile_list]

    wallets = {
        row["owner_id"]: row["balance"]
        for row in WalletAccount.objects.filter(owner_id__in=user_ids).values("owner_id", "balance")
    }
    rev_today = _revenue_for_drivers(user_ids, day_start, now)
    rev_week = _revenue_for_drivers(user_ids, week_dt, now)
    rev_month = _revenue_for_drivers(user_ids, month_dt, now)

    expiring_driver_ids = set(
        DriverDocument.objects.filter(
            status="approved",
            expires_at__gte=today,
            expires_at__lte=today + timedelta(days=30),
        ).values_list("driver_id", flat=True)
    )

    rows = []
    for profile in profile_list:
        perf = calculate_driver_performance(profile)
        completion_rate = 0.0
        if perf.get("accepted_rides"):
            completion_rate = round(
                perf.get("completed_rides", 0) / perf["accepted_rides"] * 100,
                1,
            )
        expiring = profile.id in expiring_driver_ids
        rows.append(
            {
                **perf,
                "driver_id": profile.id,
                "user_id": profile.user_id,
                "email": profile.user.email,
                "phone": profile.phone_number or profile.user.phone_number,
                "city_id": profile.user.city_id,
                "completion_rate": completion_rate,
                "total_trips": perf.get("completed_rides", 0),
                "revenue_today": _dec(rev_today.get(profile.user_id)),
                "revenue_week": _dec(rev_week.get(profile.user_id)),
                "revenue_month": _dec(rev_month.get(profile.user_id)),
                "wallet_balance": _dec(wallets.get(profile.user_id)),
                "last_online": profile.available_since.isoformat() if profile.available_since else None,
                "current_status": _driver_status(profile, busy_ids),
                "badges": _driver_badges(profile, perf, expiring),
                "is_suspended": not profile.user.is_active,
            }
        )
    rows.sort(key=lambda item: item.get("score", 0), reverse=True)
    return rows


def build_document_monitoring() -> dict:
    today = timezone.localdate()
    tracked_types = {"license", "insurance", "carte_grise", "vignette", "vehicle_registration", "national_id"}

    buckets = {f"expiring_{days}d": [] for days in REMINDER_WINDOWS}
    buckets["valid"] = []
    buckets["expired"] = []

    documents = (
        DriverDocument.objects.filter(document_type__in=tracked_types, status="approved")
        .select_related("driver__user")
        .order_by("expires_at")
    )

    for doc in documents[:1000]:
        display = get_document_display_status(doc)
        days_remaining = None
        if doc.expires_at:
            days_remaining = (doc.expires_at - today).days

        entry = {
            "id": doc.id,
            "driver_id": doc.driver_id,
            "driver_email": doc.driver.user.email if doc.driver_id else None,
            "document_type": doc.document_type,
            "document_label": DOCUMENT_TYPE_LABELS.get(doc.document_type, doc.document_type),
            "expires_at": doc.expires_at.isoformat() if doc.expires_at else None,
            "days_remaining": days_remaining,
            "status": display,
        }

        if display == "expired":
            buckets["expired"].append(entry)
        elif display == "expiring_soon" or (days_remaining is not None and days_remaining <= 30):
            placed = False
            for days in REMINDER_WINDOWS:
                if days_remaining is not None and days_remaining <= days:
                    buckets[f"expiring_{days}d"].append(entry)
                    placed = True
                    break
            if not placed:
                buckets["valid"].append(entry)
        else:
            buckets["valid"].append(entry)

    summary = {
        "valid": len(buckets["valid"]),
        "expired": len(buckets["expired"]),
        **{f"expiring_{days}d": len(buckets[f"expiring_{days}d"]) for days in REMINDER_WINDOWS},
    }

    return {
        "generated_at": timezone.now().isoformat(),
        "summary": summary,
        "buckets": buckets,
        "reminder_windows": list(REMINDER_WINDOWS),
    }


def build_fleet_ceo_metrics(city_id=None, drivers: list[dict] | None = None) -> dict:
    if drivers is None:
        drivers = build_driver_performance_rows(city_id=city_id, limit=500)
    top_20 = drivers[:20]
    lowest_20 = sorted(drivers, key=lambda d: d.get("score", 0))[:20]

    revenue_by_driver = [
        {
            "driver_id": d["driver_id"],
            "name": d.get("driver_name"),
            "revenue_month": d.get("revenue_month"),
            "trips": d.get("total_trips"),
        }
        for d in sorted(drivers, key=lambda x: Decimal(x.get("revenue_month", "0")), reverse=True)[:20]
    ]

    city_rows = []
    for city in City.objects.filter(is_active=True)[:50]:
        city_drivers = [d for d in drivers if d.get("city_id") == city.id]
        city_rows.append(
            {
                "city_id": city.id,
                "city_name": city.name,
                "driver_count": len(city_drivers),
                "revenue_month": _dec(sum(Decimal(d.get("revenue_month", "0")) for d in city_drivers)),
                "online_now": sum(1 for d in city_drivers if d.get("current_status") == "online"),
            }
        )
    city_rows.sort(key=lambda row: Decimal(row["revenue_month"]), reverse=True)

    approved = DriverProfile.objects.filter(status="approved")
    if city_id:
        approved = approved.filter(user__city_id=city_id)
    total_approved = approved.count()
    online = approved.filter(is_available=True).count()
    utilization = round((online / total_approved) * 100, 1) if total_approved else 0

    earnings = [Decimal(d.get("revenue_month", "0")) for d in drivers if Decimal(d.get("revenue_month", "0")) > 0]
    avg_earnings = _dec(sum(earnings) / len(earnings)) if earnings else "0.00"

    week_ago = timezone.now() - timedelta(days=7)
    two_weeks = timezone.now() - timedelta(days=14)
    recent_acceptance = (
        DriverProfile.objects.filter(status="approved")
        .aggregate(avg=Avg("acceptance_rate_points"))["avg"]
        or 0
    )

    cancelled_recent = Ride.objects.filter(status="cancelled", created_at__gte=week_ago).count()
    completed_recent = Ride.objects.filter(status="completed", completed_at__gte=week_ago).count()
    cancelled_prev = Ride.objects.filter(
        status="cancelled", created_at__gte=two_weeks, created_at__lt=week_ago
    ).count()
    completed_prev = Ride.objects.filter(
        status="completed", completed_at__gte=two_weeks, completed_at__lt=week_ago
    ).count()

    cancel_rate_now = round(cancelled_recent / max(completed_recent + cancelled_recent, 1) * 100, 1)
    cancel_rate_prev = round(cancelled_prev / max(completed_prev + cancelled_prev, 1) * 100, 1)

    return {
        "generated_at": timezone.now().isoformat(),
        "top_drivers": top_20,
        "lowest_drivers": lowest_20,
        "revenue_by_driver": revenue_by_driver,
        "revenue_by_city": city_rows[:15],
        "fleet_utilization_pct": utilization,
        "average_earnings_month": avg_earnings,
        "acceptance_trend": {
            "current_avg": round(float(recent_acceptance), 1),
            "label": "Fleet acceptance points (7d snapshot)",
        },
        "cancellation_trend": {
            "current_pct": cancel_rate_now,
            "previous_pct": cancel_rate_prev,
            "direction": "up" if cancel_rate_now > cancel_rate_prev else "down",
        },
    }


def build_fleet_dashboard(city_id=None) -> dict:
    from .cache_utils import cached_ops_call

    def _build():
        overview = build_fleet_overview(city_id=city_id)
        map_bundle = build_fleet_map_bundle(city_id=city_id)
        drivers = build_driver_performance_rows(city_id=city_id, limit=200)
        documents = build_document_monitoring()
        ceo = build_fleet_ceo_metrics(city_id=city_id, drivers=drivers)

        return {
            "generated_at": timezone.now().isoformat(),
            "overview": overview,
            "map": map_bundle,
            "drivers": drivers,
            "documents": documents,
            "ceo": ceo,
        }

    return cached_ops_call("fleet_dashboard", _build, city_id=city_id)


def build_fleet_report_rows(report_type: str, city_id=None) -> list[dict]:
    if report_type == "daily_fleet":
        overview = build_fleet_overview(city_id=city_id)
        return [{"metric": key, "value": value} for key, value in overview.items() if key != "generated_at"]

    if report_type == "weekly_driver":
        drivers = build_driver_performance_rows(city_id=city_id)
        return [
            {
                "driver_id": d["driver_id"],
                "name": d.get("driver_name"),
                "score": d.get("score"),
                "acceptance_rate": d.get("acceptance_rate"),
                "cancellation_rate": d.get("cancellation_rate"),
                "trips": d.get("total_trips"),
                "revenue_week": d.get("revenue_week"),
                "status": d.get("current_status"),
            }
            for d in drivers
        ]

    if report_type == "monthly_revenue":
        ceo = build_fleet_ceo_metrics(city_id=city_id)
        rows = [{"section": "driver", **row} for row in ceo["revenue_by_driver"]]
        rows.extend({"section": "city", **row} for row in ceo["revenue_by_city"])
        return rows

    if report_type == "document_expiration":
        docs = build_document_monitoring()
        rows = []
        for bucket, items in docs["buckets"].items():
            for item in items:
                rows.append({"bucket": bucket, **item})
        return rows

    if report_type == "performance_rankings":
        drivers = build_driver_performance_rows(city_id=city_id)
        return [
            {
                "rank": index + 1,
                "driver_id": d["driver_id"],
                "name": d.get("driver_name"),
                "score": d.get("score"),
                "badges": ",".join(d.get("badges", [])),
                "revenue_month": d.get("revenue_month"),
            }
            for index, d in enumerate(drivers)
        ]

    return [{"error": "Unknown report type", "type": report_type}]
