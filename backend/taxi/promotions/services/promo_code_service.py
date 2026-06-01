import logging
import string
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from promotions.models import (
    PromoCode,
    PromoCodeUsage,
    ReferralCode,
    ReferralUsage,
    ReferrerCredit,
)

logger = logging.getLogger(__name__)


@dataclass
class EligibilityResult:
    """Result of a promo code eligibility check."""

    eligible: bool
    error_code: Optional[str] = None
    message: Optional[str] = None


@dataclass
class ValidationResult:
    """Result of validating a promo code for a rider."""

    valid: bool
    discount_amount: Decimal
    final_fare: Decimal
    discount_type: Optional[str] = None
    error_code: Optional[str] = None
    message: Optional[str] = None


@dataclass
class ApplicationResult:
    """Result of applying a promo code to a completed ride."""

    success: bool
    original_fare: Decimal
    discount_amount: Decimal
    final_fare: Decimal
    error_code: Optional[str] = None
    message: Optional[str] = None


@dataclass
class ReferralResult:
    """Result of applying a referral code."""

    success: bool
    referee_discount: Decimal = Decimal("0.00")
    referrer_credit: Decimal = Decimal("0.00")
    error_code: Optional[str] = None
    message: Optional[str] = None


class PromoCodeService:
    """Service layer for promo code operations including discount calculation."""

    def calculate_discount(self, promo: PromoCode, fare: Decimal) -> Decimal:
        """
        Calculate the discount amount for a given promo code and fare.

        Args:
            promo: The PromoCode instance to apply.
            fare: The original fare amount (must be positive).

        Returns:
            The discount amount as a Decimal, never exceeding the fare.

        Discount logic by type:
            - percentage: round(fare * discount_value / 100, 2), capped at fare
            - fixed: min(discount_value, fare) so final_fare >= 0
            - free_ride: discount equals the full fare
        """
        fare = Decimal(str(fare))

        if promo.discount_type == "percentage":
            discount = (fare * promo.discount_value / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            return min(discount, fare)

        elif promo.discount_type == "fixed":
            return min(promo.discount_value, fare)

        elif promo.discount_type == "free_ride":
            return fare

        # Unknown discount type — no discount
        return Decimal("0.00")

    def compute_final_fare(self, original_fare: Decimal, discount_amount: Decimal) -> Decimal:
        """
        Compute the final fare after applying a discount.

        Args:
            original_fare: The original fare before discount.
            discount_amount: The calculated discount amount.

        Returns:
            The final fare (original_fare - discount_amount), guaranteed >= 0.
        """
        original_fare = Decimal(str(original_fare))
        discount_amount = Decimal(str(discount_amount))
        final_fare = original_fare - discount_amount
        return max(final_fare, Decimal("0.00"))

    def check_eligibility(self, promo: PromoCode, rider, fare: Decimal) -> EligibilityResult:
        """
        Check whether a rider is eligible to use a promo code for a given fare.

        Checks are performed in order:
        1. Code status (active/inactive)
        2. Temporal validity (start_date / end_date)
        3. Total usage limit
        4. Per-rider usage limit
        5. Minimum fare requirement
        6. First-ride-only restriction

        Args:
            promo: The PromoCode instance to check.
            rider: The User (rider) attempting to use the code.
            fare: The ride fare amount.

        Returns:
            EligibilityResult with eligible=True if all checks pass,
            or eligible=False with the appropriate error_code and message.
        """
        from taxi.rides.models import Ride

        # 1. Code status check
        if promo.status != "active":
            return EligibilityResult(
                eligible=False,
                error_code="code_inactive",
                message="This promo code is no longer valid.",
            )

        # 2. Temporal validity check
        now = timezone.now()
        if now < promo.start_date:
            return EligibilityResult(
                eligible=False,
                error_code="code_not_active_yet",
                message="This promo code is not yet active.",
            )
        if now > promo.end_date:
            return EligibilityResult(
                eligible=False,
                error_code="code_expired",
                message="This promo code has expired.",
            )

        # 3. Total usage limit check
        if promo.max_total_uses is not None:
            total_usages = PromoCodeUsage.objects.filter(promo_code=promo).count()
            if total_usages >= promo.max_total_uses:
                return EligibilityResult(
                    eligible=False,
                    error_code="total_limit_reached",
                    message="This promo code has reached its maximum number of uses.",
                )

        # 4. Per-rider usage limit check
        if promo.max_per_rider_uses is not None:
            rider_usages = PromoCodeUsage.objects.filter(
                promo_code=promo, rider=rider
            ).count()
            if rider_usages >= promo.max_per_rider_uses:
                return EligibilityResult(
                    eligible=False,
                    error_code="rider_limit_reached",
                    message="You have already used this promo code the maximum number of times.",
                )

        # 5. Minimum fare check
        fare = Decimal(str(fare))
        if fare < promo.min_fare:
            return EligibilityResult(
                eligible=False,
                error_code="min_fare_not_met",
                message=f"Your fare does not meet the minimum requirement of {promo.min_fare} MRU for this code.",
            )

        # 6. First-ride-only check
        if promo.first_ride_only:
            completed_rides = Ride.objects.filter(
                rider=rider, status="completed"
            ).count()
            if completed_rides > 0:
                return EligibilityResult(
                    eligible=False,
                    error_code="first_ride_only",
                    message="This promo code is valid for first rides only.",
                )

        # All checks passed
        return EligibilityResult(eligible=True)

    # -------------------------------------------------------------------------
    # Referral Code Logic
    # -------------------------------------------------------------------------

    # Default referral amounts (configurable)
    REFERRAL_REFEREE_DISCOUNT = Decimal("50.00")  # 50 MRU discount for referee
    REFERRAL_REFERRER_CREDIT = Decimal("50.00")  # 50 MRU credit for referrer
    REFERRAL_CODE_LENGTH = 8
    MAX_REFERRAL_CODE_ATTEMPTS = 10

    def generate_referral_code(self, rider) -> str:
        """
        Generate a unique referral code for a rider.

        Creates an 8-character uppercase alphanumeric code and links it
        to the rider via a ReferralCode record. Handles uniqueness collisions
        by regenerating up to MAX_REFERRAL_CODE_ATTEMPTS times.

        If the rider already has a referral code, returns the existing code
        (idempotent behavior).

        Args:
            rider: The User instance to generate a referral code for.

        Returns:
            The generated code string.

        Raises:
            RuntimeError: If a unique code cannot be generated after max attempts.
        """
        # Return existing code if rider already has one (idempotent)
        existing = ReferralCode.objects.filter(rider=rider).first()
        if existing:
            return existing.code

        allowed_chars = string.ascii_uppercase + string.digits

        for _ in range(self.MAX_REFERRAL_CODE_ATTEMPTS):
            code = get_random_string(
                length=self.REFERRAL_CODE_LENGTH,
                allowed_chars=allowed_chars,
            )
            try:
                ReferralCode.objects.create(rider=rider, code=code)
                return code
            except IntegrityError:
                # Code already exists, try again
                continue

        raise RuntimeError(
            f"Failed to generate a unique referral code after "
            f"{self.MAX_REFERRAL_CODE_ATTEMPTS} attempts."
        )

    def apply_referral(self, referral_code: str, referee, ride, fare: Decimal) -> ReferralResult:
        """
        Apply a referral code for a referee on their ride.

        Validates the referral code, checks for self-referral and inactive referrer,
        then creates ReferralUsage and ReferrerCredit records.

        Args:
            referral_code: The referral code string to apply.
            referee: The User (referee) applying the referral code.
            ride: The Ride instance the referral is being applied to.
            fare: The ride fare amount.

        Returns:
            ReferralResult with success=True and discount/credit amounts,
            or success=False with the appropriate error_code and message.
        """
        # Look up the ReferralCode by code string
        try:
            referral = ReferralCode.objects.select_related("rider").get(
                code=referral_code.upper()
            )
        except ReferralCode.DoesNotExist:
            return ReferralResult(
                success=False,
                error_code="code_not_found",
                message="Referral code not found.",
            )

        referrer = referral.rider

        # Validate: not self-referral (code owner != referee)
        if referrer == referee:
            return ReferralResult(
                success=False,
                error_code="self_referral",
                message="You cannot use your own referral code.",
            )

        # Validate: referrer (code owner) is active
        if not referrer.is_active:
            return ReferralResult(
                success=False,
                error_code="inactive_referrer",
                message="This referral code is no longer valid.",
            )

        # Calculate referee_discount and referrer_credit
        referee_discount = self.REFERRAL_REFEREE_DISCOUNT
        referrer_credit = self.REFERRAL_REFERRER_CREDIT

        # Create ReferralUsage and ReferrerCredit records
        with transaction.atomic():
            referral_usage = ReferralUsage.objects.create(
                referral_code=referral,
                referee=referee,
                ride=ride,
                referee_discount=referee_discount,
                referrer_credit=referrer_credit,
            )

            ReferrerCredit.objects.create(
                referrer=referrer,
                referral_usage=referral_usage,
                amount=referrer_credit,
            )

        return ReferralResult(
            success=True,
            referee_discount=referee_discount,
            referrer_credit=referrer_credit,
        )

    def validate_code(self, code: str, rider, estimated_fare: Decimal) -> ValidationResult:
        """
        Validate a promo code and return a discount preview for the rider.

        Looks up the code (case-insensitive), checks eligibility, and calculates
        the expected discount amount based on the estimated fare.

        Args:
            code: The promo code string entered by the rider.
            rider: The User (rider) attempting to use the code.
            estimated_fare: The estimated fare for the ride.

        Returns:
            ValidationResult with discount_amount and final_fare if valid,
            or with discount_amount=0 and error details if invalid.
        """
        estimated_fare = Decimal(str(estimated_fare))

        # Look up the PromoCode by code string (case-insensitive)
        try:
            promo = PromoCode.objects.get(code=code.upper())
        except PromoCode.DoesNotExist:
            return ValidationResult(
                valid=False,
                discount_amount=Decimal("0"),
                final_fare=estimated_fare,
                error_code="code_not_found",
                message="Promo code not found.",
            )

        # Run eligibility checks
        eligibility = self.check_eligibility(promo, rider, estimated_fare)
        if not eligibility.eligible:
            return ValidationResult(
                valid=False,
                discount_amount=Decimal("0"),
                final_fare=estimated_fare,
                error_code=eligibility.error_code,
                message=eligibility.message,
            )

        # Calculate discount preview
        discount_amount = self.calculate_discount(promo, estimated_fare)
        final_fare = self.compute_final_fare(estimated_fare, discount_amount)

        return ValidationResult(
            valid=True,
            discount_amount=discount_amount,
            final_fare=final_fare,
            discount_type=promo.discount_type,
        )

    def apply_code(self, code: str, rider, ride, actual_fare: Decimal) -> ApplicationResult:
        """
        Apply a promo code to a completed ride.

        Re-validates eligibility at apply time using select_for_update() for
        race condition safety, calculates the final discount based on actual fare,
        and creates a PromoCodeUsage record.

        Per Requirement 6.3, ride completion proceeds even if usage record
        creation fails.

        Args:
            code: The promo code string.
            rider: The User (rider) who used the code.
            ride: The Ride instance the code is being applied to.
            actual_fare: The actual fare for the completed ride.

        Returns:
            ApplicationResult with original_fare, discount_amount, and final_fare.
        """
        actual_fare = Decimal(str(actual_fare))

        # Look up PromoCode with select_for_update() for race condition safety
        with transaction.atomic():
            try:
                promo = PromoCode.objects.select_for_update().get(code=code.upper())
            except PromoCode.DoesNotExist:
                return ApplicationResult(
                    success=False,
                    original_fare=actual_fare,
                    discount_amount=Decimal("0"),
                    final_fare=actual_fare,
                    error_code="code_not_found",
                    message="Promo code not found.",
                )

            # Re-validate eligibility at apply time
            eligibility = self.check_eligibility(promo, rider, actual_fare)
            if not eligibility.eligible:
                return ApplicationResult(
                    success=False,
                    original_fare=actual_fare,
                    discount_amount=Decimal("0"),
                    final_fare=actual_fare,
                    error_code=eligibility.error_code,
                    message=eligibility.message,
                )

            # Calculate final discount based on actual fare
            discount_amount = self.calculate_discount(promo, actual_fare)
            final_fare = self.compute_final_fare(actual_fare, discount_amount)

            # Create PromoCodeUsage record
            # Ride completion proceeds even if usage record creation fails (Requirement 6.3)
            try:
                PromoCodeUsage.objects.create(
                    promo_code=promo,
                    rider=rider,
                    ride=ride,
                    original_fare=actual_fare,
                    discount_amount=discount_amount,
                    final_fare=final_fare,
                    is_first_ride=promo.first_ride_only,
                )
            except Exception:
                logger.exception(
                    "Failed to create PromoCodeUsage record for code=%s, rider=%s, ride=%s. "
                    "Ride completion proceeds normally.",
                    code,
                    rider,
                    ride,
                )

        return ApplicationResult(
            success=True,
            original_fare=actual_fare,
            discount_amount=discount_amount,
            final_fare=final_fare,
        )
