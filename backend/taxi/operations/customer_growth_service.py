"""Customer Growth & Loyalty Platform — operations dashboards (Phase 33)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from deliveries.models import Delivery
from loyalty.models import LoyaltyPointTransaction, LoyaltyReward, LoyaltyTier, RiderLoyaltyAccount
from loyalty.services.loyalty_service import FEATURE_FLAG_KEY, get_growth_flags
from merchants.models import Merchant, MerchantOrder
from operations.models import MarketingCampaign, PlatformSetting
from promotions.models import PromoCode, PromoCodeUsage
from referrals.models import (
    DriverBonus,
    DriverReferral,
    FlaggedReferral,
    MerchantReferral,
    RideCredit,
    RiderReferral,
)
from referrals.services.analytics_service import AnalyticsService
from taxi.rides.models import Ride

from .cache_utils import cached_ops_call, invalidate_ops_cache
from .executive_service import _dec

User = get_user_model()


def update_growth_flags(flags: dict, actor) -> dict:
    current = get_growth_flags()
    current.update(flags)
    PlatformSetting.set_value(FEATURE_FLAG_KEY, current, user=actor)
    invalidate_ops_cache("customer_growth_dashboard")
    return current


def build_customer_growth_dashboard() -> dict:
    now = timezone.now()
    since_30d = now - timedelta(days=30)
    riders = User.objects.filter(user_type="rider")

    active_riders = riders.filter(last_login__gte=since_30d).count()
    repeat_riders = (
        Ride.objects.filter(status="completed", completed_at__gte=since_30d)
        .values("rider_id")
        .annotate(trips=Count("id"))
        .filter(trips__gte=2)
        .count()
    )
    total_riders_with_rides = (
        Ride.objects.filter(status="completed", completed_at__gte=since_30d)
        .values("rider_id")
        .distinct()
        .count()
    )
    churn_rate = round(
        (1 - repeat_riders / total_riders_with_rides) * 100, 1
    ) if total_riders_with_rides else 0
    retention_rate = round(100 - churn_rate, 1)

    referral_analytics = AnalyticsService().get_analytics()
    loyalty_members = RiderLoyaltyAccount.objects.count()
    avg_rides = (
        Ride.objects.filter(status="completed", completed_at__gte=since_30d)
        .values("rider_id")
        .annotate(c=Count("id"))
        .aggregate(avg=Avg("c"))["avg"]
    )
    avg_deliveries = (
        Delivery.objects.filter(status="delivered", delivered_at__gte=since_30d)
        .values("customer_id")
        .annotate(c=Count("id"))
        .aggregate(avg=Avg("c"))["avg"]
    )

    return {
        "generated_at": now.isoformat(),
        "feature_flags": get_growth_flags(),
        "summary": {
            "active_riders_30d": active_riders,
            "repeat_riders_30d": repeat_riders,
            "churn_rate": churn_rate,
            "retention_rate": retention_rate,
            "referral_rate": referral_analytics.get("conversion_rate", 0),
            "loyalty_members": loyalty_members,
            "avg_rides_per_customer": round(float(avg_rides or 0), 2),
            "avg_deliveries_per_customer": round(float(avg_deliveries or 0), 2),
            "active_promo_codes": PromoCode.objects.filter(status="active").count(),
            "flagged_referrals_pending": FlaggedReferral.objects.filter(status="pending").count(),
        },
        "referrals": {
            "rider_signups_30d": RiderReferral.objects.filter(created_at__gte=since_30d).count(),
            "driver_signups_30d": DriverReferral.objects.filter(created_at__gte=since_30d).count(),
            "merchant_signups_30d": MerchantReferral.objects.filter(created_at__gte=since_30d).count(),
            "successful_rider_referrals": RiderReferral.objects.filter(status="completed").count(),
            "successful_driver_referrals": DriverReferral.objects.filter(status="completed").count(),
            "pending_credits": RideCredit.objects.filter(status="active").count(),
            "analytics": referral_analytics,
        },
        "loyalty": {
            "tiers": list(
                LoyaltyTier.objects.filter(is_active=True).values(
                    "slug", "name", "min_points", "ride_discount_percent", "priority_support"
                )
            ),
            "total_members": loyalty_members,
            "points_issued_30d": LoyaltyPointTransaction.objects.filter(
                created_at__gte=since_30d, points__gt=0
            ).aggregate(t=Sum("points"))["t"]
            or 0,
            "redemptions_30d": LoyaltyPointTransaction.objects.filter(
                created_at__gte=since_30d, source="redemption"
            ).count(),
        },
        "promotions": {
            "active_codes": PromoCode.objects.filter(status="active").count(),
            "usages_30d": PromoCodeUsage.objects.filter(created_at__gte=since_30d).count(),
            "discount_spend_30d": _dec(
                PromoCodeUsage.objects.filter(created_at__gte=since_30d).aggregate(t=Sum("discount_amount"))["t"]
            ),
            "campaigns": list(
                MarketingCampaign.objects.filter(status__in=["active", "scheduled"]).values(
                    "id", "name", "channel", "audience", "status"
                )[:20]
            ),
        },
    }


def build_customer_growth_ceo_dashboard() -> dict:
    now = timezone.now()
    since_30d = now - timedelta(days=30)

    new_riders = User.objects.filter(user_type="rider", date_joined__gte=since_30d).count()
    loyalty_participation = RiderLoyaltyAccount.objects.count()
    total_riders = User.objects.filter(user_type="rider").count()
    participation_rate = round(loyalty_participation / total_riders * 100, 1) if total_riders else 0

    referral_completed = RiderReferral.objects.filter(status="completed", completed_at__gte=since_30d).count()
    referral_started = RiderReferral.objects.filter(created_at__gte=since_30d).count()
    referral_conversion = round(referral_completed / referral_started * 100, 1) if referral_started else 0

    promo_spend = PromoCodeUsage.objects.filter(created_at__gte=since_30d).aggregate(
        t=Sum("discount_amount")
    )["t"] or Decimal("0")
    promo_rides = PromoCodeUsage.objects.filter(created_at__gte=since_30d).count()
    campaign_roi = round(float(promo_rides) / max(float(promo_spend), 1) * 100, 2) if promo_spend else 0

    rider_revenue = Ride.objects.filter(status="completed", completed_at__gte=since_30d).aggregate(
        t=Sum("fare")
    )["t"] or Decimal("0")
    delivery_revenue = Delivery.objects.filter(status="delivered", delivered_at__gte=since_30d).aggregate(
        t=Sum("fare")
    )["t"] or Decimal("0")
    merchant_revenue = MerchantOrder.objects.filter(status="delivered", delivered_at__gte=since_30d).aggregate(
        t=Sum("total")
    )["t"] or Decimal("0")
    active_customers = (
        Ride.objects.filter(status="completed", completed_at__gte=since_30d).values("rider_id").distinct().count()
    )
    total_revenue = rider_revenue + delivery_revenue + merchant_revenue
    clv_estimate = round(float(total_revenue) / max(active_customers, 1), 2)

    growth_weeks = []
    for offset in range(4):
        start = (now - timedelta(days=7 * (offset + 1))).date()
        end = (now - timedelta(days=7 * offset)).date()
        count = User.objects.filter(user_type="rider", date_joined__date__gte=start, date_joined__date__lt=end).count()
        growth_weeks.append({"week_start": start.isoformat(), "new_riders": count})

    return {
        "generated_at": now.isoformat(),
        "customer_growth": list(reversed(growth_weeks)),
        "new_riders_30d": new_riders,
        "loyalty_participation_rate": participation_rate,
        "loyalty_members": loyalty_participation,
        "referral_conversions_30d": referral_completed,
        "referral_conversion_rate": referral_conversion,
        "campaign_roi_proxy": campaign_roi,
        "promo_spend_30d": _dec(promo_spend),
        "estimated_customer_lifetime_value": clv_estimate,
    }


def build_customer_growth_finance_dashboard() -> dict:
    since_30d = timezone.now() - timedelta(days=30)

    loyalty_liability = LoyaltyPointTransaction.objects.filter(points__gt=0).aggregate(t=Sum("points"))["t"] or 0
    redemption_points = abs(
        LoyaltyPointTransaction.objects.filter(source="redemption").aggregate(t=Sum("points"))["t"] or 0
    )
    outstanding_points = loyalty_liability - redemption_points

    promo_cost = PromoCodeUsage.objects.filter(created_at__gte=since_30d).aggregate(t=Sum("discount_amount"))["t"] or Decimal("0")
    referral_payouts = RideCredit.objects.filter(issued_at__gte=since_30d).aggregate(t=Sum("original_amount"))["t"] or Decimal("0")
    referral_payouts += DriverBonus.objects.filter(issued_at__gte=since_30d, status="released").aggregate(
        t=Sum("amount")
    )["t"] or Decimal("0")

    wallet_rewards = LoyaltyReward.objects.filter(reward_type="wallet_credit", is_active=True).aggregate(
        t=Sum("value")
    )["t"] or Decimal("0")

    return {
        "generated_at": timezone.now().isoformat(),
        "loyalty_liability_points": outstanding_points,
        "loyalty_liability_estimate_mru": round(outstanding_points * 0.5, 2),
        "promo_cost_30d": _dec(promo_cost),
        "referral_payouts_30d": _dec(referral_payouts),
        "campaign_spending_30d": _dec(promo_cost + referral_payouts),
        "wallet_reward_catalog_value": _dec(wallet_rewards),
    }


def create_promo_campaign(data: dict, actor) -> dict:
    from django.utils.dateparse import parse_datetime

    code = (data.get("code") or "").strip().upper()
    if not code:
        raise ValueError("Promo code is required.")

    promo = PromoCode.objects.create(
        code=code,
        discount_type=data.get("discount_type", "percentage"),
        discount_value=Decimal(str(data.get("discount_value", 10))),
        start_date=parse_datetime(data["start_date"]) if data.get("start_date") else timezone.now(),
        end_date=parse_datetime(data["end_date"]) if data.get("end_date") else timezone.now() + timedelta(days=30),
        max_total_uses=data.get("max_total_uses"),
        max_per_rider_uses=data.get("max_per_rider_uses"),
        min_fare=Decimal(str(data.get("min_fare", 0))),
        city_id=data.get("city_id"),
        first_ride_only=bool(data.get("first_ride_only", False)),
        campaign_type=data.get("campaign_type", "general"),
        status="active",
    )
    invalidate_ops_cache("customer_growth_dashboard")
    return {"id": promo.id, "code": promo.code, "campaign_type": promo.campaign_type}


def create_marketing_campaign(data: dict, actor) -> dict:
    campaign = MarketingCampaign.objects.create(
        name=data["name"],
        channel=data.get("channel", "promo"),
        audience=data.get("audience", "all_riders"),
        status=data.get("status", "draft"),
        subject=data.get("subject", ""),
        message=data.get("message", ""),
        promo_code_id=data.get("promo_code_id"),
        city_id=data.get("city_id"),
        created_by=actor,
    )
    invalidate_ops_cache("customer_growth_dashboard")
    return {"id": campaign.id, "name": campaign.name, "status": campaign.status}


def build_cached_customer_growth_dashboard():
    return cached_ops_call("customer_growth_dashboard", build_customer_growth_dashboard)
