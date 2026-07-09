"""
Driver Rewards & Incentives — points ledger, tiers, notifications.

Builds on the existing performance system (performance_points) with a separate
lifetime reward_points balance and Uber Pro / Lyft Rewards-style tiers.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from taxi.market import MARKET
from taxi.drivers.models import DriverPointTransaction, DriverProfile

logger = logging.getLogger(__name__)

_REWARDS = MARKET.get("rewards", {})
POINTS = _REWARDS.get("points", {})
TIERS = _REWARDS.get("tiers", [
    (0, "bronze", "Bronze"),
    (1000, "silver", "Silver"),
    (3000, "gold", "Gold"),
    (7000, "platinum", "Platinum"),
    (12000, "diamond", "Diamond"),
])
PEAK_HOURS = _REWARDS.get("peak_hours", [(7, 10), (17, 21)])
LONG_DISTANCE_KM = Decimal(str(_REWARDS.get("long_distance_km", 15)))
AIRPORT_KEYWORDS = tuple(
    kw.lower() for kw in _REWARDS.get("airport_keywords", ["airport", "aeroport"])
)


def get_reward_tier(points: int | None) -> dict:
    """Map lifetime reward_points to tier badge and progress to next level."""
    pts = max(0, int(points or 0))
    current = TIERS[0]
    next_tier = None
    for idx, tier_def in enumerate(TIERS):
        minimum, slug, label = tier_def
        if pts >= minimum:
            current = tier_def
            next_tier = TIERS[idx + 1] if idx + 1 < len(TIERS) else None
    _, slug, label = current
    if next_tier:
        next_min, next_slug, next_label = next_tier
        points_to_next = max(0, next_min - pts)
        span = next_min - current[0]
        progress = int(((pts - current[0]) / span) * 100) if span else 100
    else:
        next_slug = None
        next_label = None
        points_to_next = 0
        progress = 100
    return {
        "tier": slug,
        "label": label,
        "points": pts,
        "next_tier": next_slug,
        "next_tier_label": next_label,
        "points_to_next_level": points_to_next,
        "progress_percent": min(100, max(0, progress)),
    }


class RewardsService:
    """Central rewards orchestrator — ledger, tiers, ride hooks."""

    @transaction.atomic
    def adjust_points(
        self,
        profile: DriverProfile,
        amount: int,
        category: str,
        *,
        description: str = "",
        ride=None,
        metadata: dict | None = None,
        send_notification: bool = True,
    ) -> DriverPointTransaction | None:
        if amount == 0:
            return None
        profile.reward_points = max(0, (profile.reward_points or 0) + amount)
        prev_tier = profile.reward_tier or "bronze"
        tier_info = get_reward_tier(profile.reward_points)
        profile.reward_tier = tier_info["tier"]
        profile.save(update_fields=["reward_points", "reward_tier"])

        txn = DriverPointTransaction.objects.create(
            driver=profile,
            amount=amount,
            category=category,
            description=description or category.replace("_", " ").title(),
            reference_ride=ride,
            metadata=metadata or {},
        )

        if send_notification:
            self._notify_points_change(profile, amount, category, tier_info, prev_tier)
        return txn

    def sync_tier(self, profile: DriverProfile) -> dict:
        tier_info = get_reward_tier(profile.reward_points)
        if profile.reward_tier != tier_info["tier"]:
            profile.reward_tier = tier_info["tier"]
            profile.save(update_fields=["reward_tier"])
        return tier_info

    def on_ride_completed(self, ride, profile: DriverProfile) -> dict:
        """Award ride-completion points and bonuses after a ride finishes."""
        from taxi.drivers.services.achievement_service import AchievementService
        from taxi.drivers.services.challenge_service import ChallengeService

        breakdown: list[dict] = []
        total = 0

        def _award(amt: int, cat: str, desc: str):
            nonlocal total
            if amt:
                self.adjust_points(profile, amt, cat, description=desc, ride=ride)
                breakdown.append({"category": cat, "points": amt, "description": desc})
                total += amt

        _award(POINTS.get("ride_complete", 10), "ride_complete", "Ride completed")

        if self._is_peak_hour(ride.completed_at or timezone.now()):
            _award(POINTS.get("peak_hour_ride", 3), "peak_hour_ride", "Peak-hour ride")

        if self._is_airport_ride(ride):
            _award(POINTS.get("airport_ride", 5), "airport_ride", "Airport ride")

        if self._is_long_distance(ride):
            _award(
                POINTS.get("long_distance_ride", 5),
                "long_distance_ride",
                "Long-distance ride",
            )

        profile.refresh_from_db()
        achievement_result = AchievementService().on_ride_completed(profile)
        challenge_result = ChallengeService().on_ride_completed(profile, ride)

        tier_info = get_reward_tier(profile.reward_points)
        return {
            "points_awarded": total,
            "breakdown": breakdown,
            "total_points": profile.reward_points,
            "tier": tier_info,
            "new_achievements": achievement_result.get("new_achievements", []),
            "challenges_completed": challenge_result.get("completed", []),
        }

    def on_ride_rated(self, ride, profile: DriverProfile, rating: int) -> dict:
        from taxi.drivers.services.achievement_service import AchievementService
        from taxi.drivers.services.feedback_service import FeedbackService

        breakdown: list[dict] = []
        total = 0
        if rating == 5:
            pts = POINTS.get("five_star_rating", 5)
            self.adjust_points(
                profile,
                pts,
                "five_star_rating",
                description="5-star rating",
                ride=ride,
            )
            breakdown.append({"category": "five_star_rating", "points": pts})
            total += pts

        try:
            FeedbackService().update_average_rating(profile)
        except Exception:
            logger.exception("Failed to update average rating for driver=%s", profile.user_id)

        achievement_result = AchievementService().on_ride_rated(profile, rating)
        profile.refresh_from_db()
        return {
            "points_awarded": total,
            "breakdown": breakdown,
            "total_points": profile.reward_points,
            "new_achievements": achievement_result.get("new_achievements", []),
        }

    def on_driver_cancellation(self, profile: DriverProfile, ride=None) -> dict:
        pts = POINTS.get("driver_cancellation", -3)
        self.adjust_points(
            profile,
            pts,
            "driver_cancellation",
            description="Driver cancellation penalty",
            ride=ride,
        )
        from taxi.drivers.services.challenge_service import ChallengeService

        ChallengeService().on_driver_cancelled(profile)
        profile.refresh_from_db()
        return {"points_deducted": abs(pts), "total_points": profile.reward_points}

    def on_referral_completed(self, profile: DriverProfile) -> dict:
        pts = POINTS.get("referral_completed", 50)
        self.adjust_points(
            profile,
            pts,
            "referral_completed",
            description="Referral completed",
        )
        profile.refresh_from_db()
        return {"points_awarded": pts, "total_points": profile.reward_points}

    def on_fraud_confirmed(self, profile: DriverProfile) -> dict:
        pts = POINTS.get("fraud_confirmed", -20)
        self.adjust_points(
            profile,
            pts,
            "fraud_confirmed",
            description="Fraud confirmed",
        )
        profile.refresh_from_db()
        return {"points_deducted": abs(pts), "total_points": profile.reward_points}

    def on_unsafe_driving_complaint(self, profile: DriverProfile) -> dict:
        pts = POINTS.get("unsafe_driving_complaint", -10)
        self.adjust_points(
            profile,
            pts,
            "unsafe_driving_complaint",
            description="Unsafe driving complaint",
        )
        profile.refresh_from_db()
        return {"points_deducted": abs(pts), "total_points": profile.reward_points}

    def get_dashboard(self, profile: DriverProfile) -> dict:
        from taxi.drivers.services.achievement_service import AchievementService
        from taxi.drivers.services.challenge_service import ChallengeService
        from taxi.drivers.services.earnings_service import EarningsService

        tier = get_reward_tier(profile.reward_points)
        earnings = EarningsService()
        today = earnings.get_period_earnings(profile, "today")
        week = earnings.get_period_earnings(profile, "week")
        month = earnings.get_period_earnings(profile, "month")
        lifetime = earnings.get_period_earnings(profile, "lifetime")

        bonus_points = (
            DriverPointTransaction.objects.filter(
                driver=profile,
                category__in=("challenge_bonus", "monthly_bonus"),
                amount__gt=0,
            ).aggregate(total=models.Sum("amount"))["total"]
            or 0
        )

        challenges = ChallengeService().get_active_challenges(profile)
        achievements = AchievementService().get_driver_achievements(profile)
        recent_txns = DriverPointTransaction.objects.filter(driver=profile)[:20]

        return {
            "current_level": tier["label"],
            "current_tier": tier["tier"],
            "total_points": profile.reward_points,
            "progress_percent": tier["progress_percent"],
            "points_to_next_level": tier["points_to_next_level"],
            "next_level": tier["next_tier_label"],
            "lifetime_trips": profile.total_rides_completed or 0,
            "today_trips": self._trip_count(profile, "today"),
            "weekly_trips": self._trip_count(profile, "week"),
            "monthly_trips": self._trip_count(profile, "month"),
            "today_earnings": today.get("total_earnings", "0.00"),
            "weekly_earnings": week.get("total_earnings", "0.00"),
            "monthly_earnings": month.get("total_earnings", "0.00"),
            "lifetime_earnings": lifetime.get("total_earnings", "0.00"),
            "bonuses_earned_points": int(bonus_points),
            "achievements_count": achievements.count(),
            "challenges": challenges,
            "recent_transactions": [
                {
                    "id": t.id,
                    "amount": t.amount,
                    "category": t.category,
                    "description": t.description,
                    "created_at": t.created_at.isoformat(),
                }
                for t in recent_txns
            ],
            "points_rules": POINTS,
        }

    def get_point_history(self, profile: DriverProfile, limit: int = 50) -> list[dict]:
        return [
            {
                "id": t.id,
                "amount": t.amount,
                "category": t.category,
                "description": t.description,
                "ride_id": t.reference_ride_id,
                "created_at": t.created_at,
            }
            for t in DriverPointTransaction.objects.filter(driver=profile)[:limit]
        ]

    def get_admin_leaderboard(self) -> dict:
        from django.db.models import Sum

        eligible = DriverProfile.objects.filter(
            status="approved",
            account_under_review=False,
            account_risk_flag=False,
        )
        profiles = eligible.select_related("user").annotate(
            txn_count=models.Count("point_transactions"),
            bonus_points=Sum(
                "point_transactions__amount",
                filter=models.Q(
                    point_transactions__category__in=(
                        "challenge_bonus",
                        "monthly_bonus",
                    )
                ),
            ),
        )

        def _serialize(p, extra=None):
            tier = get_reward_tier(p.reward_points)
            row = {
                "driver_id": p.user_id,
                "name": p.user.get_full_name() or p.user.email,
                "reward_points": p.reward_points,
                "reward_tier": tier["label"],
                "total_rides_completed": p.total_rides_completed,
                "average_rating": float(p.average_rating or 0),
            }
            if extra:
                row.update(extra)
            return row

        top_drivers = [
            _serialize(p)
            for p in profiles.order_by("-reward_points")[:10]
        ]
        top_earners = self._top_earners_month()
        highest_rated = [
            _serialize(p)
            for p in profiles.filter(average_rating__gte=4.5).order_by(
                "-average_rating", "-total_rides_completed"
            )[:10]
        ]
        most_improved = self._most_improved_drivers(eligible)
        challenge_completions = list(
            DriverPointTransaction.objects.filter(category="challenge_bonus")
            .select_related("driver__user")
            .order_by("-created_at")[:20]
            .values(
                "driver_id",
                "amount",
                "description",
                "created_at",
            )
        )
        monthly_rewards = list(
            __import__(
                "taxi.drivers.models", fromlist=["DriverMonthlyReward"]
            ).DriverMonthlyReward.objects.select_related("driver__user")
            .order_by("-awarded_at")[:20]
            .values(
                "driver_id",
                "reward_type",
                "bonus_amount",
                "year",
                "month",
                "featured",
                "awarded_at",
            )
        )
        return {
            "top_drivers": top_drivers,
            "top_earners": top_earners,
            "highest_rated": highest_rated,
            "most_improved": most_improved,
            "reward_history": self._recent_reward_history(),
            "challenge_completions": challenge_completions,
            "monthly_rewards": monthly_rewards,
        }

    # --- helpers ---

    def _trip_count(self, profile: DriverProfile, period: str) -> int:
        from taxi.rides.models import Ride

        qs = Ride.objects.filter(driver=profile.user, status="completed")
        now = timezone.localtime(timezone.now())
        if period == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            qs = qs.filter(completed_at__gte=start)
        elif period == "week":
            start = (now - timezone.timedelta(days=now.weekday())).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            qs = qs.filter(completed_at__gte=start)
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            qs = qs.filter(completed_at__gte=start)
        return qs.count()

    def _is_peak_hour(self, dt) -> bool:
        local = timezone.localtime(dt)
        hour = local.hour
        return any(start <= hour < end for start, end in PEAK_HOURS)

    def _is_airport_ride(self, ride) -> bool:
        text = f"{ride.pickup} {ride.destination}".lower()
        return any(kw in text for kw in AIRPORT_KEYWORDS)

    def _is_long_distance(self, ride) -> bool:
        return Decimal(str(ride.distance_km or 0)) >= LONG_DISTANCE_KM

    def _most_improved_drivers(self, eligible_profiles, limit: int = 10) -> list[dict]:
        from django.db.models import Sum
        from datetime import timedelta

        since = timezone.now() - timedelta(days=30)
        rows = (
            DriverPointTransaction.objects.filter(
                created_at__gte=since,
                amount__gt=0,
                driver__in=eligible_profiles,
            )
            .values("driver_id", "driver__user__email")
            .annotate(points_gained=Sum("amount"))
            .order_by("-points_gained")[:limit]
        )
        return [
            {
                "driver_id": r["driver_id"],
                "email": r["driver__user__email"],
                "points_gained": int(r["points_gained"] or 0),
            }
            for r in rows
        ]

    def _top_earners_month(self) -> list[dict]:
        from taxi.rides.models import Ride
        from django.db.models import Sum

        now = timezone.localtime(timezone.now())
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        rows = (
            Ride.objects.filter(
                status="completed",
                completed_at__gte=start,
                driver__driver_profile__account_under_review=False,
                driver__driver_profile__account_risk_flag=False,
            )
            .values("driver_id", "driver__email")
            .annotate(total=Sum("driver_earning"))
            .order_by("-total")[:10]
        )
        return [
            {
                "driver_id": r["driver_id"],
                "email": r["driver__email"],
                "monthly_earnings": str(r["total"] or 0),
            }
            for r in rows
            if r["driver_id"]
        ]

    def _recent_reward_history(self, limit: int = 30) -> list[dict]:
        return list(
            DriverPointTransaction.objects.select_related("driver__user")
            .order_by("-created_at")[:limit]
            .values(
                "driver_id",
                "amount",
                "category",
                "description",
                "created_at",
            )
        )

    def _notify_points_change(
        self,
        profile: DriverProfile,
        amount: int,
        category: str,
        tier_info: dict,
        prev_tier: str,
    ) -> None:
        try:
            from notifications.push import send_push_to_user

            if amount > 0:
                send_push_to_user(
                    profile.user,
                    "Points earned!",
                    f"+{amount} points — {category.replace('_', ' ')}",
                    data={"type": "reward_points_earned", "points": amount, "category": category},
                )
            elif category == "driver_cancellation":
                send_push_to_user(
                    profile.user,
                    "Points deducted",
                    f"{amount} points for cancellation",
                    data={"type": "reward_points_deducted", "points": amount},
                )

            if tier_info["tier"] != prev_tier:
                send_push_to_user(
                    profile.user,
                    "Congratulations!",
                    f"You reached {tier_info['label']}.",
                    data={
                        "type": "reward_tier_up",
                        "tier": tier_info["tier"],
                        "label": tier_info["label"],
                    },
                )
            elif tier_info.get("points_to_next_level", 0) in (50, 100, 120, 200, 500):
                send_push_to_user(
                    profile.user,
                    "Almost there!",
                    f"Only {tier_info['points_to_next_level']} points to {tier_info['next_tier_label']}.",
                    data={"type": "reward_tier_progress", "points_remaining": tier_info["points_to_next_level"]},
                )
        except Exception:
            logger.exception("Failed to send reward notification driver=%s", profile.user_id)

        if tier_info["tier"] != prev_tier:
            try:
                from asgiref.sync import async_to_sync
                from channels.layers import get_channel_layer
                from taxi.rides.consumers import send_level_change

                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(send_level_change)(
                        channel_layer,
                        profile.user_id,
                        tier_info["label"],
                        prev_tier,
                    )
            except Exception:
                logger.debug("WebSocket level_change skipped for driver=%s", profile.user_id)
