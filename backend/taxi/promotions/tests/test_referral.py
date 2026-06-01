"""Unit tests for referral code logic in PromoCodeService."""

from decimal import Decimal

import pytest
from django.test import TestCase

from authapp.models import User
from promotions.models import ReferralCode, ReferralUsage, ReferrerCredit
from promotions.services import PromoCodeService, ReferralResult
from taxi.rides.models import Ride


def create_user(email, **kwargs):
    """Helper to create a user with the custom User model (email as USERNAME_FIELD)."""
    defaults = {
        "first_name": "Test",
        "last_name": "User",
        "user_type": "rider",
    }
    defaults.update(kwargs)
    user = User(email=email, **defaults)
    user.set_password("testpass123")
    user.save()
    return user


@pytest.mark.django_db
class TestGenerateReferralCode(TestCase):
    """Tests for PromoCodeService.generate_referral_code."""

    def setUp(self):
        self.service = PromoCodeService()
        self.rider = create_user("rider@example.com", first_name="Test", last_name="Rider")

    def test_generates_code_and_creates_record(self):
        """Should generate a code string and create a ReferralCode record.

        The signal auto-generates a code on rider creation, so calling
        generate_referral_code again should return the existing code (idempotent).
        """
        code = self.service.generate_referral_code(self.rider)

        assert len(code) == 8
        assert code.isalnum()
        assert code == code.upper()

        # Verify ReferralCode record exists
        referral = ReferralCode.objects.get(rider=self.rider)
        assert referral.code == code

    def test_generates_unique_codes_for_different_riders(self):
        """Should generate different codes for different riders."""
        rider2 = create_user("rider2@example.com", first_name="Test2", last_name="Rider2")

        code1 = self.service.generate_referral_code(self.rider)
        code2 = self.service.generate_referral_code(rider2)

        assert code1 != code2


@pytest.mark.django_db
class TestApplyReferral(TestCase):
    """Tests for PromoCodeService.apply_referral."""

    def setUp(self):
        self.service = PromoCodeService()
        self.referrer = create_user("referrer@example.com", first_name="Referrer", last_name="User")
        self.referee = create_user("referee@example.com", first_name="Referee", last_name="User")
        # The signal auto-creates a referral code for the referrer.
        # Update it to a known value for test predictability.
        self.referral_code = ReferralCode.objects.get(rider=self.referrer)
        self.referral_code.code = "TESTCODE"
        self.referral_code.save()
        self.ride = Ride.objects.create(
            rider=self.referee,
            pickup="Point A",
            destination="Point B",
            fare=Decimal("200.00"),
            status="completed",
        )

    def test_successful_referral_application(self):
        """Should apply referral and create usage/credit records."""
        result = self.service.apply_referral(
            referral_code="TESTCODE",
            referee=self.referee,
            ride=self.ride,
            fare=Decimal("200.00"),
        )

        assert result.success is True
        assert result.referee_discount == Decimal("50.00")
        assert result.referrer_credit == Decimal("50.00")
        assert result.error_code is None

        # Verify ReferralUsage was created
        usage = ReferralUsage.objects.get(referral_code=self.referral_code)
        assert usage.referee == self.referee
        assert usage.ride == self.ride
        assert usage.referee_discount == Decimal("50.00")
        assert usage.referrer_credit == Decimal("50.00")

        # Verify ReferrerCredit was created
        credit = ReferrerCredit.objects.get(referrer=self.referrer)
        assert credit.amount == Decimal("50.00")
        assert credit.is_used is False

    def test_self_referral_rejected(self):
        """Should reject when referee tries to use their own referral code."""
        result = self.service.apply_referral(
            referral_code="TESTCODE",
            referee=self.referrer,  # Same as code owner
            ride=self.ride,
            fare=Decimal("200.00"),
        )

        assert result.success is False
        assert result.error_code == "self_referral"
        assert result.message == "You cannot use your own referral code."

    def test_inactive_referrer_rejected(self):
        """Should reject when referrer is inactive."""
        self.referrer.is_active = False
        self.referrer.save()

        result = self.service.apply_referral(
            referral_code="TESTCODE",
            referee=self.referee,
            ride=self.ride,
            fare=Decimal("200.00"),
        )

        assert result.success is False
        assert result.error_code == "inactive_referrer"
        assert result.message == "This referral code is no longer valid."

    def test_code_not_found(self):
        """Should return error when referral code doesn't exist."""
        result = self.service.apply_referral(
            referral_code="NONEXIST",
            referee=self.referee,
            ride=self.ride,
            fare=Decimal("200.00"),
        )

        assert result.success is False
        assert result.error_code == "code_not_found"

    def test_case_insensitive_lookup(self):
        """Should find referral code regardless of case."""
        result = self.service.apply_referral(
            referral_code="testcode",  # lowercase
            referee=self.referee,
            ride=self.ride,
            fare=Decimal("200.00"),
        )

        assert result.success is True
