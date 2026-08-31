"""
Driver Performance & Rewards Hub — aggregates scorecard, achievements,
insights, leaderboard, and rewards history from backend data sources.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from incentives.models import BonusPayment
from operations.incentive_engine_service import build_driver_campaigns_payload
from operations.models import PlatformSetting
from taxi.rides.models import Ride

from ..models import DriverProfile, DriverSettings
from .achievement_service import AchievementService, MILESTONE_DEFINITIONS
from .earnings_service import EarningsService
from .level_service import DriverLevelService
from .rewards_service import RewardsService
from .ride_performance_service import get_driver_score_tier

HUB_CONFIG_KEY = "driver_performance_hub"
DEFAULT_HUB_CONFIG = {
    "leaderboard_enabled": True,
    "leaderboard_categories": ["trips", "rating", "acceptance", "earnings"],
    "allow_leaderboard_opt_out": True,
}

ACHIEVEMENT_ICONS = {
    "first_ride": "🥉",
    "100_rides": "🥈",
    "500_rides": "🥉",
    "1000_rides": "🥇",
    "excellent_rating": "⭐",
    "safe_driver": "🛡",
    "top_driver": "🚀",
    "airport_specialist": "✈",
    "weekend_champion": "📅",
    "five_star_streak_10": "⭐",
    "zero_cancellations_30_days": "🔥",
}


def get_hub_config() -> dict:
    stored = PlatformSetting.get_value(HUB_CONFIG_KEY, {}) or {}
    config = {**DEFAULT_HUB_CONFIG, **stored}
    categories = config.get("leaderboard_categories") or DEFAULT_HUB_CONFIG["leaderboard_categories"]
    config["leaderboard_categories"] = [c for c in categories if c in DEFAULT_HUB_CONFIG["leaderboard_categories"]]
    return config


def _trend(current, previous):
    current = float(current or 0)
    previous = float(previous or 0)
    delta = round(current - previous, 1)
    if delta > 0:
        direction = "up"
    elif delta < 0:
        direction = "down"
    else:
        direction = "flat"
    return {
        "current": current,
        "previous": previous,
        "delta": delta,
        "direction": direction,
    }


def _ride_qs(profile, start=None, end=None):
    qs = Ride.objects.filter(driver=profile.user)
    if start is not None:
        qs = qs.filter(created_at__gte=start)
    if end is not None:
        qs = qs.filter(created_at__lt=end)
    return qs


def _period_metrics(profile, start, end):
    qs = _ride_qs(profile, start, end)
    completed = qs.filter(status="completed")
    accepted = qs.exclude(status__in=["requested", "scheduled", "cancelled"]).count()
    cancelled = qs.filter(status="cancelled", cancelled_by="driver").count()
    received = qs.count()
    trips = completed.count()
    completion_rate = round((trips / accepted) * 100, 1) if accepted else 0
    cancellation_rate = round((cancelled / accepted) * 100, 1) if accepted else 0
    acceptance_rate = round((accepted / received) * 100, 1) if received else 0
    rating = completed.filter(rating__isnull=False).aggregate(avg=Avg("rating"))["avg"]
    earnings = completed.aggregate(total=Sum("driver_earning"))["total"] or Decimal("0")
    pickup_samples = []
    for ride in completed.filter(driver_arrived_at__isnull=False).only(
        "created_at", "offer_sent_at", "driver_arrived_at"
    )[:500]:
        start_at = ride.offer_sent_at or ride.created_at
        if start_at and ride.driver_arrived_at:
            minutes = (ride.driver_arrived_at - start_at).total_seconds() / 60
            if 0 <= minutes <= 120:
                pickup_samples.append(minutes)
    avg_pickup = round(sum(pickup_samples) / len(pickup_samples), 1) if pickup_samples else None
    days_active = (
        completed.filter(completed_at__isnull=False)
        .annotate(day=TruncDate("completed_at"))
        .values("day")
        .distinct()
        .count()
    )
    satisfaction = None
    rated = completed.filter(rating__isnull=False).count()
    if rated:
        high = completed.filter(rating__gte=4).count()
        satisfaction = round((high / rated) * 100, 1)
    return {
        "total_trips": trips,
        "acceptance_rate": acceptance_rate,
        "completion_rate": completion_rate,
        "cancellation_rate": cancellation_rate,
        "average_rating": round(float(rating), 2) if rating else None,
        "average_pickup_time_minutes": avg_pickup,
        "customer_satisfaction": satisfaction,
        "days_active": days_active,
        "earnings": float(earnings),
    }


def _period_boundaries(reference, period):
    now = timezone.localtime(reference)
    if period == "week":
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = start + timedelta(days=7)
        prev_end = start
        prev_start = start - timedelta(days=7)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        prev_end = start
        if start.month == 1:
            prev_start = start.replace(year=start.year - 1, month=12)
        else:
            prev_start = start.replace(month=start.month - 1)
    else:
        raise ValueError(f"Unsupported period: {period}")
    return start, end, prev_start, prev_end


def build_scorecard(profile: DriverProfile) -> dict:
    total_completed = profile.total_rides_completed or 0
    total_accepted = profile.total_rides_accepted or 0
    total_cancelled = profile.total_rides_cancelled or 0
    acceptance_rate = profile.acceptance_rate_points or 0
    completion_rate = (
        round((total_completed / total_accepted) * 100, 1) if total_accepted else 0
    )
    cancellation_rate = (
        round((total_cancelled / total_accepted) * 100, 1) if total_accepted else 0
    )
    lifetime = _period_metrics(profile, None, None)
    week_start, week_end, prev_week_start, prev_week_end = _period_boundaries(timezone.now(), "week")
    month_start, month_end, prev_month_start, prev_month_end = _period_boundaries(
        timezone.now(), "month"
    )
    week = _period_metrics(profile, week_start, week_end)
    prev_week = _period_metrics(profile, prev_week_start, prev_week_end)
    month = _period_metrics(profile, month_start, month_end)
    prev_month = _period_metrics(profile, prev_month_start, prev_month_end)
    score_tier = get_driver_score_tier(profile.performance_points)
    return {
        "overall_rating": float(profile.average_rating or 0),
        "total_trips": total_completed,
        "completion_rate": completion_rate,
        "acceptance_rate": acceptance_rate,
        "cancellation_rate": cancellation_rate,
        "average_pickup_time_minutes": lifetime["average_pickup_time_minutes"],
        "customer_satisfaction": lifetime["customer_satisfaction"],
        "days_active": lifetime["days_active"],
        "driver_score": score_tier["score"],
        "driver_score_label": score_tier["label"],
        "trends": {
            "week": {
                "total_trips": _trend(week["total_trips"], prev_week["total_trips"]),
                "acceptance_rate": _trend(week["acceptance_rate"], prev_week["acceptance_rate"]),
                "completion_rate": _trend(week["completion_rate"], prev_week["completion_rate"]),
                "cancellation_rate": _trend(week["cancellation_rate"], prev_week["cancellation_rate"]),
                "average_rating": _trend(week["average_rating"], prev_week["average_rating"]),
                "average_pickup_time_minutes": _trend(
                    week["average_pickup_time_minutes"] or 0,
                    prev_week["average_pickup_time_minutes"] or 0,
                ),
                "customer_satisfaction": _trend(
                    week["customer_satisfaction"] or 0,
                    prev_week["customer_satisfaction"] or 0,
                ),
                "days_active": _trend(week["days_active"], prev_week["days_active"]),
            },
            "month": {
                "total_trips": _trend(month["total_trips"], prev_month["total_trips"]),
                "acceptance_rate": _trend(month["acceptance_rate"], prev_month["acceptance_rate"]),
                "completion_rate": _trend(month["completion_rate"], prev_month["completion_rate"]),
                "cancellation_rate": _trend(month["cancellation_rate"], prev_month["cancellation_rate"]),
                "average_rating": _trend(month["average_rating"], prev_month["average_rating"]),
                "average_pickup_time_minutes": _trend(
                    month["average_pickup_time_minutes"] or 0,
                    prev_month["average_pickup_time_minutes"] or 0,
                ),
                "customer_satisfaction": _trend(
                    month["customer_satisfaction"] or 0,
                    prev_month["customer_satisfaction"] or 0,
                ),
                "days_active": _trend(month["days_active"], prev_month["days_active"]),
            },
        },
    }


def _achievement_progress(profile: DriverProfile, code: str, definition: dict) -> dict:
    earned_map = {
        da.achievement.code: da
        for da in profile.achievements.select_related("achievement").all()
    }
    earned = earned_map.get(code)
    if earned:
        return {
            "code": code,
            "name": definition["name"],
            "description": definition["description"],
            "icon": ACHIEVEMENT_ICONS.get(code, definition.get("icon", "🏅")),
            "earned": True,
            "earned_at": earned.earned_at,
            "progress_percent": 100,
            "progress_label": "Earned",
        }

    total = profile.total_rides_completed or 0
    threshold = definition.get("rides_threshold")
    if threshold:
        pct = min(100, round((total / threshold) * 100, 1))
        return {
            "code": code,
            "name": definition["name"],
            "description": definition["description"],
            "icon": ACHIEVEMENT_ICONS.get(code, definition.get("icon", "🏅")),
            "earned": False,
            "earned_at": None,
            "progress_percent": pct,
            "progress_label": f"{total}/{threshold} trips",
        }

    if code == "excellent_rating":
        rating = float(profile.average_rating or 0)
        rides_ok = total >= 50
        pct = min(100, round((rating / 4.9) * 100, 1)) if rides_ok else round((total / 50) * 100, 1)
        return {
            "code": code,
            "name": definition["name"],
            "description": definition["description"],
            "icon": ACHIEVEMENT_ICONS.get(code, "⭐"),
            "earned": False,
            "earned_at": None,
            "progress_percent": min(pct, 99),
            "progress_label": f"Rating {rating:.1f} · {total}/50 trips",
        }

    if code == "zero_cancellations_30_days":
        thirty_days_ago = timezone.now() - timedelta(days=30)
        cancellations = Ride.objects.filter(
            driver=profile.user,
            status="cancelled",
            cancelled_by="driver",
            created_at__gte=thirty_days_ago,
        ).count()
        days_clean = 30 if cancellations == 0 else max(0, 30 - cancellations)
        return {
            "code": code,
            "name": definition["name"],
            "description": definition["description"],
            "icon": ACHIEVEMENT_ICONS.get(code, "🔥"),
            "earned": False,
            "earned_at": None,
            "progress_percent": round((days_clean / 30) * 100, 1),
            "progress_label": f"{days_clean}/30 days without cancellation",
        }

    if code == "top_driver":
        tier = profile.reward_tier or "bronze"
        tiers = ["bronze", "silver", "gold", "platinum", "diamond"]
        idx = tiers.index(tier) if tier in tiers else 0
        pct = round((idx / (len(tiers) - 1)) * 100, 1)
        return {
            "code": code,
            "name": definition["name"],
            "description": definition["description"],
            "icon": ACHIEVEMENT_ICONS.get(code, "🚀"),
            "earned": False,
            "earned_at": None,
            "progress_percent": pct,
            "progress_label": f"Reward tier: {tier}",
        }

    return {
        "code": code,
        "name": definition["name"],
        "description": definition["description"],
        "icon": ACHIEVEMENT_ICONS.get(code, "🏅"),
        "earned": False,
        "earned_at": None,
        "progress_percent": 0,
        "progress_label": "In progress",
    }


def build_achievements(profile: DriverProfile) -> dict:
    AchievementService().ensure_achievements_exist()
    catalog = [
        _achievement_progress(profile, code, definition)
        for code, definition in MILESTONE_DEFINITIONS.items()
    ]
    earned = [item for item in catalog if item["earned"]]
    return {
        "earned_count": len(earned),
        "total_count": len(catalog),
        "badges": catalog,
        "earned": earned,
    }


def build_insights(profile: DriverProfile) -> dict:
    completed = Ride.objects.filter(
        driver=profile.user,
        status="completed",
        completed_at__isnull=False,
    )
    hour_counts = defaultdict(int)
    day_counts = defaultdict(int)
    day_earnings = defaultdict(Decimal)
    for ride in completed.only("completed_at", "driver_earning")[:1000]:
        local = timezone.localtime(ride.completed_at)
        hour_counts[local.hour] += 1
        day_counts[local.strftime("%A")] += 1
        day_earnings[local.strftime("%A")] += ride.driver_earning or Decimal("0")

    best_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    best_days = sorted(day_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    best_earning_days = sorted(day_earnings.items(), key=lambda x: x[1], reverse=True)[:3]

    week_start, week_end, prev_week_start, prev_week_end = _period_boundaries(timezone.now(), "week")
    week = _period_metrics(profile, week_start, week_end)
    prev_week = _period_metrics(profile, prev_week_start, prev_week_end)

    goals = []
    if (profile.acceptance_rate_points or 0) < 80:
        goals.append("Aim for 80%+ acceptance to unlock better ride matching.")
    if float(profile.average_rating or 0) < 4.7:
        goals.append("Focus on rider experience to raise your rating above 4.7.")
    next_level = DriverLevelService().get_progress(profile).get("next_level")
    if next_level:
        goals.append(f"Keep steady trips to reach {next_level.capitalize()} level.")
    if week["cancellation_rate"] > prev_week["cancellation_rate"]:
        goals.append("Cancellation rate rose this week — avoid cancelling after accepting.")

    return {
        "best_working_hours": [
            {"hour": h, "label": f"{h:02d}:00", "trips": count} for h, count in best_hours
        ],
        "best_earning_days": [
            {"day": day, "trips": day_counts.get(day, 0), "earnings": float(day_earnings.get(day, 0))}
            for day, _ in best_earning_days
        ],
        "best_trip_days": [{"day": day, "trips": count} for day, count in best_days],
        "acceptance_trend": _trend(week["acceptance_rate"], prev_week["acceptance_rate"]),
        "cancellation_trend": _trend(week["cancellation_rate"], prev_week["cancellation_rate"]),
        "rating_trend": _trend(week["average_rating"] or 0, prev_week["average_rating"] or 0),
        "suggested_goals": goals[:5],
    }


def _leaderboard_name(profile: DriverProfile, viewer: DriverProfile) -> str:
    if profile.id == viewer.id:
        return f"{profile.user.first_name or 'You'}".strip() or "You"
    settings = getattr(profile, "settings", None)
    if settings and not settings.privacy_show_name:
        return "Driver"
    first = (profile.user.first_name or "Driver")[0]
    return f"{first}.***"


def build_leaderboard(profile: DriverProfile, config: dict) -> dict:
    settings_obj, _ = DriverSettings.objects.get_or_create(driver=profile)
    opted_out = settings_obj.privacy_leaderboard_opt_out
    if not config.get("leaderboard_enabled"):
        return {"enabled": False, "opted_out": opted_out, "rankings": {}, "my_ranks": {}}

    city_id = getattr(profile.user, "city_id", None)
    peers = DriverProfile.objects.filter(status="approved").select_related("user")
    if city_id:
        peers = peers.filter(user__city_id=city_id)
    opt_out_ids = set(
        DriverSettings.objects.filter(privacy_leaderboard_opt_out=True).values_list("driver_id", flat=True)
    )
    visible = [p for p in peers if p.id not in opt_out_ids or p.id == profile.id][:200]

    def rank_by(key_fn, reverse=True):
        rows = sorted(visible, key=key_fn, reverse=reverse)
        payload = []
        my_rank = None
        for idx, row in enumerate(rows[:10], start=1):
            payload.append(
                {
                    "rank": idx,
                    "driver_id": row.id,
                    "name": _leaderboard_name(row, profile),
                    "value": key_fn(row),
                    "is_me": row.id == profile.id,
                }
            )
            if row.id == profile.id:
                my_rank = idx
        if my_rank is None and not opted_out:
            for idx, row in enumerate(rows, start=1):
                if row.id == profile.id:
                    my_rank = idx
                    break
        return payload, my_rank

    earnings_svc = EarningsService()
    month_earnings = {
        p.id: float(earnings_svc.get_period_earnings(p, "month")["total_earnings"])
        for p in visible
    }

    rankings = {}
    my_ranks = {}
    categories = config.get("leaderboard_categories") or []
    if "trips" in categories:
        rankings["trips"], my_ranks["trips"] = rank_by(lambda p: p.total_rides_completed or 0)
    if "rating" in categories:
        rankings["rating"], my_ranks["rating"] = rank_by(
            lambda p: float(p.average_rating or 0),
            reverse=True,
        )
    if "acceptance" in categories:
        rankings["acceptance"], my_ranks["acceptance"] = rank_by(
            lambda p: p.acceptance_rate_points or 0
        )
    if "earnings" in categories:
        rankings["earnings"], my_ranks["earnings"] = rank_by(
            lambda p: month_earnings.get(p.id, 0)
        )

    return {
        "enabled": True,
        "opted_out": opted_out,
        "allow_opt_out": config.get("allow_leaderboard_opt_out", True),
        "rankings": rankings if not opted_out else {},
        "my_ranks": my_ranks if not opted_out else {},
    }


def build_rewards_history(profile: DriverProfile, limit: int = 30) -> dict:
    rewards_svc = RewardsService()
    point_history = rewards_svc.get_point_history(profile, limit=limit)
    bonuses = BonusPayment.objects.filter(driver=profile.user).select_related("program").order_by("-paid_at")[:limit]
    achievements = AchievementService().get_driver_achievements(profile)[:limit]

    referral_rewards = []
    try:
        from referrals.models import ReferralReward

        referral_rewards = [
            {
                "amount": float(r.amount),
                "status": r.status,
                "created_at": r.created_at,
                "description": "Referral reward",
            }
            for r in ReferralReward.objects.filter(referrer=profile.user).order_by("-created_at")[:10]
        ]
    except Exception:
        pass

    return {
        "point_transactions": point_history,
        "bonuses": [
            {
                "program": b.program.name if b.program else "Bonus",
                "amount": float(b.amount),
                "status": b.payout_status,
                "created_at": b.paid_at,
            }
            for b in bonuses
        ],
        "achievements": [
            {
                "name": a.achievement.name,
                "icon": ACHIEVEMENT_ICONS.get(a.achievement.code, "🏅"),
                "earned_at": a.earned_at,
            }
            for a in achievements
        ],
        "referral_rewards": referral_rewards,
    }


def build_performance_hub(profile: DriverProfile) -> dict:
    config = get_hub_config()
    level_service = DriverLevelService()
    progress = level_service.get_progress(profile)
    requirements = []
    for level in level_service.LEVELS:
        entry = {
            "level": level,
            "label": level.capitalize(),
            "benefits": level_service.get_benefits(level),
        }
        if level in level_service.THRESHOLDS:
            threshold = level_service.THRESHOLDS[level]
            entry["requirements"] = {
                "rides": threshold["rides"],
                "rating": float(threshold["rating"]),
                "acceptance_rate": threshold["acceptance"],
                "completion_rate": threshold["completion"],
            }
        else:
            entry["requirements"] = None
        requirements.append(entry)

    return {
        "generated_at": timezone.now().isoformat(),
        "config": config,
        "scorecard": build_scorecard(profile),
        "achievements": build_achievements(profile),
        "incentives": build_driver_campaigns_payload(profile.user),
        "level": {
            "current_level": progress["current_level"],
            "next_level": progress["next_level"],
            "progress_percentage": progress["progress_percentage"],
            "metrics": progress["metrics"],
            "next_thresholds": progress["next_thresholds"],
            "benefits": level_service.get_benefits(profile.driver_level),
        },
        "level_requirements": {"levels": requirements},
        "insights": build_insights(profile),
        "leaderboard": build_leaderboard(profile, config),
        "rewards_history": build_rewards_history(profile),
    }
