"""Ride-based incentive progress tracking (Phase 30)."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

RIDE_CAMPAIGN_TYPES = {
    "daily_trip_target",
    "weekly_trip_target",
    "peak_hour_bonus",
    "peak_hours",
    "weekend_bonus",
    "airport_bonus",
    "new_driver_bonus",
    "referral_bonus",
    "consecutive_trips_bonus",
    "ride_count",
    "first_ride_bonus",
    "city_bonus",
    "intercity",
    "seasonal",
    "holiday",
}


def _driver_wants_promotions(driver):
    profile = getattr(driver, "driver_profile", None)
    if not profile:
        return True
    settings_obj = getattr(profile, "settings", None)
    if settings_obj is None:
        from taxi.drivers.models import DriverSettings

        settings_obj = DriverSettings.objects.filter(driver=profile).first()
    if not settings_obj:
        return True
    return bool(settings_obj.notifications_promotions)


def _is_eligible(driver, program) -> bool:
    groups = program.eligible_groups or []
    if not groups or "all" in groups:
        return True

    profile = getattr(driver, "driver_profile", None)
    user_groups = set(driver.groups.values_list("name", flat=True))

    if "new_drivers" in groups and profile and (profile.total_rides_completed or 0) <= 20:
        return True
    if "approved_drivers" in groups and profile and profile.status == "approved":
        return True
    if program.city_id and driver.city_id == program.city_id:
        return True
    for group in groups:
        if group.startswith("city:"):
            try:
                city_id = int(group.split(":", 1)[1])
                if driver.city_id == city_id:
                    return True
            except (TypeError, ValueError):
                pass
        elif group in user_groups:
            return True
    return False


def _qualifies_for_ride(program, ride, driver) -> bool:
    from taxi.drivers.services.rewards_service import RewardsService

    rewards = RewardsService()
    completed_at = ride.completed_at or timezone.now()
    local = timezone.localtime(completed_at)
    ctype = program.incentive_type

    if program.city_id and ride.city_id and program.city_id != ride.city_id:
        return False

    if ctype in {"daily_trip_target", "first_ride_bonus"}:
        return True
    if ctype in {"weekly_trip_target", "ride_count", "new_driver_bonus", "referral_bonus", "consecutive_trips_bonus"}:
        return True
    if ctype in {"peak_hour_bonus", "peak_hours"}:
        return rewards._is_peak_hour(completed_at)
    if ctype == "weekend_bonus":
        return local.weekday() >= 5
    if ctype == "airport_bonus":
        return rewards._is_airport_ride(ride)
    if ctype == "city_bonus":
        return program.city_id is None or ride.city_id == program.city_id
    if ctype == "intercity":
        return bool(getattr(ride, "is_intercity", False) or ride.ride_type == "Intercity")
    return True


def _period_start(ctype):
    now = timezone.localtime(timezone.now())
    if ctype == "daily_trip_target" or ctype == "first_ride_bonus":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if ctype in {"weekly_trip_target", "ride_count", "peak_hour_bonus", "peak_hours", "weekend_bonus", "airport_bonus"}:
        return (now - timezone.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def _sync_period_value(driver, program, progress):
    """Reset counters when campaign period rolls over."""
    from taxi.rides.models import Ride

    period_start = _period_start(program.incentive_type)
    if not period_start:
        return

    count = Ride.objects.filter(
        driver=driver,
        status="completed",
        completed_at__gte=period_start,
    ).count()
    if program.incentive_type == "first_ride_bonus":
        progress.current_value = min(1, count)
    elif program.incentive_type in {"daily_trip_target"}:
        progress.current_value = count
    elif program.incentive_type in {"weekly_trip_target", "ride_count"}:
        progress.current_value = count


def calculate_bonus_amount(program, progress, ride=None) -> Decimal:
    if program.reward_type == "per_trip":
        return Decimal(program.bonus_amount)
    if program.reward_type == "percentage":
        base = progress.qualifying_earnings or Decimal("0")
        return (base * Decimal(program.bonus_amount) / Decimal("100")).quantize(Decimal("0.01"))
    return Decimal(program.bonus_amount)


def estimate_bonus(program, progress) -> Decimal:
    if progress.status in {"completed", "paid"}:
        return progress.bonus_earned or Decimal("0")
    if program.reward_type == "per_trip":
        remaining = max(0, program.target_value - progress.current_value)
        return Decimal(program.bonus_amount) * remaining
    if program.reward_type == "percentage":
        projected = progress.qualifying_earnings or Decimal("0")
        if progress.current_value < program.target_value:
            ratio = Decimal(progress.current_value or 1) / Decimal(max(program.target_value, 1))
            projected = (projected / ratio) if ratio else projected
        return (projected * Decimal(program.bonus_amount) / Decimal("100")).quantize(Decimal("0.01"))
    if progress.current_value >= program.target_value:
        return Decimal(program.bonus_amount)
    return Decimal(program.bonus_amount)


def _create_pending_bonus(driver, program, progress, amount: Decimal):
    from incentives.models import BonusPayment

    if amount <= 0:
        return None
    payment, created = BonusPayment.objects.get_or_create(
        driver=driver,
        program=program,
        progress=progress,
        payout_status="pending",
        defaults={
            "amount": amount,
            "reason": f"Campaign: {program.name}",
        },
    )
    if not created and payment.amount != amount:
        payment.amount = amount
        payment.save(update_fields=["amount"])
    progress.pending_bonus = amount
    progress.bonus_earned = amount
    progress.save(update_fields=["pending_bonus", "bonus_earned"])
    return payment


def _notify_completion(driver, program, amount: Decimal):
    if not _driver_wants_promotions(driver):
        return
    try:
        from notifications.push import notify_courier_bonus

        notify_courier_bonus(
            driver,
            amount,
            f"You completed {program.name}! Bonus pending finance approval.",
            program_id=program.id,
        )
    except Exception:
        logger.exception("Incentive completion push failed driver=%s", driver.id)


@transaction.atomic
def track_ride_completion(driver, ride) -> list[dict]:
    """Increment incentive progress for a completed taxi ride."""
    if not driver or not ride:
        return []

    from incentives.models import DriverIncentiveProgress, IncentiveProgram
    from features.models import DriverReferral

    programs = IncentiveProgram.objects.filter(
        status="active",
        incentive_type__in=RIDE_CAMPAIGN_TYPES,
    )
    results = []

    for program in programs:
        if not program.is_currently_active:
            continue
        if not _is_eligible(driver, program):
            continue
        if not _qualifies_for_ride(program, ride, driver):
            continue

        progress, _ = DriverIncentiveProgress.objects.select_for_update().get_or_create(
            driver=driver,
            program=program,
            defaults={"status": "in_progress"},
        )
        if progress.status != "in_progress":
            continue

        if program.incentive_type == "new_driver_bonus":
            profile = getattr(driver, "driver_profile", None)
            if profile and (profile.total_rides_completed or 0) > program.target_value:
                continue

        if program.incentive_type == "referral_bonus":
            if not DriverReferral.objects.filter(referred_driver=driver).exists():
                continue

        if program.incentive_type in {"daily_trip_target", "weekly_trip_target", "ride_count", "first_ride_bonus"}:
            _sync_period_value(driver, program, progress)
        else:
            progress.current_value += 1

        earning = Decimal(str(ride.driver_earning or ride.fare or 0))
        progress.qualifying_earnings = (progress.qualifying_earnings or Decimal("0")) + earning

        completed = progress.current_value >= program.target_value and program.target_value > 0
        if program.reward_type == "per_trip":
            trip_bonus = Decimal(program.bonus_amount)
            progress.pending_bonus = (progress.pending_bonus or Decimal("0")) + trip_bonus
            progress.bonus_earned = progress.pending_bonus
            if completed:
                progress.status = "completed"
                progress.completed_at = timezone.now()
                _create_pending_bonus(driver, program, progress, progress.pending_bonus)
                _notify_completion(driver, program, progress.pending_bonus)
        elif completed:
            bonus = calculate_bonus_amount(program, progress, ride)
            progress.status = "completed"
            progress.completed_at = timezone.now()
            progress.bonus_earned = bonus
            progress.pending_bonus = bonus
            _create_pending_bonus(driver, program, progress, bonus)
            _notify_completion(driver, program, bonus)

        progress.save()
        results.append(
            {
                "program_id": program.id,
                "program_name": program.name,
                "current_value": progress.current_value,
                "target_value": program.target_value,
                "completed": completed,
            }
        )

    return results


def serialize_campaign_progress(progress) -> dict:
    program = progress.program
    estimated = estimate_bonus(program, progress)
    return {
        "id": progress.id,
        "program_id": program.id,
        "name": program.name,
        "description": program.description,
        "campaign_type": program.incentive_type,
        "reward_type": program.reward_type,
        "status": progress.status,
        "current_value": progress.current_value,
        "target_value": program.target_value,
        "trips_completed": progress.current_value,
        "trips_remaining": progress.trips_remaining,
        "progress_percent": progress.progress_percent,
        "estimated_bonus": float(estimated),
        "earned_bonus": float(progress.bonus_earned or 0),
        "pending_bonus": float(progress.pending_bonus or 0),
        "paid_bonus": float(progress.bonus_earned or 0) if progress.status == "paid" else 0,
        "bonus_amount": float(program.bonus_amount),
        "expires_at": program.ends_at.isoformat() if program.ends_at else None,
        "ends_at": program.ends_at,
    }
