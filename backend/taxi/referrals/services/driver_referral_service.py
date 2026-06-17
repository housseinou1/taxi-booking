import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from django.db import IntegrityError, transaction
from django.db import models
from django.db.models import Q
from django.utils import timezone

from referrals.models import DriverBonus, DriverReferral, DriverReferralCode
from referrals.services.reward_config_service import RewardConfigService

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of referral code validation."""

    is_valid: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    referral_code_obj: Optional[DriverReferralCode] = None


@dataclass
class BonusIssuanceResult:
    """Result of a bonus issuance attempt."""

    success: bool
    bonus: Optional[DriverBonus] = None
    withheld: bool = False
    reason: Optional[str] = None


@dataclass
class DriverReferralStatus:
    """Status of a single driver referral for the referrer's dashboard."""

    referee_name: str
    completed_rides: int
    ride_threshold: int
    status: str


class DriverReferralService:
    """Service handling driver-to-driver referral logic."""

    MAX_CODE_ATTEMPTS = 5
    CODE_LENGTH = 8
    CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    CODE_PATTERN = re.compile(r"^[A-Za-z0-9]{8}$")

    def generate_referral_code(self, driver) -> str:
        """Generate or return existing 8-char alphanumeric referral code.

        If the driver already has a referral code, return it (idempotent).
        Otherwise, generate a new unique code with up to MAX_CODE_ATTEMPTS
        retries on collision. Raises RuntimeError after exhausting attempts.
        """
        # Return existing code if driver already has one
        try:
            existing = DriverReferralCode.objects.get(driver=driver)
            return existing.code
        except DriverReferralCode.DoesNotExist:
            pass

        # Generate a new unique code
        for _ in range(self.MAX_CODE_ATTEMPTS):
            code = self._generate_random_code()
            # Check uniqueness case-insensitively
            if DriverReferralCode.objects.filter(code__iexact=code).exists():
                continue
            try:
                referral_code = DriverReferralCode.objects.create(
                    driver=driver, code=code.upper()
                )
                return referral_code.code
            except IntegrityError:
                # Race condition: another request created the same code
                continue

        raise RuntimeError(
            "Unable to generate a unique referral code after "
            f"{self.MAX_CODE_ATTEMPTS} attempts."
        )

    def validate_referral_code(self, code: str, referee) -> ValidationResult:
        """Validate a driver referral code.

        Checks:
        1. Format: exactly 8 alphanumeric characters
        2. Existence: code exists in the database (case-insensitive lookup)
        3. Referrer active status: the code owner's account is active
        4. Self-referral: the referee is not using their own code

        Args:
            code: The referral code string to validate.
            referee: The driver user attempting to use the code.

        Returns:
            ValidationResult with is_valid=True if all checks pass,
            or is_valid=False with the appropriate error_code and error_message.
        """
        # 1. Format check: exactly 8 alphanumeric characters
        if not self.CODE_PATTERN.match(code):
            return ValidationResult(
                is_valid=False,
                error_code="invalid_format",
                error_message="Referral code must be exactly 8 alphanumeric characters.",
            )

        # 2. Lookup code case-insensitively
        try:
            referral_code_obj = DriverReferralCode.objects.select_related(
                "driver"
            ).get(code__iexact=code)
        except DriverReferralCode.DoesNotExist:
            return ValidationResult(
                is_valid=False,
                error_code="code_not_found",
                error_message="This referral code is not recognized.",
            )

        # 3. Check referrer is active
        if not referral_code_obj.driver.is_active:
            return ValidationResult(
                is_valid=False,
                error_code="referrer_inactive",
                error_message="This referral code is no longer valid.",
            )

        # 4. Self-referral prevention (only when referee is provided)
        if referee is not None and referral_code_obj.driver_id == referee.pk:
            return ValidationResult(
                is_valid=False,
                error_code="self_referral",
                error_message="You cannot use your own referral code.",
            )

        return ValidationResult(
            is_valid=True,
            referral_code_obj=referral_code_obj,
        )

    def record_referral_signup(self, referee, code: str) -> DriverReferral:
        """Record a driver referral relationship after successful registration.

        Validates the referral code, snapshots the ride threshold from the
        active RewardConfiguration, and creates a DriverReferral record.
        Enforces one referral per driver account via the OneToOne constraint.

        Args:
            referee: The new driver user who is signing up with a referral code.
            code: The referral code string provided during signup.

        Returns:
            The created DriverReferral instance.

        Raises:
            ValueError: If validation fails or the referee already has a referral.
        """
        # Validate the referral code
        result = self.validate_referral_code(code, referee)
        if not result.is_valid:
            raise ValueError(result.error_message)

        # Get the active config to snapshot the ride threshold
        config_service = RewardConfigService()
        active_config = config_service.get_active_config()
        ride_threshold = active_config.driver_ride_threshold

        # Create the DriverReferral, enforcing one-per-account via OneToOne
        try:
            referral = DriverReferral.objects.create(
                referral_code=result.referral_code_obj,
                referee=referee,
                ride_threshold=ride_threshold,
            )
        except IntegrityError:
            raise ValueError(
                "This driver account already has a referral associated with it."
            )

        return referral

    def increment_ride_count(self, driver) -> Optional[DriverReferral]:
        """Increment the completed ride count for a referred driver.

        If the driver has a DriverReferral with status="pending" and their
        completed_rides is below the ride_threshold, increment completed_rides
        by 1 and update last_ride_at to now.

        Args:
            driver: The referred driver who completed a ride.

        Returns:
            The updated DriverReferral if one was incremented, or None if the
            driver has no pending referral or has already met the threshold.
        """
        try:
            referral = DriverReferral.objects.select_for_update().get(
                referee=driver,
                status="pending",
            )
        except DriverReferral.DoesNotExist:
            return None

        # Only increment if below threshold
        if referral.completed_rides >= referral.ride_threshold:
            return None

        referral.completed_rides += 1
        referral.last_ride_at = timezone.now()
        referral.save(update_fields=["completed_rides", "last_ride_at"])

        return referral

    def check_and_issue_bonus(self, referral: DriverReferral) -> BonusIssuanceResult:
        """Check threshold and issue bonus if met, with exactly-once semantics.

        This method:
        1. Checks if the referral's completed_rides >= ride_threshold
        2. Rejects if a DriverBonus already exists for this referral (duplicate)
        3. Gets active RewardConfiguration for bonus amount and cap settings
        4. Checks if referrer is active — if suspended, creates bonus as withheld
        5. Checks bonus cap: count bonuses with status in ("issued", "released")
           for this referrer in the last N days. If >= cap, withholds.
        6. If all checks pass: creates DriverBonus with status="issued"
        7. Updates referral status to "completed", sets completed_at
        8. Sends notification placeholder

        Uses @transaction.atomic and select_for_update() for safety.

        Args:
            referral: The DriverReferral to check and potentially issue a bonus for.

        Returns:
            BonusIssuanceResult indicating success/failure and any withholding.
        """
        with transaction.atomic():
            # Lock the referral row to prevent concurrent bonus issuance
            referral = DriverReferral.objects.select_for_update().get(
                pk=referral.pk
            )

            # 1. Check if threshold is met
            if referral.completed_rides < referral.ride_threshold:
                return BonusIssuanceResult(
                    success=False,
                    reason="Ride threshold not yet met.",
                )

            # 2. Check for existing bonus (exactly-once semantics)
            if DriverBonus.objects.filter(referral=referral).exists():
                return BonusIssuanceResult(
                    success=False,
                    reason="Bonus already issued for this referral.",
                )

            # 3. Get active reward configuration
            config_service = RewardConfigService()
            config = config_service.get_active_config()
            bonus_amount = config.driver_bonus_amount

            # Get the referrer
            referrer = referral.referral_code.driver

            # 4. Check referrer active status
            if not referrer.is_active:
                bonus = DriverBonus.objects.create(
                    referral=referral,
                    referrer=referrer,
                    amount=bonus_amount,
                    status="withheld",
                )
                logger.info(
                    "Bonus withheld for referrer %s (id=%s): account suspended.",
                    referrer,
                    referrer.pk,
                )
                return BonusIssuanceResult(
                    success=True,
                    bonus=bonus,
                    withheld=True,
                    reason="Referrer account is suspended. Bonus withheld.",
                )

            # 5. Check bonus cap
            cap_count = config.driver_bonus_cap_count
            cap_days = config.driver_bonus_cap_days
            cap_window_start = timezone.now() - timedelta(days=cap_days)

            issued_bonus_count = DriverBonus.objects.filter(
                referrer=referrer,
                status__in=["issued", "released"],
                issued_at__gte=cap_window_start,
            ).count()

            if issued_bonus_count >= cap_count:
                bonus = DriverBonus.objects.create(
                    referral=referral,
                    referrer=referrer,
                    amount=bonus_amount,
                    status="withheld",
                )
                logger.info(
                    "Bonus withheld for referrer %s (id=%s): bonus cap reached "
                    "(%d/%d in last %d days).",
                    referrer,
                    referrer.pk,
                    issued_bonus_count,
                    cap_count,
                    cap_days,
                )
                return BonusIssuanceResult(
                    success=True,
                    bonus=bonus,
                    withheld=True,
                    reason="Referral bonus cap reached for this period.",
                )

            # 6. All checks pass: create bonus with status="issued"
            bonus = DriverBonus.objects.create(
                referral=referral,
                referrer=referrer,
                amount=bonus_amount,
                status="issued",
            )

            # 7. Update referral status to "completed"
            referral.status = "completed"
            referral.completed_at = timezone.now()
            referral.save(update_fields=["status", "completed_at"])

            # 8. Send notification placeholder
            referee = referral.referee
            self._send_bonus_notification(referrer, referee, bonus_amount)

        return BonusIssuanceResult(
            success=True,
            bonus=bonus,
            withheld=False,
        )

    def _send_bonus_notification(self, referrer, referee, amount) -> None:
        """Send notification to referrer about bonus issuance.

        This is a placeholder implementation that logs the notification.
        Actual notification integration (e.g., push notification, email)
        will be added in a future task.

        Args:
            referrer: The driver who made the referral.
            referee: The referred driver who completed the rides.
            amount: The bonus amount issued.
        """
        referee_name = f"{referee.first_name} {referee.last_name}".strip()
        if not referee_name:
            referee_name = referee.email

        logger.info(
            "Bonus issued: notifying referrer %s (id=%s) that a bonus of %s "
            "has been issued for referred driver %s (id=%s).",
            referrer,
            referrer.pk,
            amount,
            referee_name,
            referee.pk,
        )

    def get_referral_status(self, referrer) -> list[DriverReferralStatus]:
        """Return the list of referred drivers with their progress.

        Retrieves all DriverReferral records linked to this referrer's
        DriverReferralCode and returns a list of DriverReferralStatus
        dataclasses.

        Args:
            referrer: The driver user who referred other drivers.

        Returns:
            List of DriverReferralStatus with referee_name, completed_rides,
            ride_threshold, and status for each referral. Returns an empty
            list if the referrer has no referral code or no referrals.
        """
        try:
            referral_code = DriverReferralCode.objects.get(driver=referrer)
        except DriverReferralCode.DoesNotExist:
            return []

        referrals = DriverReferral.objects.filter(
            referral_code=referral_code,
        ).select_related("referee")

        statuses = []
        for referral in referrals:
            referee = referral.referee
            referee_name = f"{referee.first_name} {referee.last_name}".strip()
            if not referee_name:
                referee_name = referee.email

            statuses.append(
                DriverReferralStatus(
                    referee_name=referee_name,
                    completed_rides=referral.completed_rides,
                    ride_threshold=referral.ride_threshold,
                    status=referral.status,
                )
            )

        return statuses

    def expire_stale_referrals(self) -> int:
        """Mark referrals with 90 days of inactivity as expired.

        A referral is considered stale if:
        - Its status is "pending" (not yet completed)
        - The last activity (last_ride_at, or created_at if no rides) was
          more than 90 days ago
        - The completed ride count is below the ride threshold

        When expiring:
        - Sets status to "expired" and expired_at to now
        - Sends a notification to the referrer for each expired referral

        Returns:
            The number of referrals that were expired.
        """
        now = timezone.now()
        cutoff = now - timedelta(days=90)

        # Find stale referrals: pending, below threshold, inactive for 90+ days
        # A referral is stale if last_ride_at < cutoff (when rides exist)
        # or created_at < cutoff (when no rides have been completed)
        stale_referrals = DriverReferral.objects.filter(
            status="pending",
        ).filter(
            # Ride count below threshold (use F expression comparison)
            completed_rides__lt=models.F("ride_threshold"),
        ).filter(
            # Inactive for 90+ days: use last_ride_at if available, else created_at
            Q(last_ride_at__isnull=False, last_ride_at__lt=cutoff)
            | Q(last_ride_at__isnull=True, created_at__lt=cutoff)
        ).select_related("referral_code__driver", "referee")

        expired_count = 0
        for referral in stale_referrals:
            referral.status = "expired"
            referral.expired_at = now
            referral.save(update_fields=["status", "expired_at"])

            # Send notification to referrer
            referrer = referral.referral_code.driver
            referee = referral.referee
            self._send_expiration_notification(referrer, referee)

            expired_count += 1

        return expired_count

    def release_pending_bonuses(self, driver) -> int:
        """Release all withheld bonuses when a referrer's account is reinstated.

        Finds all DriverBonus records where referrer=driver and status="withheld",
        sets their status to "released" and released_at to now, and sends a
        notification for each released bonus.

        Args:
            driver: The driver user whose account has been reinstated.

        Returns:
            The number of bonuses that were released.
        """
        now = timezone.now()
        withheld_bonuses = DriverBonus.objects.filter(
            referrer=driver,
            status="withheld",
        ).select_related("referral__referee")

        released_count = 0
        for bonus in withheld_bonuses:
            bonus.status = "released"
            bonus.released_at = now
            bonus.save(update_fields=["status", "released_at"])

            # Send notification for each released bonus
            referee = bonus.referral.referee
            self._send_bonus_released_notification(driver, referee, bonus.amount)

            released_count += 1

        return released_count

    def _send_bonus_released_notification(self, referrer, referee, amount) -> None:
        """Send notification to referrer about a released bonus.

        This is a placeholder implementation that logs the notification.
        Actual notification integration (e.g., push notification, email)
        will be added in a future task.

        Args:
            referrer: The driver who made the referral.
            referee: The referred driver associated with the bonus.
            amount: The bonus amount released.
        """
        referee_name = f"{referee.first_name} {referee.last_name}".strip()
        if not referee_name:
            referee_name = referee.email

        logger.info(
            "Bonus released: notifying referrer %s (id=%s) that a withheld bonus "
            "of %s for referred driver %s (id=%s) has been released.",
            referrer,
            referrer.pk,
            amount,
            referee_name,
            referee.pk,
        )

    def _send_expiration_notification(self, referrer, referee) -> None:
        """Send notification to referrer about an expired referral.

        This is a placeholder implementation that logs the notification.
        Actual notification integration (e.g., push notification, email)
        will be added in a future task.

        Args:
            referrer: The driver who made the referral.
            referee: The referred driver whose referral has expired.
        """
        logger.info(
            "Referral expired: notifying referrer %s (id=%s) that referral "
            "for referee %s (id=%s) has expired due to 90 days of inactivity.",
            referrer,
            referrer.pk,
            referee,
            referee.pk,
        )

    def _generate_random_code(self) -> str:
        """Generate a random code of CODE_LENGTH from CODE_CHARSET."""
        return "".join(
            secrets.choice(self.CODE_CHARSET) for _ in range(self.CODE_LENGTH)
        )
