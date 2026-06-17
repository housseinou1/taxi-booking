"""
Signal handlers for the referrals app.

Connects to:
- User post_save: auto-generates rider referral code on account creation
- User post_save: releases pending driver bonuses on account reinstatement
- DriverProfile post_save: generates driver referral code on approval
- Ride post_save: processes first-ride credits on completion, revokes credits on cancellation
- Ride post_save: increments driver ride count and checks bonus on completion
"""

import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def generate_rider_referral_code_on_signup(sender, instance, created, **kwargs):
    """Auto-generate a referral code for new rider accounts.

    Only triggers for newly created users with user_type == "rider".
    Wrapped in try/except so signal failures never break user creation.
    """
    if not created:
        return

    # Only generate codes for riders
    if getattr(instance, "user_type", None) != "rider":
        return

    try:
        from referrals.services.rider_referral_service import RiderReferralService

        service = RiderReferralService()
        code = service.generate_referral_code(instance)
        logger.info(
            "Referral code '%s' generated for new rider (user_id=%s)",
            code,
            instance.pk,
        )
    except Exception:
        logger.exception(
            "Failed to generate referral code for new rider (user_id=%s). "
            "User creation will proceed without a referral code.",
            instance.pk,
        )


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def release_driver_pending_bonuses_on_reinstatement(sender, instance, created, **kwargs):
    """Release withheld driver bonuses when a driver account is reinstated.

    Triggers when an existing driver user is saved with is_active=True.
    Since Django post_save doesn't easily track old field values, we simply
    check if the user is now active and is a driver. The service method is
    a no-op if there are no withheld bonuses.

    Wrapped in try/except so signal failures never break user save operations.
    """
    if created:
        return

    # Only process for active drivers
    if not instance.is_active:
        return

    if getattr(instance, "user_type", None) != "driver":
        return

    try:
        from referrals.services.driver_referral_service import DriverReferralService

        service = DriverReferralService()
        released_count = service.release_pending_bonuses(instance)
        if released_count > 0:
            logger.info(
                "Released %d pending bonus(es) for reinstated driver (user_id=%s)",
                released_count,
                instance.pk,
            )
    except Exception:
        logger.exception(
            "Failed to release pending bonuses for driver (user_id=%s). "
            "User save will proceed normally.",
            instance.pk,
        )


@receiver(post_save, sender="drivers.DriverProfile")
def generate_driver_referral_code_on_approval(sender, instance, created, **kwargs):
    """Auto-generate a driver referral code when a DriverProfile is approved.

    Triggers when a DriverProfile is saved with status="approved". This covers
    both initial approval and re-approval scenarios. The code generation is
    idempotent — if the driver already has a code, it simply returns the
    existing one.

    Wrapped in try/except so signal failures never break driver approval.
    """
    if instance.status != "approved":
        return

    try:
        from referrals.services.driver_referral_service import DriverReferralService

        driver_user = instance.user
        service = DriverReferralService()
        code = service.generate_referral_code(driver_user)
        logger.info(
            "Driver referral code '%s' generated for approved driver (user_id=%s)",
            code,
            driver_user.pk,
        )
    except Exception:
        logger.exception(
            "Failed to generate driver referral code on approval (profile_id=%s). "
            "Driver approval will proceed normally.",
            instance.pk,
        )


def _get_ride_model():
    """Lazily import the Ride model to avoid circular imports."""
    from django.apps import apps

    return apps.get_model("rides", "Ride")


@receiver(post_save, sender="rides.Ride")
def handle_ride_completed(sender, instance, **kwargs):
    """Process first-ride referral credits when a ride status becomes 'completed'.

    Only acts on status transitions to 'completed'. Wrapped in try/except
    so signal failures never break ride operations.
    """
    if instance.status != "completed":
        return

    # Process rider referral credit
    try:
        from referrals.services.rider_referral_service import RiderReferralService

        service = RiderReferralService()
        result = service.process_first_ride_credit(instance)
        if result.success:
            logger.info(
                "Referral credit issued for completed ride (ride_id=%s, rider_id=%s)",
                instance.pk,
                instance.rider_id,
            )
        elif result.reason:
            logger.debug(
                "Referral credit not issued for ride (ride_id=%s): %s",
                instance.pk,
                result.reason,
            )
    except Exception:
        logger.exception(
            "Failed to process referral credit for completed ride (ride_id=%s). "
            "Ride completion will proceed normally.",
            instance.pk,
        )

    # Process driver referral ride count increment and bonus check
    try:
        from referrals.services.driver_referral_service import DriverReferralService

        driver = instance.driver
        if driver is not None:
            service = DriverReferralService()
            referral = service.increment_ride_count(driver)
            if referral is not None:
                logger.info(
                    "Driver referral ride count incremented for driver (user_id=%s, "
                    "completed_rides=%d/%d)",
                    driver.pk,
                    referral.completed_rides,
                    referral.ride_threshold,
                )
                # Check if bonus should be issued after increment
                if referral.completed_rides >= referral.ride_threshold:
                    bonus_result = service.check_and_issue_bonus(referral)
                    if bonus_result.success:
                        if bonus_result.withheld:
                            logger.info(
                                "Driver bonus withheld for referral (referral_id=%s): %s",
                                referral.pk,
                                bonus_result.reason,
                            )
                        else:
                            logger.info(
                                "Driver bonus issued for referral (referral_id=%s, "
                                "driver_id=%s)",
                                referral.pk,
                                driver.pk,
                            )
    except Exception:
        logger.exception(
            "Failed to process driver referral ride count for completed ride "
            "(ride_id=%s). Ride completion will proceed normally.",
            instance.pk,
        )


@receiver(post_save, sender="rides.Ride")
def handle_ride_cancelled(sender, instance, **kwargs):
    """Revoke referral credits when a ride status becomes 'cancelled'.

    Only acts on status transitions to 'cancelled'. Wrapped in try/except
    so signal failures never break ride operations.
    """
    if instance.status != "cancelled":
        return

    try:
        from referrals.services.rider_referral_service import RiderReferralService

        service = RiderReferralService()
        revoked_count = service.revoke_credits_for_ride(instance)
        if revoked_count > 0:
            logger.info(
                "Revoked %d referral credit(s) for cancelled ride (ride_id=%s, rider_id=%s)",
                revoked_count,
                instance.pk,
                instance.rider_id,
            )
        else:
            logger.debug(
                "No referral credits to revoke for cancelled ride (ride_id=%s)",
                instance.pk,
            )
    except Exception:
        logger.exception(
            "Failed to revoke referral credits for cancelled ride (ride_id=%s). "
            "Ride cancellation will proceed normally.",
            instance.pk,
        )
