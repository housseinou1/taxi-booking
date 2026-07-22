"""Rider loyalty program service (Phase 33)."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from operations.models import PlatformSetting

from loyalty.models import LoyaltyPointTransaction, LoyaltyReward, LoyaltyTier, RiderLoyaltyAccount

User = get_user_model()

DEFAULT_EARN_RULES = {
    "ride": 10,
    "delivery": 8,
    "merchant_order": 5,
    "referral": 50,
}

FEATURE_FLAG_KEY = "customer_growth_flags"


def get_growth_flags() -> dict:
    defaults = {
        "referral_program_enabled": True,
        "loyalty_program_enabled": True,
        "promo_campaigns_enabled": True,
        "merchant_referrals_enabled": True,
    }
    stored = PlatformSetting.get_value(FEATURE_FLAG_KEY, {}) or {}
    return {**defaults, **stored}


def is_loyalty_enabled() -> bool:
    return bool(get_growth_flags().get("loyalty_program_enabled", True))


def get_earn_rules() -> dict:
    cfg = PlatformSetting.get_value("loyalty_earn_rules", {}) or {}
    return {**DEFAULT_EARN_RULES, **cfg}


def get_or_create_account(rider) -> RiderLoyaltyAccount:
    account, created = RiderLoyaltyAccount.objects.get_or_create(rider=rider)
    if created or not account.tier_id:
        bronze = LoyaltyTier.objects.filter(slug="bronze").first()
        if bronze:
            account.tier = bronze
            account.save(update_fields=["tier", "updated_at"])
    return account


def _resolve_tier(points: int) -> LoyaltyTier | None:
    return (
        LoyaltyTier.objects.filter(is_active=True, min_points__lte=points)
        .order_by("-min_points")
        .first()
    )


@transaction.atomic
def earn_points(rider, points: int, source: str, *, reference: str = "", note: str = "") -> RiderLoyaltyAccount | None:
    if not is_loyalty_enabled() or points <= 0 or not rider:
        return None

    account = get_or_create_account(rider)
    account.points_balance += points
    account.lifetime_points += points
    account.tier = _resolve_tier(account.lifetime_points)
    account.save(update_fields=["points_balance", "lifetime_points", "tier", "updated_at"])
    LoyaltyPointTransaction.objects.create(
        account=account,
        points=points,
        source=source,
        reference=reference,
        note=note,
    )
    return account


def redeem_reward(rider, reward_id: int) -> dict:
    if not is_loyalty_enabled():
        return {"success": False, "error": "Loyalty program is disabled."}

    reward = LoyaltyReward.objects.filter(id=reward_id, is_active=True).select_related("min_tier").first()
    if not reward:
        return {"success": False, "error": "Reward not found."}

    account = get_or_create_account(rider)
    if reward.min_tier and (not account.tier or account.tier.min_points < reward.min_tier.min_points):
        return {"success": False, "error": "Tier requirement not met."}
    if account.points_balance < reward.points_cost:
        return {"success": False, "error": "Insufficient points."}

    with transaction.atomic():
        account.points_balance -= reward.points_cost
        account.save(update_fields=["points_balance", "updated_at"])
        LoyaltyPointTransaction.objects.create(
            account=account,
            points=-reward.points_cost,
            source="redemption",
            reference=f"reward:{reward.id}",
            note=reward.name,
        )

        if reward.reward_type == "wallet_credit":
            from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet

            wallet = get_or_create_wallet(rider)
            apply_wallet_transaction(
                wallet,
                reward.value,
                is_credit=True,
                transaction_type="referral",
                reference=f"loyalty_reward:{reward.id}",
                note=f"Loyalty redemption — {reward.name}",
            )

    return {
        "success": True,
        "reward": reward.name,
        "reward_type": reward.reward_type,
        "points_remaining": account.points_balance,
    }


def serialize_account(account: RiderLoyaltyAccount) -> dict:
    tier = account.tier
    next_tier = (
        LoyaltyTier.objects.filter(is_active=True, min_points__gt=account.lifetime_points)
        .order_by("min_points")
        .first()
    )
    return {
        "points_balance": account.points_balance,
        "lifetime_points": account.lifetime_points,
        "tier": {
            "slug": tier.slug if tier else "bronze",
            "name": tier.name if tier else "Bronze",
            "ride_discount_percent": float(tier.ride_discount_percent) if tier else 0,
            "delivery_discount_percent": float(tier.delivery_discount_percent) if tier else 0,
            "priority_support": tier.priority_support if tier else False,
            "exclusive_promotions": tier.exclusive_promotions if tier else False,
        },
        "next_tier": {
            "name": next_tier.name,
            "min_points": next_tier.min_points,
            "points_needed": max(next_tier.min_points - account.lifetime_points, 0),
        }
        if next_tier
        else None,
        "enrolled_at": account.enrolled_at.isoformat(),
    }


def seed_default_tiers():
    defaults = [
        ("bronze", "Bronze", 0, 0, 0, False, False, 1),
        ("silver", "Silver", 500, 5, 5, False, False, 2),
        ("gold", "Gold", 2000, 10, 10, True, True, 3),
        ("platinum", "Platinum", 5000, 15, 15, True, True, 4),
    ]
    for slug, name, min_pts, ride_disc, del_disc, priority, exclusive, order in defaults:
        LoyaltyTier.objects.update_or_create(
            slug=slug,
            defaults={
                "name": name,
                "min_points": min_pts,
                "ride_discount_percent": Decimal(str(ride_disc)),
                "delivery_discount_percent": Decimal(str(del_disc)),
                "priority_support": priority,
                "exclusive_promotions": exclusive,
                "sort_order": order,
                "is_active": True,
            },
        )
