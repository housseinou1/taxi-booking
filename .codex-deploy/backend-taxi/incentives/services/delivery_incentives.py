"""Track courier progress on delivery incentive programs."""

import logging
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

logger = logging.getLogger(__name__)


def track_delivery_completion(courier):
    """Increment delivery-based incentive progress and notify on completion."""
    if not courier:
        return

    from deliveries.models import Delivery
    from incentives.models import DriverIncentiveProgress, IncentiveProgram

    programs = IncentiveProgram.objects.filter(
        status="active",
        incentive_type__in=["delivery_count", "weekly_target", "rating"],
    )
    for program in programs:
        if not program.is_currently_active:
            continue

        progress, _ = DriverIncentiveProgress.objects.get_or_create(
            driver=courier,
            program=program,
            defaults={"status": "in_progress"},
        )
        if progress.status != "in_progress":
            continue

        if program.incentive_type == "delivery_count":
            progress.current_value += 1
        elif program.incentive_type == "weekly_target":
            week_start = timezone.now() - timezone.timedelta(days=7)
            total = (
                Delivery.objects.filter(
                    driver=courier,
                    status="delivered",
                    delivered_at__gte=week_start,
                ).aggregate(total=Sum("driver_earning"))["total"]
                or 0
            )
            progress.current_value = int(total)
        elif program.incentive_type == "rating":
            settings_obj = getattr(courier, "delivery_settings", None)
            if settings_obj:
                progress.current_value = int(float(settings_obj.delivery_rating) * 10)

        if progress.current_value >= program.target_value:
            progress.status = "completed"
            progress.completed_at = timezone.now()
            progress.bonus_earned = program.bonus_amount
            progress.save()
            _notify_bonus_earned(courier, program)
        else:
            progress.save(update_fields=["current_value"])


def _notify_bonus_earned(courier, program):
    if not _courier_wants_promotions(courier):
        return

    try:
        from notifications.push import notify_courier_bonus

        notify_courier_bonus(
            courier,
            program.bonus_amount,
            f"You completed {program.name}!",
            program_id=program.id,
        )
    except Exception:
        logger.exception("Bonus push failed for courier %s", courier.id)

    from incentives.models import BonusPayment

    BonusPayment.objects.get_or_create(
        driver=courier,
        program=program,
        defaults={
            "amount": Decimal(program.bonus_amount),
            "reason": f"Auto: {program.name}",
        },
    )


def _courier_wants_promotions(courier):
    profile = getattr(courier, "driver_profile", None)
    if not profile:
        return True
    settings_obj = getattr(profile, "settings", None)
    if settings_obj is None:
        from taxi.drivers.models import DriverSettings

        settings_obj = DriverSettings.objects.filter(driver=profile).first()
    if not settings_obj:
        return True
    return bool(settings_obj.notifications_promotions)
