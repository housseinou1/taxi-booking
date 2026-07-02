import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from referrals.models import (
    DriverBonus,
    FlaggedReferral,
    RideCredit,
    RiderReferral,
)
from referrals.services.reward_config_service import RewardConfigService

logger = logging.getLogger(__name__)

# Default daily credit threshold when no configuration is set
DEFAULT_DAILY_CREDIT_THRESHOLD = 10


class FraudDetectionService:
    """Service for analyzing referral activity and detecting suspicious patterns."""

    GHOST_ACCOUNT_INACTIVITY_HOURS = 48
    DEVICE_FRAUD_THRESHOLD = 3
    DEVICE_FRAUD_WINDOW_HOURS = 24

    def __init__(self):
        self.reward_config_service = RewardConfigService()

    @transaction.atomic
    def check_device_fraud(
        self, device_id: str, timestamp: datetime
    ) -> list[FlaggedReferral]:
        """Flag referrals when 3+ signups from same device in 24 hours.

        Finds all RiderReferral records with the given device_id created within
        24 hours of timestamp. If count >= 3, creates FlaggedReferral records
        for each with reason="device_abuse" and withholds any pending rewards.

        Args:
            device_id: The device identifier to check.
            timestamp: The reference timestamp to check around (24h window).

        Returns:
            List of FlaggedReferral objects created. Empty list if no fraud detected.
        """
        if not device_id:
            return []

        window_start = timestamp - timedelta(hours=self.DEVICE_FRAUD_WINDOW_HOURS)
        window_end = timestamp

        # Find all referrals from this device within the 24h window
        referrals = list(
            RiderReferral.objects.select_related("referral_code__rider", "referee")
            .filter(
                device_id=device_id,
                created_at__gte=window_start,
                created_at__lte=window_end,
            )
        )

        if len(referrals) < self.DEVICE_FRAUD_THRESHOLD:
            return []

        logger.warning(
            "Device fraud detected: %d signups from device %s within 24h window "
            "(threshold: %d). Timestamp: %s",
            len(referrals),
            device_id,
            self.DEVICE_FRAUD_THRESHOLD,
            timestamp,
        )

        flagged_referrals = []

        for referral in referrals:
            # Skip if already flagged for device_abuse
            if FlaggedReferral.objects.filter(
                rider_referral=referral, reason="device_abuse"
            ).exists():
                continue

            # Create a FlaggedReferral record
            flagged = FlaggedReferral.objects.create(
                rider_referral=referral,
                referrer=referral.referral_code.rider,
                referee=referral.referee,
                reason="device_abuse",
                status="pending",
            )
            flagged_referrals.append(flagged)

            # Update referral status to flagged
            referral.status = "flagged"
            referral.save(update_fields=["status"])

            # Withhold any pending credits for this referral
            withheld_count = RideCredit.objects.filter(
                referral=referral,
                status="active",
            ).update(status="withheld")

            if withheld_count > 0:
                logger.info(
                    "Withheld %d credits for referral %s (device_abuse)",
                    withheld_count,
                    referral.pk,
                )

        logger.info(
            "Created %d fraud flags for device %s",
            len(flagged_referrals),
            device_id,
        )

        return flagged_referrals

    def check_velocity_fraud(self, referrer) -> Optional[FlaggedReferral]:
        """Flag referrer when credits exceed configured daily threshold.

        Counts RideCredits issued to this referrer with credit_type="referrer"
        in the last 24 hours. If the count exceeds the daily threshold,
        creates a FlaggedReferral with reason="velocity_abuse", withholds
        pending rewards, and returns the FlaggedReferral.

        Args:
            referrer: The User instance to check for velocity fraud.

        Returns:
            FlaggedReferral if fraud detected, None otherwise.
        """
        # Determine the daily threshold from config or use default
        threshold = self._get_daily_threshold()

        # Count referrer credits issued in the last 24 hours
        twenty_four_hours_ago = timezone.now() - timedelta(hours=24)
        recent_credit_count = RideCredit.objects.filter(
            rider=referrer,
            credit_type="referrer",
            issued_at__gte=twenty_four_hours_ago,
        ).count()

        if recent_credit_count <= threshold:
            return None

        # Get the most recent referral for this referrer
        most_recent_referral = (
            RiderReferral.objects.filter(
                referral_code__rider=referrer,
            )
            .order_by("-created_at")
            .first()
        )

        if most_recent_referral is None:
            return None

        with transaction.atomic():
            # Create the FlaggedReferral
            flagged = FlaggedReferral.objects.create(
                rider_referral=most_recent_referral,
                referrer=referrer,
                referee=most_recent_referral.referee,
                reason="velocity_abuse",
                status="pending",
            )

            # Withhold pending rewards (active credits for this referrer)
            self._withhold_pending_rewards_for_referrer(referrer)

            logger.info(
                "Velocity fraud detected for referrer %s: %d credits in 24h "
                "(threshold: %d)",
                referrer.pk,
                recent_credit_count,
                threshold,
            )

        return flagged

    def _get_daily_threshold(self) -> int:
        """Get the daily credit threshold from config or use default.

        Uses the rider_credit_cap_count from the active RewardConfiguration
        if available, otherwise falls back to DEFAULT_DAILY_CREDIT_THRESHOLD.
        """
        try:
            config = self.reward_config_service.get_active_config()
            if config and hasattr(config, "rider_credit_cap_count"):
                return config.rider_credit_cap_count
        except Exception:
            logger.warning(
                "Failed to get reward config, using default threshold"
            )

        return DEFAULT_DAILY_CREDIT_THRESHOLD

    def _withhold_pending_rewards_for_referrer(self, referrer) -> int:
        """Withhold all active/pending credits for the referrer.

        Sets status to 'withheld' for all active credits belonging
        to the referrer with credit_type='referrer'.

        Returns:
            Number of credits withheld.
        """
        updated = RideCredit.objects.filter(
            rider=referrer,
            credit_type="referrer",
            status="active",
        ).update(status="withheld")

        if updated > 0:
            logger.info(
                "Withheld %d active credits for referrer %s",
                updated,
                referrer.pk,
            )

        return updated

    @transaction.atomic
    def check_ghost_account_fraud(self) -> list[FlaggedReferral]:
        """Flag referrals where the referee has no activity 48 hours after qualifying ride.

        Finds all RiderReferral records with status="completed" where completed_at
        is more than 48 hours ago. For each, checks if the referee has:
        - Any RideCredit usage (used_at set) after completed_at + 48h
        - Any additional ride completions (other completed referrals as referrer is
          not applicable here; instead we check for credit usage as a proxy)

        Only flags referrals not already flagged with reason="ghost_account".
        Creates FlaggedReferral with reason="ghost_account" and withholds pending rewards.

        Returns:
            List of newly created FlaggedReferral objects.
        """
        now = timezone.now()
        cutoff = now - timedelta(hours=self.GHOST_ACCOUNT_INACTIVITY_HOURS)

        # 1. Find completed referrals where completed_at is > 48 hours ago
        completed_referrals = RiderReferral.objects.select_related(
            "referral_code__rider", "referee"
        ).filter(
            status="completed",
            completed_at__lte=cutoff,
        )

        # 2. Exclude referrals already flagged with reason="ghost_account"
        already_flagged_referral_ids = FlaggedReferral.objects.filter(
            reason="ghost_account",
            rider_referral__isnull=False,
        ).values_list("rider_referral_id", flat=True)

        completed_referrals = completed_referrals.exclude(
            pk__in=already_flagged_referral_ids
        )

        newly_flagged = []

        for referral in completed_referrals:
            referee = referral.referee
            activity_check_start = referral.completed_at + timedelta(
                hours=self.GHOST_ACCOUNT_INACTIVITY_HOURS
            )

            # 3. Check if referee has any activity after completed_at + 48h
            has_activity = self._referee_has_activity(
                referee, activity_check_start
            )

            if not has_activity:
                # 4. Create FlaggedReferral with reason="ghost_account"
                referrer = referral.referral_code.rider
                flagged = FlaggedReferral.objects.create(
                    rider_referral=referral,
                    referrer=referrer,
                    referee=referee,
                    reason="ghost_account",
                    status="pending",
                )

                # 5. Withhold any pending rewards (active credits for this referral)
                self._withhold_pending_rewards(referral)

                newly_flagged.append(flagged)

                logger.info(
                    "Ghost account fraud detected: referral %s, "
                    "referee %s has no activity since %s",
                    referral.pk,
                    referee.pk,
                    activity_check_start,
                )

        return newly_flagged

    def _referee_has_activity(self, referee, after_datetime) -> bool:
        """Check if the referee has any activity after the given datetime.

        Activity is defined as:
        - Any RideCredit with used_at after the given datetime (credit usage)
        - Any RiderReferral as a referrer where completed_at is after the
          given datetime (indicating they referred someone who completed a ride,
          which implies continued engagement)

        Args:
            referee: The referee user to check.
            after_datetime: The datetime after which activity should be checked.

        Returns:
            True if referee has activity, False otherwise.
        """
        # Check for any credit usage by the referee after the given datetime
        has_credit_usage = RideCredit.objects.filter(
            rider=referee,
            used_at__isnull=False,
            used_at__gt=after_datetime,
        ).exists()

        if has_credit_usage:
            return True

        # Check for any additional completed referrals where referee is a referrer
        # (This means they were active enough to refer others and have those complete)
        from referrals.models import RiderReferralCode

        has_referral_activity = RiderReferral.objects.filter(
            referral_code__rider=referee,
            status="completed",
            completed_at__gt=after_datetime,
        ).exists()

        return has_referral_activity

    STALE_FLAG_DAYS = 30

    @transaction.atomic
    def escalate_stale_flags(self) -> int:
        """Escalate flagged referrals with no admin action after 30 days.

        Finds all FlaggedReferral records where status="pending" and flagged_at
        is more than 30 days ago. Sets status="escalated" and escalated_at=now.
        Sends a notification to administrators indicating the number of
        referrals awaiting review.

        Returns:
            Count of escalated flags.
        """
        now = timezone.now()
        cutoff = now - timedelta(days=self.STALE_FLAG_DAYS)

        stale_flags = FlaggedReferral.objects.filter(
            status="pending",
            flagged_at__lte=cutoff,
        )

        count = stale_flags.update(
            status="escalated",
            escalated_at=now,
        )

        if count > 0:
            self._send_admin_escalation_notification(count)

        return count

    def _send_admin_escalation_notification(self, count: int) -> None:
        """Send notification to administrators about escalated referrals.

        Sends push notifications to all staff users (admins with access
        to the Referral Admin Dashboard) indicating the number of referrals
        that have been escalated and are awaiting review.

        Args:
            count: The number of referrals that were escalated.
        """
        from django.contrib.auth import get_user_model
        from notifications.services import send_push_notification

        logger.warning(
            "[ADMIN NOTIFICATION] %d flagged referral(s) escalated after "
            "%d days without admin action. %d referral(s) awaiting review.",
            count,
            self.STALE_FLAG_DAYS,
            count,
        )

        User = get_user_model()
        admin_users = User.objects.filter(is_staff=True, is_active=True)

        title = "Referral Fraud Escalation"
        body = (
            f"{count} flagged referral(s) have been escalated after "
            f"{self.STALE_FLAG_DAYS} days without admin action. "
            f"Please review the pending referrals."
        )

        for admin in admin_users:
            send_push_notification(
                admin,
                title,
                body,
                {"type": "fraud_escalation", "count": count},
            )

    def _withhold_pending_rewards(self, referral: RiderReferral) -> int:
        """Withhold any active/pending credits associated with a referral.

        Sets active credits to "withheld" status with remaining_amount = 0.

        Args:
            referral: The RiderReferral whose credits should be withheld.

        Returns:
            The count of credits that were withheld.
        """
        now = timezone.now()
        withheld_count = RideCredit.objects.filter(
            referral=referral,
            status="active",
        ).update(
            status="withheld",
            remaining_amount=Decimal("0.00"),
        )

        if withheld_count:
            logger.info(
                "Withheld %d credits for referral %s due to ghost account fraud.",
                withheld_count,
                referral.pk,
            )

        return withheld_count

    @transaction.atomic
    def approve_referral(self, flagged_id: int, admin) -> None:
        """Approve a flagged referral and release withheld rewards.

        Releases withheld RideCredits (sets status back to "active" and restores
        remaining_amount to original_amount). For driver referral flags, also
        releases withheld DriverBonus records.

        Args:
            flagged_id: The primary key of the FlaggedReferral to approve.
            admin: The admin User performing the approval.

        Raises:
            FlaggedReferral.DoesNotExist: If no FlaggedReferral with given id exists.
            ValueError: If the flagged referral is not in "pending" or "escalated" status.
        """
        flagged = FlaggedReferral.objects.select_for_update().get(pk=flagged_id)

        if flagged.status not in ("pending", "escalated"):
            raise ValueError(
                f"Cannot approve flagged referral with status '{flagged.status}'. "
                "Only 'pending' or 'escalated' flags can be approved."
            )

        now = timezone.now()
        flagged.status = "approved"
        flagged.resolved_at = now
        flagged.resolved_by = admin
        flagged.save(update_fields=["status", "resolved_at", "resolved_by"])

        # Release withheld RideCredits linked to the rider referral
        if flagged.rider_referral is not None:
            withheld_credits = list(
                RideCredit.objects.filter(
                    referral=flagged.rider_referral,
                    status="withheld",
                )
            )
            for credit in withheld_credits:
                credit.status = "active"
                credit.remaining_amount = credit.original_amount
                credit.save(update_fields=["status", "remaining_amount"])

            if withheld_credits:
                logger.info(
                    "Released %d withheld credits for approved flagged referral %s",
                    len(withheld_credits),
                    flagged_id,
                )

            # Restore the referral status from flagged back to pending
            if flagged.rider_referral.status == "flagged":
                flagged.rider_referral.status = "pending"
                flagged.rider_referral.save(update_fields=["status"])

        # Release withheld DriverBonus records linked to the driver referral
        if flagged.driver_referral is not None:
            released_bonuses = DriverBonus.objects.filter(
                referral=flagged.driver_referral,
                status="withheld",
            ).update(
                status="released",
                released_at=now,
            )
            if released_bonuses > 0:
                logger.info(
                    "Released %d withheld bonuses for approved flagged referral %s",
                    released_bonuses,
                    flagged_id,
                )

        logger.info(
            "Flagged referral %s approved by admin %s",
            flagged_id,
            admin.pk,
        )

    @transaction.atomic
    def reject_referral(self, flagged_id: int, admin) -> None:
        """Reject a flagged referral and revoke/deduct rewards.

        Revokes pending/withheld credits (sets status="revoked", remaining_amount=0).
        If credits were already disbursed (status was "active" or "used"), deducts
        from the referrer's balance by revoking those credits as well.
        For driver referral flags, also revokes any associated DriverBonus.

        Args:
            flagged_id: The primary key of the FlaggedReferral to reject.
            admin: The admin User performing the rejection.

        Raises:
            FlaggedReferral.DoesNotExist: If no FlaggedReferral with given id exists.
            ValueError: If the flagged referral is not in "pending" or "escalated" status.
        """
        flagged = FlaggedReferral.objects.select_for_update().get(pk=flagged_id)

        if flagged.status not in ("pending", "escalated"):
            raise ValueError(
                f"Cannot reject flagged referral with status '{flagged.status}'. "
                "Only 'pending' or 'escalated' flags can be rejected."
            )

        now = timezone.now()
        flagged.status = "rejected"
        flagged.resolved_at = now
        flagged.resolved_by = admin
        flagged.save(update_fields=["status", "resolved_at", "resolved_by"])

        # Revoke all credits linked to the rider referral regardless of current status
        if flagged.rider_referral is not None:
            credits_to_revoke = RideCredit.objects.filter(
                referral=flagged.rider_referral,
                status__in=["active", "withheld", "used"],
            )
            revoked_count = credits_to_revoke.update(
                status="revoked",
                remaining_amount=Decimal("0.00"),
                revoked_at=now,
            )
            if revoked_count > 0:
                logger.info(
                    "Revoked %d credits for rejected flagged referral %s",
                    revoked_count,
                    flagged_id,
                )

            # Mark the referral itself as revoked
            flagged.rider_referral.status = "revoked"
            flagged.rider_referral.save(update_fields=["status"])

        # Revoke DriverBonus records linked to the driver referral
        if flagged.driver_referral is not None:
            revoked_bonuses = DriverBonus.objects.filter(
                referral=flagged.driver_referral,
                status__in=["issued", "withheld", "released"],
            ).update(
                status="revoked",
                revoked_at=now,
            )
            if revoked_bonuses > 0:
                logger.info(
                    "Revoked %d bonuses for rejected flagged referral %s",
                    revoked_bonuses,
                    flagged_id,
                )

        logger.info(
            "Flagged referral %s rejected by admin %s",
            flagged_id,
            admin.pk,
        )
