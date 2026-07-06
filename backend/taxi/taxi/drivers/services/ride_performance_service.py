"""
Driver ride-offer performance penalties and metrics.

Enforces missed-offer, decline, and driver-cancellation rules server-side.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import transaction
from django.utils import timezone

from taxi.drivers.models import DriverProfile

logger = logging.getLogger(__name__)

PERFORMANCE_PENALTY_POINTS = 3
ACCEPTANCE_RATE_PENALTY = 1
DAILY_DRIVER_CANCEL_RISK_THRESHOLD = 5
RISK_WARNING_MESSAGE = (
    "Your account is at risk because of repeated cancellations."
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
    profile.performance_points = max(
        0, (profile.performance_points or 100) - PERFORMANCE_PENALTY_POINTS
    )
    profile.acceptance_rate_points = max(
        0, (profile.acceptance_rate_points or 100) - ACCEPTANCE_RATE_PENALTY
    )


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
    if profile.cancellations_today_count >= DAILY_DRIVER_CANCEL_RISK_THRESHOLD:
        profile.account_risk_flag = True
        profile.account_under_review = True
        profile.account_risk_reason = RISK_WARNING_MESSAGE
        risk_triggered = True

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
        _notify_risk_warning(profile)

    return {
        "risk_triggered": risk_triggered,
        "cancellations_today": profile.cancellations_today_count,
        "performance_points": profile.performance_points,
        "acceptance_rate_points": profile.acceptance_rate_points,
    }


def _notify_risk_warning(profile: DriverProfile) -> None:
    try:
        from notifications.push import send_push_to_user

        send_push_to_user(
            profile.user,
            "Account at risk",
            RISK_WARNING_MESSAGE,
            data={"type": "driver_cancellation_risk"},
            app_type="driver",
        )
    except Exception:
        logger.exception(
            "Failed to send cancellation risk warning to driver %s",
            profile.user_id,
        )


def get_driver_performance_snapshot(profile: DriverProfile) -> dict:
    received = profile.total_rides_received or 0
    accepted = profile.total_rides_accepted or 0
    computed_rate = round((accepted / received) * 100, 1) if received else 0
    return {
        "performance_points": profile.performance_points or 100,
        "acceptance_rate": profile.acceptance_rate_points or 100,
        "acceptance_rate_computed": computed_rate,
        "total_rides_received": received,
        "total_rides_accepted": accepted,
        "total_rides_missed": profile.total_rides_missed or 0,
        "total_rides_declined": profile.total_rides_declined or 0,
        "total_rides_cancelled": profile.total_rides_cancelled or 0,
        "cancellations_today": profile.cancellations_today_count or 0,
        "account_risk_flag": profile.account_risk_flag,
        "account_under_review": profile.account_under_review,
        "account_risk_reason": profile.account_risk_reason or "",
        "cancellation_warning": (
            RISK_WARNING_MESSAGE
            if profile.account_risk_flag or profile.account_under_review
            else ""
        ),
    }
