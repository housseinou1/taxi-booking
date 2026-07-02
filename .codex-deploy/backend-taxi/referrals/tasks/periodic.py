"""Celery periodic tasks for the referrals app.

All tasks are idempotent — safe to retry or run multiple times without
producing duplicate side effects. They delegate to the service layer
which handles the actual business logic.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="referrals.tasks.periodic.expire_credits_task")
def expire_credits_task() -> int:
    """Expire ride credits that have passed their expiration date.

    Runs hourly. Marks expired credits with remaining_amount=0 and
    status="expired". Idempotent: already-expired credits are not
    reprocessed.

    Returns:
        The number of credits expired in this run.
    """
    from referrals.services.credit_expiration_service import CreditExpirationService

    service = CreditExpirationService()
    count = service.expire_credits()
    logger.info("expire_credits_task completed: %d credit(s) expired.", count)
    return count


@shared_task(name="referrals.tasks.periodic.send_expiration_reminders_task")
def send_expiration_reminders_task() -> int:
    """Send reminder notifications for credits expiring within 7 days.

    Runs daily. Only sends one reminder per credit (tracked via
    reminder_sent flag). Idempotent: credits that already have
    reminder_sent=True are skipped.

    Returns:
        The number of reminders sent in this run.
    """
    from referrals.services.credit_expiration_service import CreditExpirationService

    service = CreditExpirationService()
    count = service.send_expiration_reminders()
    logger.info(
        "send_expiration_reminders_task completed: %d reminder(s) sent.", count
    )
    return count


@shared_task(name="referrals.tasks.periodic.fraud_scan_ghost_accounts_task")
def fraud_scan_ghost_accounts_task() -> int:
    """Scan for ghost account fraud patterns.

    Runs every 6 hours. Flags referrals where the referee has no
    activity 48 hours after their qualifying ride. Idempotent:
    referrals already flagged with reason="ghost_account" are skipped.

    Returns:
        The number of referrals newly flagged in this run.
    """
    from referrals.services.fraud_detection_service import FraudDetectionService

    service = FraudDetectionService()
    flagged = service.check_ghost_account_fraud()
    count = len(flagged)
    logger.info(
        "fraud_scan_ghost_accounts_task completed: %d referral(s) flagged.", count
    )
    return count


@shared_task(name="referrals.tasks.periodic.expire_stale_referrals_task")
def expire_stale_referrals_task() -> int:
    """Expire driver referrals with 90 days of inactivity.

    Runs daily. Marks pending driver referrals as expired when the
    referred driver has had no ride completions for 90+ consecutive
    days and has not yet met the ride threshold. Idempotent: already-
    expired referrals are not reprocessed (only status="pending" are
    considered).

    Returns:
        The number of referrals expired in this run.
    """
    from referrals.services.driver_referral_service import DriverReferralService

    service = DriverReferralService()
    count = service.expire_stale_referrals()
    logger.info(
        "expire_stale_referrals_task completed: %d referral(s) expired.", count
    )
    return count


@shared_task(name="referrals.tasks.periodic.escalate_stale_flags_task")
def escalate_stale_flags_task() -> int:
    """Escalate fraud flags that have been pending for 30+ days.

    Runs daily. Changes status from "pending" to "escalated" for
    FlaggedReferral records with no admin action after 30 calendar
    days. Idempotent: only "pending" flags are considered, so flags
    already escalated/approved/rejected are unaffected.

    Returns:
        The number of flags escalated in this run.
    """
    from referrals.services.fraud_detection_service import FraudDetectionService

    service = FraudDetectionService()
    count = service.escalate_stale_flags()
    logger.info(
        "escalate_stale_flags_task completed: %d flag(s) escalated.", count
    )
    return count
