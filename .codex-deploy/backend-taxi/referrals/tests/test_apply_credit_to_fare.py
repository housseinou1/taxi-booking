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
    CreditApplicationResult,
    RiderReferralService,
)


@pytest.mark.django_db
class TestApplyCreditToFare:
    """Tests for RiderReferralService.apply_credit_to_fare"""

    def setup_method(self):
        self.service = RiderReferralService()
        RewardConfiguration.objects.filter(is_active=True).update(is_active=False)
        self.config = RewardConfiguration.objects.create(
            rider_referrer_credit=Decimal("50.00"),
            rider_referee_credit=Decimal("25.00"),
            credit_expiration_days=90,
            is_active=True,
        )

    def _create_user(self, is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        return User.objects.create_user(
            email=f"user_{unique}@test.com",
            password="testpass123",
            user_type="rider",
            is_active=is_active,
        )

    def _get_or_create_referral(self, rider):
        """Get or create a referral for a rider (as referee) to link credits to."""
        # Check if rider already has a referral as referee
        try:
            return RiderReferral.objects.get(referee=rider)
        except RiderReferral.DoesNotExist:
            # Create a referrer (use driver type to avoid rider signal auto-creating code)
            referrer = self._create_user()
            # The signal auto-generates a RiderReferralCode for riders, fetch it
            code_obj = RiderReferralCode.objects.get(rider=referrer)
            return RiderReferral.objects.create(
                referral_code=code_obj, referee=rider, status="completed"
            )

    def _create_credit(self, rider, amount, expires_in_days=90, status="active"):
        """Helper to create a RideCredit for testing."""
        referral = self._get_or_create_referral(rider)
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=amount,
            remaining_amount=amount,
            status=status,
            credit_type="referee",
            expires_at=timezone.now() + timedelta(days=expires_in_days),
        )

    def test_returns_credit_application_result(self):
        """Should return a CreditApplicationResult dataclass."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("50.00"))

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert isinstance(result, CreditApplicationResult)

    def test_no_credits_available(self):
        """When rider has no credits, discount should be zero."""
        rider = self._create_user()

        result = self.service.apply_credit_to_fare(rider, Decimal("100.00"))

        assert result.original_fare == Decimal("100.00")
        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("100.00")
        assert result.credits_used == []

    def test_credit_fully_covers_fare(self):
        """When credits exceed the fare, discount equals the fare."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("100.00"))

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.original_fare == Decimal("30.00")
        assert result.discount_applied == Decimal("30.00")
        assert result.final_fare == Decimal("0.00")
        assert len(result.credits_used) == 1

    def test_fare_exceeds_credits(self):
        """When fare exceeds available credits, discount equals credit balance."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("20.00"))

        result = self.service.apply_credit_to_fare(rider, Decimal("50.00"))

        assert result.original_fare == Decimal("50.00")
        assert result.discount_applied == Decimal("20.00")
        assert result.final_fare == Decimal("30.00")
        assert len(result.credits_used) == 1

    def test_final_fare_never_negative(self):
        """Final fare should never be less than zero."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("200.00"))

        result = self.service.apply_credit_to_fare(rider, Decimal("50.00"))

        assert result.final_fare >= Decimal("0.00")
        assert result.final_fare == Decimal("0.00")

    def test_fifo_order_oldest_first(self):
        """Credits should be applied in FIFO order (oldest expiration first)."""
        rider = self._create_user()
        # Create credit expiring soon (should be used first)
        credit_soon = self._create_credit(rider, Decimal("10.00"), expires_in_days=10)
        # Create credit expiring later
        credit_later = self._create_credit(rider, Decimal("10.00"), expires_in_days=60)

        result = self.service.apply_credit_to_fare(rider, Decimal("15.00"))

        assert len(result.credits_used) == 2
        # First credit should be fully used
        credit_soon.refresh_from_db()
        assert credit_soon.remaining_amount == Decimal("0.00")
        assert credit_soon.status == "used"
        # Second credit should be partially used
        credit_later.refresh_from_db()
        assert credit_later.remaining_amount == Decimal("5.00")
        assert credit_later.status == "active"

    def test_credit_fully_consumed_marked_as_used(self):
        """A fully consumed credit should be marked as status='used' with used_at set."""
        rider = self._create_user()
        credit = self._create_credit(rider, Decimal("30.00"))

        self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        credit.refresh_from_db()
        assert credit.remaining_amount == Decimal("0.00")
        assert credit.status == "used"
        assert credit.used_at is not None

    def test_credit_partially_consumed_stays_active(self):
        """A partially consumed credit should remain active."""
        rider = self._create_user()
        credit = self._create_credit(rider, Decimal("50.00"))

        self.service.apply_credit_to_fare(rider, Decimal("20.00"))

        credit.refresh_from_db()
        assert credit.remaining_amount == Decimal("30.00")
        assert credit.status == "active"
        assert credit.used_at is None

    def test_expired_credits_excluded(self):
        """Expired credits should not be applied."""
        rider = self._create_user()
        # Create an expired credit
        self._create_credit(rider, Decimal("50.00"), expires_in_days=-1)

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("30.00")
        assert result.credits_used == []

    def test_revoked_credits_excluded(self):
        """Revoked credits should not be applied."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("50.00"), status="revoked")

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("30.00")
        assert result.credits_used == []

    def test_withheld_credits_excluded(self):
        """Withheld credits should not be applied."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("50.00"), status="withheld")

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("30.00")
        assert result.credits_used == []

    def test_multiple_credits_applied_in_order(self):
        """Multiple credits should be consumed in FIFO order across all."""
        rider = self._create_user()
        c1 = self._create_credit(rider, Decimal("10.00"), expires_in_days=5)
        c2 = self._create_credit(rider, Decimal("15.00"), expires_in_days=20)
        c3 = self._create_credit(rider, Decimal("25.00"), expires_in_days=50)

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.discount_applied == Decimal("30.00")
        assert result.final_fare == Decimal("0.00")
        assert len(result.credits_used) == 3

        c1.refresh_from_db()
        c2.refresh_from_db()
        c3.refresh_from_db()

        # c1: fully consumed
        assert c1.remaining_amount == Decimal("0.00")
        assert c1.status == "used"
        # c2: fully consumed
        assert c2.remaining_amount == Decimal("0.00")
        assert c2.status == "used"
        # c3: partially consumed (5 out of 25 used)
        assert c3.remaining_amount == Decimal("20.00")
        assert c3.status == "active"

    def test_zero_fare(self):
        """A zero fare should result in no discount applied."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("50.00"))

        result = self.service.apply_credit_to_fare(rider, Decimal("0.00"))

        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("0.00")
        assert result.credits_used == []

    def test_used_credits_excluded(self):
        """Already-used credits should not be applied."""
        rider = self._create_user()
        self._create_credit(rider, Decimal("50.00"), status="used")

        result = self.service.apply_credit_to_fare(rider, Decimal("30.00"))

        assert result.discount_applied == Decimal("0.00")
        assert result.final_fare == Decimal("30.00")
        assert result.credits_used == []
