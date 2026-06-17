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
from referrals.services.rider_referral_service import RiderReferralService


@pytest.mark.django_db
class TestRevokeCreditForRide:
    """Tests for RiderReferralService.revoke_credits_for_ride"""

    def setup_method(self):
        self.service = RiderReferralService()
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

    def _get_or_create_referral_code(self, rider):
        """Get the auto-generated referral code for a rider (created by signal)."""
        try:
            return RiderReferralCode.objects.get(rider=rider)
        except RiderReferralCode.DoesNotExist:
            return RiderReferralCode.objects.create(
                rider=rider, code=secrets.token_hex(4)[:8].upper()
            )

    def _create_completed_referral_with_credits(self, referrer, referee):
        """Create a completed referral with active credits for both parties."""
        code_obj = self._get_or_create_referral_code(referrer)
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
            completed_at=timezone.now(),
        )
        expires_at = timezone.now() + timedelta(days=90)
        referrer_credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("50.00"),
            status="active",
            credit_type="referrer",
            expires_at=expires_at,
        )
        referee_credit = RideCredit.objects.create(
            rider=referee,
            referral=referral,
            original_amount=Decimal("25.00"),
            remaining_amount=Decimal("25.00"),
            status="active",
            credit_type="referee",
            expires_at=expires_at,
        )
        return referral, referrer_credit, referee_credit

    def _make_ride(self, rider):
        """Create a mock ride object with a rider attribute."""
        ride = MagicMock()
        ride.rider = rider
        return ride

    def test_revokes_both_credits(self):
        """Should revoke credits for both referrer and referee."""
        referrer = self._create_user()
        referee = self._create_user()
        referral, referrer_credit, referee_credit = (
            self._create_completed_referral_with_credits(referrer, referee)
        )
        ride = self._make_ride(referee)

        count = self.service.revoke_credits_for_ride(ride)

        assert count == 2
        referrer_credit.refresh_from_db()
        referee_credit.refresh_from_db()
        assert referrer_credit.status == "revoked"
        assert referee_credit.status == "revoked"

    def test_sets_remaining_amount_to_zero(self):
        """Should set remaining_amount to zero on revoked credits."""
        referrer = self._create_user()
        referee = self._create_user()
        referral, referrer_credit, referee_credit = (
            self._create_completed_referral_with_credits(referrer, referee)
        )
        ride = self._make_ride(referee)

        self.service.revoke_credits_for_ride(ride)

        referrer_credit.refresh_from_db()
        referee_credit.refresh_from_db()
        assert referrer_credit.remaining_amount == Decimal("0.00")
        assert referee_credit.remaining_amount == Decimal("0.00")

    def test_sets_revoked_at_timestamp(self):
        """Should set revoked_at timestamp on revoked credits."""
        referrer = self._create_user()
        referee = self._create_user()
        referral, referrer_credit, referee_credit = (
            self._create_completed_referral_with_credits(referrer, referee)
        )
        ride = self._make_ride(referee)

        before = timezone.now()
        self.service.revoke_credits_for_ride(ride)
        after = timezone.now()

        referrer_credit.refresh_from_db()
        referee_credit.refresh_from_db()
        assert referrer_credit.revoked_at is not None
        assert before <= referrer_credit.revoked_at <= after
        assert referee_credit.revoked_at is not None
        assert before <= referee_credit.revoked_at <= after

    def test_updates_referral_status_to_revoked(self):
        """Should update the referral status to 'revoked'."""
        referrer = self._create_user()
        referee = self._create_user()
        referral, _, _ = self._create_completed_referral_with_credits(
            referrer, referee
        )
        ride = self._make_ride(referee)

        self.service.revoke_credits_for_ride(ride)

        referral.refresh_from_db()
        assert referral.status == "revoked"

    def test_returns_zero_when_no_completed_referral(self):
        """Should return 0 when no completed referral exists for the rider."""
        rider = self._create_user()
        ride = self._make_ride(rider)

        count = self.service.revoke_credits_for_ride(ride)

        assert count == 0

    def test_does_not_affect_pending_referral(self):
        """Should not revoke if the referral is still in pending status."""
        referrer = self._create_user()
        referee = self._create_user()
        code_obj = self._get_or_create_referral_code(referrer)
        RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="pending",
        )
        ride = self._make_ride(referee)

        count = self.service.revoke_credits_for_ride(ride)

        assert count == 0

    def test_revokes_partially_used_credits(self):
        """Should revoke credits even if they have been partially used."""
        referrer = self._create_user()
        referee = self._create_user()
        code_obj = self._get_or_create_referral_code(referrer)
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
            completed_at=timezone.now(),
        )
        expires_at = timezone.now() + timedelta(days=90)
        referrer_credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("30.00"),  # Partially used
            status="active",
            credit_type="referrer",
            expires_at=expires_at,
        )
        ride = self._make_ride(referee)

        count = self.service.revoke_credits_for_ride(ride)

        assert count == 1
        referrer_credit.refresh_from_db()
        assert referrer_credit.status == "revoked"
        assert referrer_credit.remaining_amount == Decimal("0.00")

    def test_idempotent_second_call_returns_zero(self):
        """Calling revoke twice should return 0 on the second call."""
        referrer = self._create_user()
        referee = self._create_user()
        self._create_completed_referral_with_credits(referrer, referee)
        ride = self._make_ride(referee)

        # First call revokes
        count1 = self.service.revoke_credits_for_ride(ride)
        assert count1 == 2

        # Second call finds no completed referral (it's now revoked)
        count2 = self.service.revoke_credits_for_ride(ride)
        assert count2 == 0
