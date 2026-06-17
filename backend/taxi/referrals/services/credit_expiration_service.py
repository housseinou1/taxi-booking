import logging
from datetime import timedelta

from django.db.models import QuerySet
from django.utils import timezone

from notifications.services import send_push_notification
from referrals.models import RideCredit

logger = logging.getLogger(__name__)


class CreditExpirationService:
    """Handles time-based credit lifecycle: expiration and reminders."""

    REMINDER_DAYS_BEFORE_EXPIRY = 7

    # Ride statuses that indicate a ride is active and credits should be honored
    ACTIVE_RIDE_STATUSES = ("in_progress", "scheduled")

    def expire_credits(self) -> int:
        """Mark expired credits and set remaining value to zero.

        Finds all RideCredit records with status="active" whose expires_at
        is in the past. Excludes credits belonging to riders who currently
        have rides that are in-progress or scheduled, since those credits
        must be honored for the active ride (Requirement 11.4).

        For matching credits, sets status="expired" and remaining_amount=0.

        Credits that have already been partially or fully consumed
        (remaining_amount == 0 with status="used") are unaffected.

        This method is idempotent: calling it multiple times produces
        the same result — already-expired credits are not processed again.

        Returns:
            The number of credits that were expired in this invocation.
        """
        from taxi.rides.models.ride import Ride

        now = timezone.now()

        # Find riders who currently have in-progress or scheduled rides.
        # Credits for these riders should be honored until the ride completes.
        riders_with_active_rides = Ride.objects.filter(
            status__in=self.ACTIVE_RIDE_STATUSES,
        ).values_list("rider_id", flat=True)

        # Query expired credits, excluding those belonging to riders with active rides
        expired_credits: QuerySet = RideCredit.objects.filter(
            status="active",
            expires_at__lte=now,
        ).exclude(
            rider_id__in=riders_with_active_rides,
        )

        count = expired_credits.update(
            status="expired",
            remaining_amount=0,
        )

        if count > 0:
            logger.info(
                "Expired %d credit(s) that passed their expiration date.", count
            )

        return count

    def send_expiration_reminders(self) -> int:
        """Send reminders for credits expiring within the next 7 days.

        Finds all RideCredit records where:
        - status is "active"
        - reminder_sent is False
        - expires_at is within the next 7 days (now <= expires_at <= now + 7 days)

        For each matching credit, logs a notification placeholder and sets
        reminder_sent=True to prevent duplicate notifications.

        Returns:
            The count of reminders sent.
        """
        now = timezone.now()
        reminder_window_end = now + timedelta(days=self.REMINDER_DAYS_BEFORE_EXPIRY)

        # Find credits expiring within the next 7 days that haven't been reminded
        credits_to_remind = RideCredit.objects.filter(
            status="active",
            reminder_sent=False,
            expires_at__gte=now,
            expires_at__lte=reminder_window_end,
        )

        count = 0
        for credit in credits_to_remind:
            self._send_reminder_notification(credit)
            credit.reminder_sent = True
            credit.save(update_fields=["reminder_sent"])
            count += 1

        if count > 0:
            logger.info(
                "Sent %d expiration reminder(s) for credits expiring within %d days.",
                count,
                self.REMINDER_DAYS_BEFORE_EXPIRY,
            )

        return count

    def is_credit_usable(self, credit: RideCredit) -> bool:
        """Check if a credit is usable (not expired and has remaining value).

        A credit is usable when:
        - Its status is "active"
        - Its expires_at is in the future
        - Its remaining_amount is greater than zero

        Expired, revoked, used, or withheld credits are not usable.
        Credits past their expiration date are not usable even if their
        status has not yet been updated by the periodic expiration task.

        Args:
            credit: The RideCredit instance to check.

        Returns:
            True if the credit can be applied to a ride, False otherwise.
        """
        if credit.status != "active":
            return False
        if credit.expires_at <= timezone.now():
            return False
        if credit.remaining_amount <= 0:
            return False
        return True

    def _send_reminder_notification(self, credit: RideCredit) -> None:
        """Send an expiration reminder notification for a credit.

        Sends a push notification to the rider indicating the credit amount
        and expiration date, using the project's notification service.

        Args:
            credit: The RideCredit about to expire.
        """
        expiry_date = credit.expires_at.strftime("%B %d, %Y")
        send_push_notification(
            credit.rider,
            "Ride credit expiring soon",
            f"Your ride credit of {credit.remaining_amount:.2f} MRU expires on "
            f"{expiry_date}. Use it before it's gone!",
            {
                "type": "credit_expiration_reminder",
                "credit_id": credit.id,
                "remaining_amount": str(credit.remaining_amount),
                "expires_at": credit.expires_at.isoformat(),
            },
        )
        logger.info(
            "Expiration reminder sent to rider %s: Credit of %.2f "
            "(remaining: %.2f) expires at %s.",
            credit.rider_id,
            credit.original_amount,
            credit.remaining_amount,
            credit.expires_at.isoformat(),
        )
