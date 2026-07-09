"""
Driver ride-offer performance penalties and metrics.

Enforces missed-offer, decline, and driver-cancellation rules server-side.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from taxi.drivers.models import DriverProfile

logger = logging.getLogger(__name__)

PERFORMANCE_PENALTY_POINTS = 3
ACCEPTANCE_RATE_PENALTY = 1
DAILY_DRIVER_CANCEL_RISK_THRESHOLD = 5
WEEKLY_DRIVER_CANCEL_RISK_THRESHOLD = 20
RISK_WARNING_MESSAGE = (
    "Your cancellation rate is high. "
    "Please improve your performance to avoid account review."
)
WEEKLY_RISK_WARNING_MESSAGE = (
    "You have exceeded the weekly cancellation limit. "
    "Your account is under review."
)

# Driver Score (0–100) tier labels shown in profile / performance UI.
SCORE_TIER_THRESHOLDS = (
    (95, "diamond", "Diamond"),
    (90, "platinum", "Platinum"),
    (80, "gold", "Gold"),
    (70, "silver", "Silver"),
)


def get_driver_score_tier(performance_points: int | None) -> dict:
    """Map performance_points (0–100) to Lyft-style tier badge."""
    points = max(0, min(100, int(performance_points or 100)))
    for minimum, tier, label in SCORE_TIER_THRESHOLDS:
        if points >= minimum:
            return {
                "score": points,
                "tier": tier,
                "label": label,
                "needs_improvement": False,
            }
    return {
        "score": points,
        "tier": "needs_improvement",
        "label": "Needs Improvement",
        "needs_improvement": True,
    }


def _flag_driver_cancellation_abuse(profile: DriverProfile, description: str) -> None:
    try:
        from security.models import FraudFlag

        FraudFlag.objects.get_or_create(
            user=profile.user,
            reason="excessive_cancellations",
            status="open",
            defaults={
                "severity": "medium",
                "description": description,
            },
        )
    except Exception:
        logger.exception(
            "Failed to create FraudFlag for driver cancellation abuse user=%s",
            profile.user_id,
        )


def _today() -> date:
    return timezone.localdate()


@transaction.atomic
def _save_profile(profile: DriverProfile, update_fields: list[str]) -> DriverProfile:
    profile.save(update_fields=update_fields)
    return profile


def record_ride_offer_sent(profile: DriverProfile) -> None:
    profile.total_rides_received = (profile.total_rides_received or 0) + 1
    _save_profile(profile, ["total_rides_received"])


def record_ride_accepted(profile: DriverProfile) -> None:
    profile.total_rides_accepted = (profile.total_rides_accepted or 0) + 1
    _save_profile(profile, ["total_rides_accepted"])


def _apply_offer_penalty(profile: DriverProfile) -> None:
    current_perf = profile.performance_points if profile.performance_points is not None else 100
    current_accept = (
        profile.acceptance_rate_points if profile.acceptance_rate_points is not None else 100
    )
    profile.performance_points = max(0, current_perf - PERFORMANCE_PENALTY_POINTS)
    profile.acceptance_rate_points = max(0, current_accept - ACCEPTANCE_RATE_PENALTY)


def apply_missed_offer_penalty(profile: DriverProfile) -> None:
    profile.total_rides_missed = (profile.total_rides_missed or 0) + 1
    _apply_offer_penalty(profile)
    _save_profile(
        profile,
        ["total_rides_missed", "performance_points", "acceptance_rate_points"],
    )
    logger.info(
        "Driver %s missed ride offer (missed=%s, performance=%s, acceptance=%s)",
        profile.user_id,
        profile.total_rides_missed,
        profile.performance_points,
        profile.acceptance_rate_points,
    )


def apply_decline_penalty(profile: DriverProfile) -> None:
    profile.total_rides_declined = (profile.total_rides_declined or 0) + 1
    _apply_offer_penalty(profile)
    _save_profile(
        profile,
        ["total_rides_declined", "performance_points", "acceptance_rate_points"],
    )
    logger.info(
        "Driver %s declined ride offer (declined=%s)",
        profile.user_id,
        profile.total_rides_declined,
    )


def _count_weekly_driver_cancellations(profile: DriverProfile) -> int:
    """Return driver cancellations this calendar week (Mon–Sun) from Ride model."""
    from taxi.rides.models import Ride

    today = timezone.localdate()
    monday = today - timedelta(days=today.weekday())
    week_start = timezone.make_aware(
        timezone.datetime(monday.year, monday.month, monday.day)
    )
    return Ride.objects.filter(
        driver=profile.user,
        cancelled_by="driver",
        cancelled_at__gte=week_start,
    ).count()


def apply_driver_cancellation_penalty(profile: DriverProfile) -> dict:
    profile.total_rides_cancelled = (profile.total_rides_cancelled or 0) + 1
    _apply_offer_penalty(profile)

    today = _today()
    if profile.cancellations_today_date != today:
        profile.cancellations_today_date = today
        profile.cancellations_today_count = 1
    else:
        profile.cancellations_today_count = (profile.cancellations_today_count or 0) + 1

    risk_triggered = False
    weekly_risk_triggered = False

    if profile.cancellations_today_count >= DAILY_DRIVER_CANCEL_RISK_THRESHOLD:
        profile.account_risk_flag = True
        profile.account_under_review = True
        profile.account_risk_reason = RISK_WARNING_MESSAGE
        risk_triggered = True

    if not risk_triggered:
        weekly_count = _count_weekly_driver_cancellations(profile)
        if weekly_count >= WEEKLY_DRIVER_CANCEL_RISK_THRESHOLD:
            profile.account_risk_flag = True
            profile.account_under_review = True
            profile.account_risk_reason = WEEKLY_RISK_WARNING_MESSAGE
            weekly_risk_triggered = True

    _save_profile(
        profile,
        [
            "total_rides_cancelled",
            "performance_points",
            "acceptance_rate_points",
            "cancellations_today_date",
            "cancellations_today_count",
            "account_risk_flag",
            "account_under_review",
            "account_risk_reason",
        ],
    )

    if risk_triggered:
        _notify_risk_warning(profile, RISK_WARNING_MESSAGE)
        _flag_driver_cancellation_abuse(
            profile,
            f"Driver exceeded {DAILY_DRIVER_CANCEL_RISK_THRESHOLD} cancellations today.",
        )
    elif weekly_risk_triggered:
        _notify_risk_warning(profile, WEEKLY_RISK_WARNING_MESSAGE)
        _flag_driver_cancellation_abuse(
            profile,
            f"Driver exceeded {WEEKLY_DRIVER_CANCEL_RISK_THRESHOLD} cancellations this week.",
        )
    else:
        try:
            from notifications.push import send_push_to_user

            send_push_to_user(
                profile.user,
                "Cancellation recorded",
                "Your cancellation rate increased. Acceptance -1%, Driver Score -3.",
                data={"type": "driver_cancel_penalty"},
                app_type="driver",
            )
        except Exception:
            logger.exception(
                "Failed to send cancel penalty notification driver=%s",
                profile.user_id,
            )

    tier = get_driver_score_tier(profile.performance_points)
    return {
        "risk_triggered": risk_triggered or weekly_risk_triggered,
        "cancellations_today": profile.cancellations_today_count,
        "performance_points": profile.performance_points,
        "acceptance_rate_points": profile.acceptance_rate_points,
        "driver_score_tier": tier["tier"],
        "driver_score_label": tier["label"],
    }


def record_driver_no_show(profile: DriverProfile) -> None:
    """Increment no-show rides counter (driver confirmed rider no-show). No penalty."""
    profile.total_rides_no_show = (profile.total_rides_no_show or 0) + 1
    _save_profile(profile, ["total_rides_no_show"])


def _notify_risk_warning(profile: DriverProfile, message: str = RISK_WARNING_MESSAGE) -> None:
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            profile.user,
            "Account at risk",
            message,
            data={"type": "driver_cancellation_risk"},
            app_type="driver",
        )
    except Exception:
        logger.exception(
            "Failed to send cancellation risk warning to driver %s",
            profile.user_id,
        )


def notify_driver_milestone(profile: DriverProfile, completed_count: int) -> None:
    """Fire push notification for milestone trip counts (100, 250, 500, 1000, …)."""
    milestones = [100, 250, 500, 1000, 2000, 5000]
    if completed_count not in milestones:
        return
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            profile.user,
            "🎉 Milestone reached!",
            f"Congratulations! You have completed {completed_count} trips on Yala.",
            data={"type": "driver_milestone", "count": completed_count},
            app_type="driver",
        )
    except Exception:
        logger.exception("Failed to send milestone notification to driver %s", profile.user_id)


def notify_driver_level_up(profile: DriverProfile, new_level: str) -> None:
    """Fire push notification when driver level increases."""
    labels = {
        "silver": "Silver",
        "gold": "Gold",
        "platinum": "Platinum",
        "elite": "Elite",
    }
    label = labels.get(new_level, new_level.capitalize())
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            profile.user,
            f"🏆 You reached {label}!",
            f"You have been promoted to {label} level. Enjoy your new benefits.",
            data={"type": "driver_level_up", "level": new_level},
            app_type="driver",
        )
    except Exception:
        logger.exception("Failed to send level-up notification to driver %s", profile.user_id)


def record_ride_completed(profile: DriverProfile) -> None:
    """Increment completed ride counter and fire milestone notification if applicable."""
    profile.total_rides_completed = (profile.total_rides_completed or 0) + 1
    _save_profile(profile, ["total_rides_completed"])
    notify_driver_milestone(profile, profile.total_rides_completed)


def get_driver_performance_snapshot(profile: DriverProfile) -> dict:
    received = profile.total_rides_received or 0
    accepted = profile.total_rides_accepted or 0
    computed_rate = round((accepted / received) * 100, 1) if received else 0
    tier = get_driver_score_tier(profile.performance_points)
    return {
        "performance_points": profile.performance_points or 100,
        "driver_score": tier["score"],
        "driver_score_tier": tier["tier"],
        "driver_score_label": tier["label"],
        "acceptance_rate": profile.acceptance_rate_points or 100,
        "acceptance_rate_computed": computed_rate,
        "total_rides_received": received,
        "total_rides_accepted": accepted,
        "total_rides_missed": profile.total_rides_missed or 0,
        "total_rides_declined": profile.total_rides_declined or 0,
        "total_rides_cancelled": profile.total_rides_cancelled or 0,
        "total_rides_no_show": profile.total_rides_no_show or 0,
        "cancellations_today": profile.cancellations_today_count or 0,
        "account_risk_flag": profile.account_risk_flag,
        "account_under_review": profile.account_under_review,
        "account_risk_reason": profile.account_risk_reason or "",
        "cancellation_warning": (
            profile.account_risk_reason
            if profile.account_risk_flag or profile.account_under_review
            else ""
        ),
    }
