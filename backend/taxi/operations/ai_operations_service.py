"""AI-assisted operations engine: smart dispatch insights, surge, hotspots, alerts."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from deliveries.models import Delivery
from payments.models import PaymentRecord, RefundRequest, WithdrawalRequest
from security.models import FraudFlag
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.performance import calculate_driver_performance
from taxi.drivers.services.document_service import DocumentService
from taxi.rides.models import DispatchOfferLog, Ride
from taxi.rides.services.driver_dispatch_service import (
    explain_ranked_driver,
    rank_eligible_drivers,
    radius_for_round,
    select_best_driver,
)

from .executive_service import DELIVERY_ACTIVE, RIDE_ACTIVE, _dec, _payment_qs
from .models import AIRecommendation

User = get_user_model()

PERFORMANCE_CATEGORY = {
    "excellent": "Excellent",
    "strong": "Good",
    "watch": "Needs Attention",
    "risk": "At Risk",
}


def _period_start(period: str):
    now = timezone.now()
    if period == "hour":
        return now - timedelta(hours=1)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return now - timedelta(days=7)
    return now - timedelta(hours=1)


def _grid_key(lat, lng, precision=2):
    return round(float(lat), precision), round(float(lng), precision)


def build_smart_dispatch_insights(ride_id: int | None = None, city_id=None) -> dict:
    """Explain driver selection for active searches or a specific ride."""
    rides = Ride.objects.filter(status="requested", driver__isnull=True).select_related("rider")
    if ride_id:
        rides = rides.filter(id=ride_id)
    if city_id:
        rides = rides.filter(city_id=city_id)

    insights = []
    for ride in rides[:25]:
        ranked, radius, round_no = select_best_driver(ride)
        candidates = rank_eligible_drivers(ride, radius_km=radius or radius_for_round(1))[:5]
        payload = {
            "ride_id": ride.id,
            "pickup": ride.pickup,
            "dispatch_round": round_no,
            "search_radius_km": radius,
            "selected_driver": None,
            "alternatives": [],
        }
        if ranked:
            payload["selected_driver"] = explain_ranked_driver(ranked, ride.ride_type)
        payload["alternatives"] = [
            explain_ranked_driver(item, ride.ride_type) for item in candidates[:3]
        ]
        latest_log = (
            DispatchOfferLog.objects.filter(ride=ride).order_by("-created_at").first()
        )
        if latest_log and latest_log.score_breakdown:
            payload["last_offer_log"] = {
                "driver_id": latest_log.driver_id,
                "result": latest_log.result,
                "score": latest_log.score,
                "breakdown": latest_log.score_breakdown,
            }
        insights.append(payload)

    return {
        "generated_at": timezone.now().isoformat(),
        "active_searches": len(insights),
        "rides": insights,
    }


def build_surge_monitor(city_id=None) -> dict:
    """Detect high-demand / low-supply zones and suggest surge + repositioning."""
    now = timezone.now()
    hour_start = now - timedelta(hours=1)
    rides = Ride.objects.filter(created_at__gte=hour_start)
    if city_id:
        rides = rides.filter(city_id=city_id)

    cells: dict[tuple, dict] = {}
    for ride in rides.exclude(pickup_lat__isnull=True):
        key = _grid_key(ride.pickup_lat, ride.pickup_lng)
        cell = cells.setdefault(
            key,
            {"requests": 0, "waiting": 0, "lat": key[0], "lng": key[1], "labels": [], "waiting_since": []},
        )
        cell["requests"] += 1
        if ride.status == "requested" and not ride.driver_id:
            cell["waiting"] += 1
            cell["waiting_since"].append(ride.created_at)
        cell["labels"].append(ride.pickup)

    drivers = DriverProfile.objects.filter(
        status="approved",
        is_available=True,
        current_lat__isnull=False,
    )
    if city_id:
        drivers = drivers.filter(user__city_id=city_id)

    for profile in drivers:
        key = _grid_key(profile.current_lat, profile.current_lng)
        cell = cells.setdefault(
            key, {"requests": 0, "waiting": 0, "lat": key[0], "lng": key[1], "labels": []}
        )
        cell["drivers"] = cell.get("drivers", 0) + 1

    zones = []
    for key, cell in cells.items():
        if cell["requests"] < 2:
            continue
        drivers_nearby = cell.get("drivers", 0)
        demand_ratio = cell["requests"] / max(drivers_nearby, 0.5)
        waiting_since = cell.get("waiting_since") or []
        avg_wait = 0
        if waiting_since:
            sample = waiting_since[:20]
            avg_wait = int(
                sum((now - ts).total_seconds() for ts in sample) / max(len(sample), 1)
            )
        suggested_multiplier = round(min(1.0 + demand_ratio * 0.15, 2.5), 2)
        zones.append(
            {
                "lat": cell["lat"],
                "lng": cell["lng"],
                "label": cell["labels"][0] if cell["labels"] else f"{cell['lat']}, {cell['lng']}",
                "requests_last_hour": cell["requests"],
                "waiting_riders": cell["waiting"],
                "drivers_nearby": drivers_nearby,
                "demand_supply_ratio": round(demand_ratio, 2),
                "avg_wait_seconds": avg_wait,
                "suggested_surge_multiplier": suggested_multiplier,
                "estimated_demand_increase_pct": round((demand_ratio - 1) * 100, 1),
                "suggested_reposition_drivers": max(
                    int(cell["waiting"] * 1.5) - drivers_nearby, 0
                ),
                "severity": "high" if demand_ratio >= 3 or avg_wait > 600 else "medium",
            }
        )

    zones.sort(key=lambda z: (z["demand_supply_ratio"], z["waiting_riders"]), reverse=True)
    return {
        "generated_at": now.isoformat(),
        "zones": zones[:20],
        "summary": {
            "high_demand_zones": sum(1 for z in zones if z["severity"] == "high"),
            "total_waiting": sum(z["waiting_riders"] for z in zones),
        },
    }


def build_hotspot_map(period: str = "hour", city_id=None) -> dict:
    """Heat map of ride/delivery requests, completions, and cancellations."""
    start = _period_start(period)
    rides = Ride.objects.filter(created_at__gte=start)
    deliveries = Delivery.objects.filter(created_at__gte=start)
    if city_id:
        rides = rides.filter(city_id=city_id)

    cells: dict[str, dict] = {}

    def bump(kind, lat, lng, label=""):
        if lat is None or lng is None:
            return
        key = f"{_grid_key(lat, lng)}"
        cell = cells.setdefault(
            key,
            {
                "lat": _grid_key(lat, lng)[0],
                "lng": _grid_key(lat, lng)[1],
                "ride_requests": 0,
                "delivery_requests": 0,
                "completed": 0,
                "cancelled": 0,
                "label": label,
            },
        )
        cell[kind] += 1
        if label and not cell["label"]:
            cell["label"] = label

    for ride in rides.values("pickup_lat", "pickup_lng", "pickup", "status"):
        bump("ride_requests", ride["pickup_lat"], ride["pickup_lng"], ride["pickup"])
        if ride["status"] == "completed":
            bump("completed", ride["pickup_lat"], ride["pickup_lng"])
        elif ride["status"] == "cancelled":
            bump("cancelled", ride["pickup_lat"], ride["pickup_lng"])

    for delivery in deliveries.values("pickup_lat", "pickup_lng", "pickup", "status"):
        bump("delivery_requests", delivery["pickup_lat"], delivery["pickup_lng"], delivery["pickup"])
        if delivery["status"] == "delivered":
            bump("completed", delivery["pickup_lat"], delivery["pickup_lng"])
        elif delivery["status"] == "cancelled":
            bump("cancelled", delivery["pickup_lat"], delivery["pickup_lng"])

    points = list(cells.values())
    max_intensity = max(
        (p["ride_requests"] + p["delivery_requests"] for p in points), default=1
    )
    for point in points:
        total = point["ride_requests"] + point["delivery_requests"]
        point["intensity"] = round(total / max_intensity, 3) if max_intensity else 0

    points.sort(key=lambda p: p["intensity"], reverse=True)
    return {
        "period": period,
        "period_start": start.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "points": points[:200],
        "summary": {
            "ride_requests": sum(p["ride_requests"] for p in points),
            "delivery_requests": sum(p["delivery_requests"] for p in points),
            "completed": sum(p["completed"] for p in points),
            "cancelled": sum(p["cancelled"] for p in points),
        },
    }


def build_predictive_alerts() -> list[dict]:
    """Warn operations before problems occur — recommendations only, no auto-actions."""
    now = timezone.now()
    alerts = []

    for ride in Ride.objects.filter(status__in={"requested", "driver_arriving", "driver_arrived"}).select_related(
        "driver", "driver__driver_profile", "rider"
    )[:50]:
        wait = int((now - ride.created_at).total_seconds())
        if wait > 480:
            alerts.append(
                {
                    "id": f"pred-wait-{ride.id}",
                    "type": "ride_waiting_too_long",
                    "severity": "high" if wait > 900 else "medium",
                    "message": f"Ride #{ride.id} waiting {wait // 60} min — consider reassignment",
                    "entity_type": "ride",
                    "entity_id": ride.id,
                    "explanation": {"waiting_seconds": wait, "status": ride.status},
                }
            )
        if ride.driver_id and ride.driver.driver_profile:
            profile = ride.driver.driver_profile
            cancel_rate = (profile.total_rides_cancelled or 0) / max(
                (profile.total_rides_accepted or 1), 1
            )
            if cancel_rate > 0.15 and ride.status in {"driver_arriving", "driver_arrived"}:
                alerts.append(
                    {
                        "id": f"pred-cancel-{ride.id}",
                        "type": "driver_likely_to_cancel",
                        "severity": "medium",
                        "message": f"Driver on ride #{ride.id} has {cancel_rate * 100:.0f}% cancel rate",
                        "entity_type": "ride",
                        "entity_id": ride.id,
                        "explanation": {"cancellation_rate": round(cancel_rate, 3)},
                    }
                )

    for delivery in Delivery.objects.filter(status__in=DELIVERY_ACTIVE).select_related("driver")[:30]:
        age = int((now - delivery.created_at).total_seconds())
        if age > 3600 and delivery.status in {"accepted", "courier_arriving"}:
            alerts.append(
                {
                    "id": f"pred-delivery-{delivery.id}",
                    "type": "courier_delay",
                    "severity": "medium",
                    "message": f"Delivery #{delivery.id} delayed ({age // 60} min in {delivery.status})",
                    "entity_type": "delivery",
                    "entity_id": delivery.id,
                    "explanation": {"age_seconds": age, "status": delivery.status},
                }
            )

    for flag in FraudFlag.objects.filter(status="open").order_by("-created_at")[:15]:
        alerts.append(
            {
                "id": f"pred-fraud-{flag.id}",
                "type": "fraud_probability",
                "severity": flag.severity or "high",
                "message": flag.description or flag.get_reason_display(),
                "entity_type": "fraud_flag",
                "entity_id": flag.id,
                "explanation": {"user_id": flag.user_id, "reason": flag.reason},
            }
        )

    doc_service = DocumentService()
    for profile in DriverProfile.objects.filter(status="approved")[:100]:
        for doc in doc_service.get_expiring_documents(profile, days=14)[:2]:
            alerts.append(
                {
                    "id": f"pred-doc-{profile.user_id}-{doc.get('document_type', 'doc')}",
                    "type": "document_expiring_soon",
                    "severity": "medium",
                    "message": f"{doc.get('document_type', 'Document')} expiring in {doc.get('days_remaining', '?')} days for {profile.user.email}",
                    "entity_type": "driver_document",
                    "entity_id": profile.user_id,
                    "explanation": {
                        "driver_id": profile.user_id,
                        "expires_at": doc.get("expires_at"),
                        "days_remaining": doc.get("days_remaining"),
                    },
                }
            )

    pending_withdrawals = WithdrawalRequest.objects.filter(status="pending").count()
    if pending_withdrawals >= 10:
        total = WithdrawalRequest.objects.filter(status="pending").aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")
        alerts.append(
            {
                "id": "pred-withdrawal-backlog",
                "type": "wallet_payout_backlog",
                "severity": "medium",
                "message": f"{pending_withdrawals} pending withdrawals ({_dec(total)} MRU)",
                "entity_type": "system",
                "entity_id": "withdrawals",
                "explanation": {"count": pending_withdrawals, "total": _dec(total)},
            }
        )

    return alerts[:100]


def build_driver_performance_scores(limit: int = 100) -> dict:
    profiles = DriverProfile.objects.filter(status="approved").select_related("user")[:limit]
    drivers = []
    for profile in profiles:
        perf = calculate_driver_performance(profile)
        band = perf["score_band"]
        safety_events = 0
        try:
            from safety.models import SafetyIncident

            safety_events = SafetyIncident.objects.filter(reported_user=profile.user).count()
        except Exception:
            pass
        drivers.append(
            {
                **perf,
                "category": PERFORMANCE_CATEGORY.get(band, "Needs Attention"),
                "safety_events": safety_events,
                "online_hours_today": round(
                    max(
                        (timezone.now() - profile.available_since).total_seconds() / 3600, 0
                    )
                    if profile.is_available and profile.available_since
                    else 0,
                    1,
                ),
            }
        )
    drivers.sort(key=lambda d: d["score"], reverse=True)
    return {
        "generated_at": timezone.now().isoformat(),
        "summary": {
            "excellent": sum(1 for d in drivers if d["category"] == "Excellent"),
            "good": sum(1 for d in drivers if d["category"] == "Good"),
            "needs_attention": sum(1 for d in drivers if d["category"] == "Needs Attention"),
            "at_risk": sum(1 for d in drivers if d["category"] == "At Risk"),
        },
        "drivers": drivers,
    }


def build_fleet_health() -> dict:
    profiles = DriverProfile.objects.filter(status="approved")
    total = profiles.count()
    online = profiles.filter(is_available=True).count()
    busy_ids = set(
        Ride.objects.filter(status__in=RIDE_ACTIVE, driver__isnull=False).values_list(
            "driver_id", flat=True
        )
    )
    busy = len(busy_ids)
    idle = max(online - busy, 0)
    offline = max(total - online, 0)

    expired_docs = DriverDocument.objects.filter(expires_at__lt=timezone.localdate()).count()
    low_performers = profiles.filter(performance_points__lt=60).count()

    return {
        "generated_at": timezone.now().isoformat(),
        "total_drivers": total,
        "online_pct": round((online / total) * 100, 1) if total else 0,
        "busy_pct": round((busy / total) * 100, 1) if total else 0,
        "idle_pct": round((idle / total) * 100, 1) if total else 0,
        "offline_pct": round((offline / total) * 100, 1) if total else 0,
        "online": online,
        "busy": busy,
        "idle": idle,
        "offline": offline,
        "expired_documents": expired_docs,
        "low_performing_drivers": low_performers,
        "active_trips": Ride.objects.filter(status__in=RIDE_ACTIVE).count(),
        "active_deliveries": Delivery.objects.filter(status__in=DELIVERY_ACTIVE).count(),
    }


def _upsert_recommendation(
    *,
    category: str,
    title: str,
    summary: str,
    explanation: dict,
    zone_lat=None,
    zone_lng=None,
    related_driver_id=None,
    related_ride_id=None,
) -> AIRecommendation | None:
    """Create recommendation if no duplicate pending suggestion in last hour."""
    hour_ago = timezone.now() - timedelta(hours=1)
    exists = AIRecommendation.objects.filter(
        category=category,
        title=title,
        status="pending",
        created_at__gte=hour_ago,
    ).exists()
    if exists:
        return None
    return AIRecommendation.objects.create(
        category=category,
        title=title,
        summary=summary,
        explanation=explanation,
        zone_lat=zone_lat,
        zone_lng=zone_lng,
        related_driver_id=related_driver_id,
        related_ride_id=related_ride_id,
    )


def generate_ai_recommendations() -> list[AIRecommendation]:
    """Rule-based recommendation engine — never auto-executes actions."""
    created = []
    surge = build_surge_monitor()
    for zone in surge.get("zones", [])[:5]:
        if zone["severity"] != "high":
            continue
        rec = _upsert_recommendation(
            category="surge",
            title=f"Surge suggested near {zone['label']}",
            summary=(
                f"Demand/supply ratio {zone['demand_supply_ratio']} with "
                f"{zone['waiting_riders']} waiting riders. "
                f"Suggested multiplier {zone['suggested_surge_multiplier']}x."
            ),
            explanation=zone,
            zone_lat=zone["lat"],
            zone_lng=zone["lng"],
        )
        if rec:
            created.append(rec)
        if zone["suggested_reposition_drivers"] > 0:
            rec = _upsert_recommendation(
                category="reposition",
                title=f"Move drivers to {zone['label']}",
                summary=f"Reposition {zone['suggested_reposition_drivers']} drivers to reduce wait times.",
                explanation=zone,
                zone_lat=zone["lat"],
                zone_lng=zone["lng"],
            )
            if rec:
                created.append(rec)

    perf = build_driver_performance_scores(limit=50)
    for driver in perf["drivers"]:
        if driver["category"] == "At Risk":
            rec = _upsert_recommendation(
                category="contact_driver",
                title=f"Contact driver {driver['driver_name']}",
                summary=driver.get("recommendation", "Performance at risk — manual review recommended."),
                explanation={"score": driver["score"], "factors": driver},
                related_driver_id=driver["user_id"],
            )
            if rec:
                created.append(rec)
                break

    for flag in FraudFlag.objects.filter(status="open").order_by("-created_at")[:3]:
        rec = _upsert_recommendation(
            category="review_account",
            title=f"Review suspicious account (user #{flag.user_id})",
            summary=flag.description or flag.get_reason_display(),
            explanation={"fraud_flag_id": flag.id, "severity": flag.severity},
        )
        if rec:
            created.append(rec)

    delivery_demand = Delivery.objects.filter(
        status="requested", created_at__gte=timezone.now() - timedelta(hours=1)
    ).count()
    if delivery_demand >= 5:
        rec = _upsert_recommendation(
            category="add_couriers",
            title="Add couriers downtown",
            summary=f"{delivery_demand} delivery requests in the last hour — consider activating more couriers.",
            explanation={"delivery_requests_last_hour": delivery_demand},
        )
        if rec:
            created.append(rec)

    return created


def list_recommendations(status: str | None = None) -> list[dict]:
    qs = AIRecommendation.objects.all()
    if status:
        qs = qs.filter(status=status)
    return [
        {
            "id": rec.id,
            "category": rec.category,
            "title": rec.title,
            "summary": rec.summary,
            "explanation": rec.explanation,
            "zone_lat": rec.zone_lat,
            "zone_lng": rec.zone_lng,
            "related_driver_id": rec.related_driver_id,
            "related_ride_id": rec.related_ride_id,
            "status": rec.status,
            "reviewed_by": rec.reviewed_by_id,
            "reviewed_at": rec.reviewed_at.isoformat() if rec.reviewed_at else None,
            "created_at": rec.created_at.isoformat(),
        }
        for rec in qs[:100]
    ]


def build_financial_insights() -> dict:
    """Forecast revenue and cash outflows from recent trends — informational only."""
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    payments_today = _payment_qs(today, today)
    payments_week = _payment_qs(week_start, today)

    daily_revenue = payments_today.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    weekly_revenue = payments_week.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    daily_commission = payments_today.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")
    weekly_commission = payments_week.aggregate(total=Sum("app_fee"))["total"] or Decimal("0")

    days_elapsed = max((today - week_start).days + 1, 1)
    daily_run_rate = weekly_revenue / days_elapsed
    forecast_weekly = daily_run_rate * 7
    forecast_daily = daily_run_rate

    pending_withdrawals = WithdrawalRequest.objects.filter(
        status__in=["pending", "approved"]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    pending_refunds = RefundRequest.objects.filter(status="requested").aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0")

    return {
        "generated_at": timezone.now().isoformat(),
        "actual": {
            "daily_revenue": _dec(daily_revenue),
            "weekly_revenue": _dec(weekly_revenue),
            "daily_commission": _dec(daily_commission),
            "weekly_commission": _dec(weekly_commission),
        },
        "forecast": {
            "daily_revenue": _dec(forecast_daily),
            "weekly_revenue": _dec(forecast_weekly),
            "expected_withdrawals": _dec(pending_withdrawals),
            "expected_refunds": _dec(pending_refunds),
        },
        "disclaimer": "Forecasts are trend-based estimates. No automatic financial actions are taken.",
    }


def build_ai_operations_dashboard(city_id=None) -> dict:
    from .cache_utils import cached_ops_call

    def _build():
        return {
            "generated_at": timezone.now().isoformat(),
            "smart_dispatch": build_smart_dispatch_insights(city_id=city_id),
            "surge_monitor": build_surge_monitor(city_id),
            "hotspot_map": build_hotspot_map("hour", city_id),
            "predictive_alerts": build_predictive_alerts(),
            "driver_performance": build_driver_performance_scores(),
            "fleet_health": build_fleet_health(),
            "recommendations": list_recommendations(status="pending"),
            "financial_insights": build_financial_insights(),
        }

    return cached_ops_call("ai_dashboard", _build, city_id=city_id)
