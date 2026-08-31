"""Launch & Growth Sprint — unified growth operations dashboard."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone

from operations.models import MarketingCampaign, PlatformSetting
from promotions.models import PromoCode, PromoCodeUsage
from referrals.models import DriverReferral, RiderReferral
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .ceo_master_command_service import build_executive_overview
from .customer_growth_service import (
    build_customer_growth_ceo_dashboard,
    build_customer_growth_dashboard,
)
from .executive_service import _dec
from .growth_expansion_service import build_marketing_performance
from .launch_service import build_onboarding_dashboard

User = get_user_model()

PARTNERSHIPS_KEY = "growth_partnerships"
PARTNERSHIP_CATEGORIES = [
    "hotel",
    "airport",
    "restaurant",
    "shopping_center",
    "university",
    "business",
]



def get_growth_partnerships() -> list[dict]:
    stored = PlatformSetting.get_value(PARTNERSHIPS_KEY, {"partnerships": []}) or {"partnerships": []}
    return list(stored.get("partnerships") or [])


def save_growth_partnerships(partnerships: list[dict], actor=None) -> list[dict]:
    PlatformSetting.set_value(PARTNERSHIPS_KEY, {"partnerships": partnerships}, user=actor)
    invalidate_ops_cache("launch_growth_center")
    return partnerships


def upsert_growth_partnership(data: dict, actor=None) -> dict:
    partnerships = get_growth_partnerships()
    partner_id = data.get("id")
    entry = {
        "id": partner_id or int(timezone.now().timestamp() * 1000),
        "name": (data.get("name") or "").strip(),
        "category": (data.get("category") or "business").strip(),
        "status": (data.get("status") or "prospect").strip(),
        "contact_person": (data.get("contact_person") or "").strip(),
        "contact_email": (data.get("contact_email") or "").strip(),
        "contact_phone": (data.get("contact_phone") or "").strip(),
        "agreement": (data.get("agreement") or "").strip(),
        "performance": data.get("performance") or {},
        "updated_at": timezone.now().isoformat(),
    }
    if not entry["name"]:
        raise ValueError("Partnership name is required.")
    if entry["category"] not in PARTNERSHIP_CATEGORIES:
        entry["category"] = "business"

    if partner_id:
        partnerships = [entry if p.get("id") == partner_id else p for p in partnerships]
        if not any(p.get("id") == partner_id for p in partnerships):
            partnerships.append(entry)
    else:
        partnerships.append(entry)

    save_growth_partnerships(partnerships, actor=actor)
    return entry


def build_driver_recruitment_center(city_id=None) -> dict:
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    fourteen_days_ago = today - timedelta(days=14)

    profiles = DriverProfile.objects.select_related("user")
    if city_id:
        profiles = profiles.filter(user__city_id=city_id)

    applications = profiles.count()
    pending_docs = profiles.filter(status__in=["pending", "pending_review"]).count()
    approved = profiles.filter(status="approved").count()
    rejected = profiles.filter(status="rejected").count()

    training_completed = profiles.filter(status="approved", driver_code__isnull=False).count()
    first_trip = profiles.filter(total_rides_completed__gt=0).count()
    activation_rate = round(first_trip / approved * 100, 1) if approved else 0.0

    recruited_today = profiles.filter(user__date_joined__date=today).count()
    approved_this_week = profiles.filter(
        status="approved",
        user__date_joined__date__gte=week_start,
    ).count()
    active_this_week = (
        Ride.objects.filter(status="completed", completed_at__date__gte=week_start, driver__isnull=False)
        .values("driver_id")
        .distinct()
        .count()
    )
    inactive_14d = profiles.filter(status="approved").exclude(
        user_id__in=Ride.objects.filter(
            status="completed", completed_at__date__gte=fourteen_days_ago
        ).values_list("driver_id", flat=True)
    ).count()

    funnel = {
        "applications_received": applications,
        "documents_pending": pending_docs,
        "approved_drivers": approved,
        "rejected_applications": rejected,
        "training_completed": training_completed,
        "first_completed_trip": first_trip,
        "driver_activation_rate": activation_rate,
    }
    kpis = {
        "drivers_recruited_today": recruited_today,
        "drivers_approved_this_week": approved_this_week,
        "drivers_active_this_week": active_this_week,
        "drivers_inactive_over_14_days": inactive_14d,
    }

    recent_applications = list(
        profiles.filter(status__in=["pending", "pending_review", "rejected"])
        .order_by("-id")[:25]
        .values(
            "id",
            "status",
            "user__email",
            "user__first_name",
            "user__last_name",
            "user__date_joined",
            "total_rides_completed",
        )
    )

    onboarding = build_onboarding_dashboard()
    return {
        "generated_at": timezone.now().isoformat(),
        "funnel": funnel,
        "kpis": kpis,
        "onboarding": onboarding,
        "recent_applications": recent_applications,
    }


def build_rider_growth_center(city_id=None) -> dict:
    now = timezone.now()
    today = timezone.localdate()
    since_30d = now - timedelta(days=30)

    riders = User.objects.filter(user_type="rider")
    new_registrations_30d = riders.filter(date_joined__gte=since_30d).count()
    new_registrations_today = riders.filter(date_joined__date=today).count()

    first_ride_riders = (
        Ride.objects.filter(status="completed")
        .values("rider_id")
        .annotate(trips=Count("id"))
        .filter(trips=1)
        .count()
    )
    returning_riders = (
        Ride.objects.filter(status="completed", completed_at__gte=since_30d)
        .values("rider_id")
        .annotate(trips=Count("id"))
        .filter(trips__gte=2)
        .count()
    )

    growth = build_customer_growth_dashboard()
    summary = growth.get("summary", {})
    referrals = growth.get("referrals", {})
    promotions = growth.get("promotions", {})

    return {
        "generated_at": now.isoformat(),
        "new_registrations_today": new_registrations_today,
        "new_registrations_30d": new_registrations_30d,
        "first_ride_completions": first_ride_riders,
        "returning_riders_30d": returning_riders,
        "referral_usage_30d": referrals.get("rider_signups_30d", 0) + referrals.get("driver_signups_30d", 0),
        "coupon_usage_30d": promotions.get("usages_30d", 0),
        "churn_rate": summary.get("churn_rate", 0),
        "retention_rate": summary.get("retention_rate", 0),
        "referrals": referrals,
        "promotions_summary": promotions,
    }


def build_promotions_center() -> dict:
    growth = build_customer_growth_dashboard()
    ceo = build_customer_growth_ceo_dashboard()
    promos = list(
        PromoCode.objects.order_by("-created_at")[:30].values(
            "id",
            "code",
            "discount_type",
            "discount_value",
            "status",
            "campaign_type",
            "max_total_uses",
        )
    )
    campaigns = list(
        MarketingCampaign.objects.order_by("-created_at")[:30].values(
            "id",
            "name",
            "channel",
            "audience",
            "status",
            "metrics",
        )
    )

    usages_30d = PromoCodeUsage.objects.filter(created_at__gte=timezone.now() - timedelta(days=30))
    spend_30d = usages_30d.aggregate(t=Sum("discount_amount"))["t"] or Decimal("0")
    redemption_count = usages_30d.count()
    roi_proxy = ceo.get("campaign_roi_proxy", 0)

    by_type = {
        "promo_codes": [p for p in promos if (p.get("campaign_type") or "general") == "general"],
        "referral_campaigns": [c for c in campaigns if c.get("channel") == "referral"],
        "free_ride_campaigns": [p for p in promos if p.get("campaign_type") in {"first_ride", "free_delivery"}],
        "driver_bonus_campaigns": [c for c in campaigns if c.get("channel") == "incentive"],
    }

    return {
        "generated_at": timezone.now().isoformat(),
        "active_promo_codes": growth.get("promotions", {}).get("active_codes", 0),
        "redemptions_30d": redemption_count,
        "discount_spend_30d": _dec(spend_30d),
        "campaign_roi_proxy": roi_proxy,
        "recent_promos": promos,
        "recent_campaigns": campaigns,
        "by_type": by_type,
    }


def build_partnerships_center() -> dict:
    partnerships = get_growth_partnerships()
    by_category = {cat: [] for cat in PARTNERSHIP_CATEGORIES}
    for row in partnerships:
        cat = row.get("category") or "business"
        by_category.setdefault(cat, []).append(row)

    return {
        "generated_at": timezone.now().isoformat(),
        "categories": PARTNERSHIP_CATEGORIES,
        "total": len(partnerships),
        "active": sum(1 for p in partnerships if p.get("status") == "active"),
        "prospect": sum(1 for p in partnerships if p.get("status") == "prospect"),
        "partnerships": partnerships,
        "by_category": by_category,
    }


def build_marketing_dashboard_slice(city_id=None) -> dict:
    marketing = build_marketing_performance()
    return {
        "generated_at": timezone.now().isoformat(),
        "customer_acquisition_cost": marketing.get("customer_acquisition_cost_estimate"),
        "daily_installs_proxy": marketing.get("new_riders_30d", 0),
        "ride_conversion_proxy": marketing.get("repeat_rate"),
        "campaign_performance": marketing.get("campaigns", [])[:15],
        "referral_performance": marketing.get("referrals", {}),
        "promo_code_usage": marketing.get("promo_code_usage", {}),
        "rider_retention_pct": marketing.get("rider_retention_pct"),
        "reactivated_users_30d": marketing.get("reactivated_users_30d"),
    }


def build_executive_scorecard(city_id=None) -> dict:
    overview = build_executive_overview(city_id=city_id, period="daily")
    open_tickets = 0
    try:
        from taxi.drivers.models import SupportTicket

        open_tickets = SupportTicket.objects.filter(status__in=["open", "in_progress"]).count()
    except Exception:
        pass

    from operations.models import BetaFeedback

    open_tickets += BetaFeedback.objects.filter(status__in=["open", "assigned", "waiting"]).count()

    total_riders = User.objects.filter(user_type="rider").count()

    return {
        "generated_at": timezone.now().isoformat(),
        "active_drivers": overview.get("drivers_online", 0),
        "registered_riders": total_riders,
        "completed_trips_today": overview.get("completed_rides_today", 0),
        "revenue_today": overview.get("total_revenue_today", "0"),
        "average_rating": overview.get("customer_satisfaction"),
        "cancellation_rate": overview.get("cancellation_rate_pct", 0),
        "average_pickup_time_minutes": overview.get("average_eta_minutes"),
        "support_tickets_open": open_tickets,
        "overview": overview,
    }


def build_launch_growth_center(city_id=None) -> dict:
    def _build():
        return {
            "generated_at": timezone.now().isoformat(),
            "driver_recruitment": build_driver_recruitment_center(city_id=city_id),
            "rider_growth": build_rider_growth_center(city_id=city_id),
            "promotions": build_promotions_center(),
            "partnerships": build_partnerships_center(),
            "marketing": build_marketing_dashboard_slice(city_id=city_id),
            "executive_scorecard": build_executive_scorecard(city_id=city_id),
        }

    return cached_ops_call("launch_growth_center", _build, city_id=city_id)


def build_scaling_readiness(city_id=None) -> dict:
    """Recommendation inputs for multi-city scale."""
    recruitment = build_driver_recruitment_center(city_id=city_id)
    scorecard = build_executive_scorecard(city_id=city_id)
    rider = build_rider_growth_center(city_id=city_id)

    activation = recruitment["funnel"].get("driver_activation_rate", 0)
    churn = rider.get("churn_rate", 100)
    cancellation = scorecard.get("cancellation_rate", 100)
    inactive_drivers = recruitment["kpis"].get("drivers_inactive_over_14_days", 0)
    approved = recruitment["funnel"].get("approved_drivers", 0)

    blockers = []
    if activation < 50:
        blockers.append("Driver activation rate below 50% — improve onboarding/training funnel.")
    if churn > 40:
        blockers.append("Rider churn above 40% — strengthen retention and support.")
    if cancellation > 20:
        blockers.append("Cancellation rate above 20% — review supply/demand balance.")
    if approved and inactive_drivers / max(approved, 1) > 0.35:
        blockers.append("More than 35% of approved drivers inactive 14+ days — recruitment quality issue.")

    ready = len(blockers) <= 1
    verdict = "READY TO SCALE" if ready and not blockers else "SCALE WITH CONDITIONS" if ready else "NOT READY TO SCALE"

    return {
        "verdict": verdict,
        "ready": ready,
        "blockers": blockers,
        "metrics": {
            "driver_activation_rate": activation,
            "rider_churn_rate": churn,
            "cancellation_rate": cancellation,
            "inactive_driver_ratio": round(inactive_drivers / max(approved, 1) * 100, 1) if approved else 0,
        },
        "recommendation": (
            "Proceed with a second city pilot once driver activation exceeds 60%, "
            "cancellation stays under 15%, and support ticket backlog is under control."
            if ready
            else "Resolve blockers in the launch city before geographic expansion."
        ),
    }
