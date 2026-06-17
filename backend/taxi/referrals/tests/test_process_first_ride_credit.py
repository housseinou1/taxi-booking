import secrets
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from django.utils import timezone

from referrals.models import (
    RewardConfiguration,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)
from referrals.services.rider_referral_service import (
    CreditIssuanceResult,
    RiderReferralService,
)


@pytest.mark.django_db
class TestProcessFirstRideCredit:
    """Tests for RiderReferralService.process_first_ride_credit"""

    def setup_method(self):
        self.service = RiderReferralService()
        # Clear the reward config cache to avoid stale values
        from django.core.cache import cache
        cache.delete("referral:reward_config:active")
        # Create an active reward configuration
        RewardConfiguration.objects.filter(is_active=True).update(is_active=False)
        self.config = RewardConfiguration.objects.create(
            rider_referrer_credit=Decimal("50.00"),
            rider_referee_credit=Decimal("25.00"),
            rider_credit_cap_count=10,
            rider_credit_cap_days=30,
            credit_expiration_days=90,
            is_active=True,
        )

    def _create_user(self, is_active=True, user_type="rider"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"user_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
            is_active=is_active,
        )
        return user

    def _create_referral(self, referrer, referee, status="pending"):
        # Use the auto-generated code from the signal, or create one if not present
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        return RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status=status,
        )

    def _make_ride(self, rider):
        """Create a mock ride object with a rider attribute."""
        ride = MagicMock()
        ride.rider = rider
        return ride

    def test_successful_credit_issuance(self):
        """Should issue credits to both referrer and referee on first ride."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert isinstance(result, CreditIssuanceResult)
        assert result.success is True
        assert result.withheld is False
        assert result.reason is None
        assert result.referrer_credit is not None
        assert result.referee_credit is not None

    def test_referrer_credit_amount_and_type(self):
        """Referrer credit should match config amount and have correct type."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert result.referrer_credit.original_amount == Decimal("50.00")
        assert result.referrer_credit.remaining_amount == Decimal("50.00")
        assert result.referrer_credit.credit_type == "referrer"
        assert result.referrer_credit.status == "active"
        assert result.referrer_credit.rider == referrer

    def test_referee_credit_amount_and_type(self):
        """Referee credit should match config amount and have correct type."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert result.referee_credit.original_amount == Decimal("25.00")
        assert result.referee_credit.remaining_amount == Decimal("25.00")
        assert result.referee_credit.credit_type == "referee"
        assert result.referee_credit.status == "active"
        assert result.referee_credit.rider == referee

    def test_credit_expiration_date_set(self):
        """Credits should expire based on config credit_expiration_days."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        before = timezone.now()
        result = self.service.process_first_ride_credit(ride)
        after = timezone.now()

        expected_min = before + timedelta(days=90)
        expected_max = after + timedelta(days=90)

        assert expected_min <= result.referrer_credit.expires_at <= expected_max
        assert expected_min <= result.referee_credit.expires_at <= expected_max

    def test_referral_status_updated_to_completed(self):
        """Referral should be marked as completed with completed_at timestamp."""
        referrer = self._create_user()
        referee = self._create_user()
        referral = self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        self.service.process_first_ride_credit(ride)

        referral.refresh_from_db()
        assert referral.status == "completed"
        assert referral.completed_at is not None

    def test_no_pending_referral_returns_failure(self):
        """Should return failure when no pending referral exists."""
        rider = self._create_user()
        ride = self._make_ride(rider)

        result = self.service.process_first_ride_credit(ride)

        assert result.success is False
        assert result.withheld is False
        assert "No pending referral" in result.reason

    def test_already_completed_referral_returns_failure(self):
        """Should not process an already-completed referral."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee, status="completed")
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert result.success is False
        assert "No pending referral" in result.reason

    def test_suspended_referrer_withholds_credits(self):
        """Should withhold credits when referrer is suspended."""
        referrer = self._create_user(is_active=False)
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert result.success is False
        assert result.withheld is True
        assert "suspended" in result.reason.lower()
        assert result.referrer_credit.status == "withheld"
        assert result.referee_credit.status == "withheld"
        assert result.referrer_credit.remaining_amount == Decimal("0.00")
        assert result.referee_credit.remaining_amount == Decimal("0.00")

    def test_credit_cap_reached_withholds_referrer_credit(self):
        """Should withhold referrer credit when cap is reached."""
        referrer = self._create_user()
        referee = self._create_user()
        # Use the auto-generated referral code for the referrer
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj, referee=referee, status="pending"
        )
        ride = self._make_ride(referee)

        # Create enough credits to hit the cap (10) using existing referrals
        for i in range(10):
            other_referee = self._create_user()
            other_referral = RiderReferral.objects.create(
                referral_code=code_obj, referee=other_referee, status="completed"
            )
            RideCredit.objects.create(
                rider=referrer,
                referral=other_referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status="active",
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )

        result = self.service.process_first_ride_credit(ride)

        assert result.success is False
        assert result.withheld is True
        assert "cap" in result.reason.lower()
        assert result.referrer_credit.status == "withheld"
        # Referee still gets their credit
        assert result.referee_credit.status == "active"
        assert result.referee_credit.remaining_amount == Decimal("25.00")

    def test_cap_only_counts_recent_credits(self):
        """Credits outside the cap window should not count toward the cap."""
        referrer = self._create_user()
        referee = self._create_user()
        # Use the auto-generated referral code for the referrer
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj, referee=referee, status="pending"
        )
        ride = self._make_ride(referee)

        # Create credits outside the cap window (older than 30 days)
        old_date = timezone.now() - timedelta(days=31)
        for i in range(10):
            other_referee = self._create_user()
            other_referral = RiderReferral.objects.create(
                referral_code=code_obj, referee=other_referee, status="completed"
            )
            credit = RideCredit.objects.create(
                rider=referrer,
                referral=other_referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status="active",
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )
            # Manually update issued_at to be older
            RideCredit.objects.filter(pk=credit.pk).update(issued_at=old_date)

        result = self.service.process_first_ride_credit(ride)

        # Should succeed since old credits are outside the window
        assert result.success is True

    def test_prevents_double_issuance(self):
        """Calling process_first_ride_credit twice should not double-issue."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        # First call succeeds
        result1 = self.service.process_first_ride_credit(ride)
        assert result1.success is True

        # Second call should fail (referral is now completed, not pending)
        result2 = self.service.process_first_ride_credit(ride)
        assert result2.success is False
        assert "No pending referral" in result2.reason

    def test_credits_linked_to_referral(self):
        """Created credits should be linked to the referral."""
        referrer = self._create_user()
        referee = self._create_user()
        referral = self._create_referral(referrer, referee)
        ride = self._make_ride(referee)

        result = self.service.process_first_ride_credit(ride)

        assert result.referrer_credit.referral == referral
        assert result.referee_credit.referral == referral
