import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from referrals.models import RideCredit, RiderReferral, RiderReferralCode
from referrals.services.reward_config_service import RewardConfigService

# Precompiled regex for referral code format validation
_CODE_FORMAT_RE = re.compile(r"^[A-Za-z0-9]{8}$")

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of referral code validation."""

    is_valid: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    referral_code_obj: Optional[RiderReferralCode] = None


@dataclass
class RiderReferralInfo:
    """Referral statistics for a rider."""

    code: str
    successful_referrals: int
    total_credits_earned: Decimal


@dataclass
class ShareContent:
    """Pre-formatted shareable referral content."""

    code: str
    message: str


@dataclass
class CreditIssuanceResult:
    """Result of first-ride credit issuance."""

    success: bool
    referrer_credit: Optional[RideCredit] = None
    referee_credit: Optional[RideCredit] = None
    withheld: bool = False
    reason: Optional[str] = None


@dataclass
class CreditApplicationResult:
    """Result of applying ride credits to a fare."""

    original_fare: Decimal
    discount_applied: Decimal
    final_fare: Decimal
    credits_used: list


class RiderReferralService:
    """Service handling rider-to-rider referral logic."""

    MAX_CODE_ATTEMPTS = 5
    CODE_LENGTH = 8
    CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    SIGNUP_BASE_URL = "https://yala.app/signup"

    def generate_referral_code(self, rider) -> str:
        """Generate or return existing 8-char alphanumeric referral code.

        If the rider already has a referral code, return it (idempotent).
        Otherwise, generate a new unique code with up to MAX_CODE_ATTEMPTS
        retries on collision. Raises RuntimeError after exhausting attempts.
        """
        # Return existing code if rider already has one
        try:
            existing = RiderReferralCode.objects.get(rider=rider)
            return existing.code
        except RiderReferralCode.DoesNotExist:
            pass

        # Generate a new unique code
        for _ in range(self.MAX_CODE_ATTEMPTS):
            code = self._generate_random_code()
            # Check uniqueness case-insensitively
            if RiderReferralCode.objects.filter(code__iexact=code).exists():
                continue
            try:
                referral_code = RiderReferralCode.objects.create(
                    rider=rider, code=code.upper()
                )
                return referral_code.code
            except IntegrityError:
                # Race condition: another request created the same code
                continue

        raise RuntimeError(
            "Unable to generate a unique referral code after "
            f"{self.MAX_CODE_ATTEMPTS} attempts."
        )

    def _generate_random_code(self) -> str:
        """Generate a random code of CODE_LENGTH from CODE_CHARSET."""
        return "".join(
            secrets.choice(self.CODE_CHARSET) for _ in range(self.CODE_LENGTH)
        )

    def get_referral_info(self, rider) -> RiderReferralInfo:
        """Return referral code, successful referral count, and total credits earned.

        A successful referral is a RiderReferral with status="completed"
        (referee completed their first ride). Total credits earned is the sum
        of RideCredit.original_amount where status is "active" or "used" and
        credit_type is "referrer" for that rider.

        If no referral code exists, generates one first.
        """
        code = self.generate_referral_code(rider)

        # Count successful referrals (completed status)
        try:
            referral_code_obj = RiderReferralCode.objects.get(rider=rider)
            successful_referrals = RiderReferral.objects.filter(
                referral_code=referral_code_obj,
                status="completed",
            ).count()
        except RiderReferralCode.DoesNotExist:
            successful_referrals = 0

        # Sum total credits earned (active or used, credit_type=referrer)
        total_credits = (
            RideCredit.objects.filter(
                rider=rider,
                credit_type="referrer",
                status__in=["active", "used"],
            ).aggregate(total=Sum("original_amount"))["total"]
            or Decimal("0.00")
        )

        return RiderReferralInfo(
            code=code,
            successful_referrals=successful_referrals,
            total_credits_earned=total_credits,
        )

    def get_share_content(self, rider) -> ShareContent:
        """Return pre-formatted shareable message with referral code and signup link.

        Auto-generates a referral code if none exists for the rider.
        """
        code = self.generate_referral_code(rider)
        signup_link = f"{self.SIGNUP_BASE_URL}?ref={code}"
        message = (
            f"Join Yala with my referral code {code}! "
            f"Sign up here: {signup_link}"
        )
        return ShareContent(code=code, message=message)

    def record_referral_signup(self, referee, code: str, device_id: str = "") -> RiderReferral:
        """Record referral relationship after successful registration.

        Validates the referral code, then creates a RiderReferral linking the
        referee to the referrer's code. Stores device_id for fraud detection.

        Enforces one referral per account via the OneToOne constraint on referee.

        Args:
            referee: The new rider user who is signing up with a referral code.
            code: The referral code string to validate and record.
            device_id: Optional device identifier for fraud detection.

        Returns:
            The created RiderReferral instance.

        Raises:
            ValueError: If the code is invalid or the referee already has a referral.
        """
        # Validate the referral code first
        result = self.validate_referral_code(code, referee)
        if not result.is_valid:
            raise ValueError(result.error_message)

        # Create the referral relationship
        try:
            referral = RiderReferral.objects.create(
                referral_code=result.referral_code_obj,
                referee=referee,
                device_id=device_id,
            )
        except IntegrityError:
            raise ValueError(
                "This account already has a referral. Only one referral per account is allowed."
            )

        return referral

    def validate_referral_code(self, code: str, referee=None) -> ValidationResult:
        """Validate a referral code for use during signup.

        Checks in order:
        1. Format: exactly 8 alphanumeric characters (before any DB query)
        2. Existence: code exists in the database (case-insensitive lookup)
        3. Referrer active: the code owner's account is active
        4. Self-referral: the referee is not the code owner (skipped if referee is None)

        Args:
            code: The referral code string to validate.
            referee: The user attempting to use the code. If None, the
                     self-referral check is skipped (useful for public
                     validation during signup before the user is authenticated).

        Returns a ValidationResult with appropriate error codes on failure.
        """
        # 1. Format validation — no DB query if format is invalid
        if not _CODE_FORMAT_RE.match(code):
            return ValidationResult(
                is_valid=False,
                error_code="invalid_format",
                error_message="Referral code must be exactly 8 alphanumeric characters.",
            )

        # 2. Code existence — case-insensitive lookup
        try:
            referral_code_obj = RiderReferralCode.objects.select_related(
                "rider"
            ).get(code__iexact=code)
        except RiderReferralCode.DoesNotExist:
            return ValidationResult(
                is_valid=False,
                error_code="code_not_found",
                error_message="This referral code is not recognized.",
            )

        # 3. Referrer active status
        if not referral_code_obj.rider.is_active:
            return ValidationResult(
                is_valid=False,
                error_code="referrer_inactive",
                error_message="This referral code is no longer valid.",
            )

        # 4. Self-referral prevention (only when referee is provided)
        if referee is not None and referral_code_obj.rider_id == referee.pk:
            return ValidationResult(
                is_valid=False,
                error_code="self_referral",
                error_message="You cannot use your own referral code.",
            )

        # All checks passed
        return ValidationResult(
            is_valid=True,
            referral_code_obj=referral_code_obj,
        )

    @transaction.atomic
    def process_first_ride_credit(self, ride) -> CreditIssuanceResult:
        """Issue credits to referrer and referee after referee's first completed ride.

        Uses select_for_update() to lock the referral row and prevent
        double-issuance in concurrent scenarios. Checks referrer active status
        and credit cap before issuing. Withholds credits if referrer is
        suspended. Sends notifications on successful issuance.

        Args:
            ride: The completed ride object. Must have a `rider` attribute
                  representing the referee who completed the ride.

        Returns:
            CreditIssuanceResult indicating success/failure, credits issued,
            and whether credits were withheld.
        """
        referee = ride.rider

        # 1. Get the RiderReferral for this referee with status="pending"
        try:
            referral = (
                RiderReferral.objects.select_for_update()
                .select_related("referral_code__rider")
                .get(referee=referee, status="pending")
            )
        except RiderReferral.DoesNotExist:
            return CreditIssuanceResult(
                success=False,
                reason="No pending referral found for this rider.",
            )

        referrer = referral.referral_code.rider

        # 2. Get active RewardConfiguration
        config_service = RewardConfigService()
        config = config_service.get_active_config()

        # 3. Check if referrer is active — if suspended, withhold credits
        if not referrer.is_active:
            referral.status = "completed"
            referral.completed_at = timezone.now()
            referral.save(update_fields=["status", "completed_at"])

            # Create withheld credits for record-keeping
            now = timezone.now()
            expires_at = now + timedelta(days=config.credit_expiration_days)

            referrer_credit = RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=config.rider_referrer_credit,
                remaining_amount=Decimal("0.00"),
                status="withheld",
                credit_type="referrer",
                expires_at=expires_at,
            )
            referee_credit = RideCredit.objects.create(
                rider=referee,
                referral=referral,
                original_amount=config.rider_referee_credit,
                remaining_amount=Decimal("0.00"),
                status="withheld",
                credit_type="referee",
                expires_at=expires_at,
            )

            logger.warning(
                "Referral credits withheld: referrer %s is suspended. "
                "Referral ID: %s, Referee: %s",
                referrer.pk,
                referral.pk,
                referee.pk,
            )

            return CreditIssuanceResult(
                success=False,
                referrer_credit=referrer_credit,
                referee_credit=referee_credit,
                withheld=True,
                reason="Referrer account is suspended. Credits withheld for admin review.",
            )

        # 4. Check referrer credit cap
        cap_window_start = timezone.now() - timedelta(
            days=config.rider_credit_cap_days
        )
        referrer_credit_count = RideCredit.objects.filter(
            rider=referrer,
            credit_type="referrer",
            issued_at__gte=cap_window_start,
            status__in=["active", "used"],
        ).count()

        if referrer_credit_count >= config.rider_credit_cap_count:
            referral.status = "completed"
            referral.completed_at = timezone.now()
            referral.save(update_fields=["status", "completed_at"])

            now = timezone.now()
            expires_at = now + timedelta(days=config.credit_expiration_days)

            referrer_credit = RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=config.rider_referrer_credit,
                remaining_amount=Decimal("0.00"),
                status="withheld",
                credit_type="referrer",
                expires_at=expires_at,
            )
            # Referee still gets their credit even when referrer is capped
            referee_credit = RideCredit.objects.create(
                rider=referee,
                referral=referral,
                original_amount=config.rider_referee_credit,
                remaining_amount=config.rider_referee_credit,
                status="active",
                credit_type="referee",
                expires_at=expires_at,
            )

            logger.info(
                "Referrer %s has reached credit cap (%d in %d days). "
                "Referrer credit withheld. Referee %s still receives credit.",
                referrer.pk,
                config.rider_credit_cap_count,
                config.rider_credit_cap_days,
                referee.pk,
            )

            self._send_credit_notification(
                referee,
                config.rider_referee_credit,
                "Welcome credit for completing your first ride via referral",
            )

            return CreditIssuanceResult(
                success=False,
                referrer_credit=referrer_credit,
                referee_credit=referee_credit,
                withheld=True,
                reason="Referrer has reached the maximum referral credit cap for this period.",
            )

        # 5. All checks passed — issue credits to both referrer and referee
        now = timezone.now()
        expires_at = now + timedelta(days=config.credit_expiration_days)

        referrer_credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=config.rider_referrer_credit,
            remaining_amount=config.rider_referrer_credit,
            status="active",
            credit_type="referrer",
            expires_at=expires_at,
        )

        referee_credit = RideCredit.objects.create(
            rider=referee,
            referral=referral,
            original_amount=config.rider_referee_credit,
            remaining_amount=config.rider_referee_credit,
            status="active",
            credit_type="referee",
            expires_at=expires_at,
        )

        # 6. Update referral status to "completed"
        referral.status = "completed"
        referral.completed_at = now
        referral.save(update_fields=["status", "completed_at"])

        # 7. Send notifications
        self._send_credit_notification(
            referrer,
            config.rider_referrer_credit,
            f"Referral credit: {referee.get_full_name() or 'Your referral'} completed their first ride",
        )
        self._send_credit_notification(
            referee,
            config.rider_referee_credit,
            "Welcome credit for completing your first ride via referral",
        )

        logger.info(
            "Referral credits issued: referrer %s (%.2f), referee %s (%.2f). "
            "Referral ID: %s",
            referrer.pk,
            config.rider_referrer_credit,
            referee.pk,
            config.rider_referee_credit,
            referral.pk,
        )

        return CreditIssuanceResult(
            success=True,
            referrer_credit=referrer_credit,
            referee_credit=referee_credit,
        )

    @transaction.atomic
    def revoke_credits_for_ride(self, ride) -> int:
        """Revoke credits issued for a referral if the referee's first ride is cancelled/reversed.

        Finds the RiderReferral for the ride's rider (referee), revokes all
        associated RideCredits (both referrer and referee), and updates the
        referral status to "revoked".

        Args:
            ride: The cancelled/reversed ride object. Must have a `rider`
                  attribute representing the referee.

        Returns:
            The count of credits that were revoked. Returns 0 if no completed
            referral or credits are found.
        """
        referee = ride.rider

        # Find the completed referral for this referee
        try:
            referral = RiderReferral.objects.select_for_update().get(
                referee=referee, status="completed"
            )
        except RiderReferral.DoesNotExist:
            return 0

        # Get all credits linked to this referral
        credits = RideCredit.objects.filter(referral=referral)

        now = timezone.now()
        revoked_count = credits.update(
            status="revoked",
            remaining_amount=Decimal("0.00"),
            revoked_at=now,
        )

        # Update referral status to revoked
        referral.status = "revoked"
        referral.save(update_fields=["status"])

        logger.info(
            "Credits revoked for cancelled ride: referee %s, referral %s, "
            "credits revoked: %d",
            referee.pk,
            referral.pk,
            revoked_count,
        )

        return revoked_count

    @transaction.atomic
    def apply_credit_to_fare(self, rider, fare: Decimal) -> CreditApplicationResult:
        """Apply available ride credits as discount to a fare.

        Uses FIFO ordering (oldest credits first) to apply credits. Reduces
        the fare by up to the total available credit balance, never below zero.
        Updates each credit's remaining_amount and sets status to "used" when
        fully consumed.

        Args:
            rider: The rider whose credits should be applied.
            fare: The original ride fare amount.

        Returns:
            CreditApplicationResult with original fare, discount applied,
            final fare, and list of credits used.
        """
        now = timezone.now()

        # 1. Get all available credits: active and not expired, ordered by expires_at (FIFO)
        available_credits = list(
            RideCredit.objects.select_for_update()
            .filter(
                rider=rider,
                status="active",
                expires_at__gt=now,
            )
            .order_by("expires_at")
        )

        # 2. Calculate total available balance
        total_available = sum(
            (c.remaining_amount for c in available_credits), Decimal("0.00")
        )

        # 3. Determine discount
        discount = min(fare, total_available)

        # 4. Calculate final fare (always >= 0)
        final_fare = fare - discount

        # 5. Apply discount across credits in FIFO order
        remaining_discount = discount
        credits_used = []

        for credit in available_credits:
            if remaining_discount <= Decimal("0.00"):
                break

            if credit.remaining_amount <= remaining_discount:
                # Fully consume this credit
                remaining_discount -= credit.remaining_amount
                credit.remaining_amount = Decimal("0.00")
                credit.status = "used"
                credit.used_at = now
                credit.save(update_fields=["remaining_amount", "status", "used_at"])
            else:
                # Partially consume this credit
                credit.remaining_amount -= remaining_discount
                remaining_discount = Decimal("0.00")
                credit.save(update_fields=["remaining_amount"])

            credits_used.append(credit)

        return CreditApplicationResult(
            original_fare=fare,
            discount_applied=discount,
            final_fare=final_fare,
            credits_used=credits_used,
        )

    def _send_credit_notification(self, user, amount: Decimal, reason: str) -> None:
        """Send a credit notification to a user.

        This is a placeholder implementation that logs the notification.
        In production, this would integrate with the notifications service.

        Args:
            user: The user to notify.
            amount: The credit amount.
            reason: The reason for the credit notification.
        """
        logger.info(
            "Notification sent to user %s: Credit of %.2f issued. Reason: %s",
            user.pk,
            amount,
            reason,
        )
