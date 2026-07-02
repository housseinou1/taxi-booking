"""Unit tests for validate_code and apply_code methods in PromoCodeService."""

from decimal import Decimal
from datetime import timedelta

import pytest
from django.test import TestCase
from django.utils import timezone

from authapp.models import User
from promotions.models import PromoCode, PromoCodeUsage
from promotions.services import PromoCodeService, ValidationResult, ApplicationResult
from taxi.rides.models import Ride


def create_user(email, **kwargs):
    """Helper to create a user with the custom User model."""
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


def create_promo_code(**kwargs):
    """Helper to create a PromoCode with sensible defaults."""
    now = timezone.now()
    defaults = {
        "code": "TESTCODE",
        "discount_type": "percentage",
        "discount_value": Decimal("20.00"),
        "start_date": now - timedelta(days=1),
        "end_date": now + timedelta(days=30),
        "status": "active",
        "min_fare": Decimal("0"),
    }
    defaults.update(kwargs)
    return PromoCode.objects.create(**defaults)


@pytest.mark.django_db
class TestValidateCode(TestCase):
    """Tests for PromoCodeService.validate_code."""

    def setUp(self):
        self.service = PromoCodeService()
        self.rider = create_user("rider@example.com")
        self.promo = create_promo_code()

    def test_valid_code_returns_discount_preview(self):
        """Should return valid=True with calculated discount and final fare."""
        result = self.service.validate_code("TESTCODE", self.rider, Decimal("100.00"))

        assert result.valid is True
        assert result.discount_amount == Decimal("20.00")
        assert result.final_fare == Decimal("80.00")
        assert result.discount_type == "percentage"
        assert result.error_code is None
        assert result.message is None

    def test_code_not_found_returns_error(self):
        """Should return error when code doesn't exist."""
        result = self.service.validate_code("NONEXIST", self.rider, Decimal("100.00"))

        assert result.valid is False
        assert result.discount_amount == Decimal("0")
        assert result.final_fare == Decimal("100.00")
        assert result.error_code == "code_not_found"
        assert result.message == "Promo code not found."

    def test_case_insensitive_lookup(self):
        """Should find code regardless of case."""
        result = self.service.validate_code("testcode", self.rider, Decimal("100.00"))

        assert result.valid is True
        assert result.discount_amount == Decimal("20.00")

    def test_inactive_code_returns_error(self):
        """Should return error when code is inactive."""
        self.promo.status = "inactive"
        self.promo.save()

        result = self.service.validate_code("TESTCODE", self.rider, Decimal("100.00"))

        assert result.valid is False
        assert result.discount_amount == Decimal("0")
        assert result.error_code == "code_inactive"

    def test_expired_code_returns_error(self):
        """Should return error when code has expired."""
        self.promo.end_date = timezone.now() - timedelta(days=1)
        self.promo.save()

        result = self.service.validate_code("TESTCODE", self.rider, Decimal("100.00"))

        assert result.valid is False
        assert result.discount_amount == Decimal("0")
        assert result.error_code == "code_expired"

    def test_min_fare_not_met_returns_error(self):
        """Should return error when fare is below minimum."""
        self.promo.min_fare = Decimal("200.00")
        self.promo.save()

        result = self.service.validate_code("TESTCODE", self.rider, Decimal("100.00"))

        assert result.valid is False
        assert result.discount_amount == Decimal("0")
        assert result.error_code == "min_fare_not_met"

    def test_fixed_discount_type(self):
        """Should correctly calculate fixed discount."""
        promo = create_promo_code(
            code="FIXED50",
            discount_type="fixed",
            discount_value=Decimal("50.00"),
        )

        result = self.service.validate_code("FIXED50", self.rider, Decimal("100.00"))

        assert result.valid is True
        assert result.discount_amount == Decimal("50.00")
        assert result.final_fare == Decimal("50.00")
        assert result.discount_type == "fixed"

    def test_free_ride_discount_type(self):
        """Should return full fare as discount for free ride."""
        promo = create_promo_code(
            code="FREERIDE",
            discount_type="free_ride",
            discount_value=Decimal("0"),
        )

        result = self.service.validate_code("FREERIDE", self.rider, Decimal("150.00"))

        assert result.valid is True
        assert result.discount_amount == Decimal("150.00")
        assert result.final_fare == Decimal("0.00")
        assert result.discount_type == "free_ride"


@pytest.mark.django_db
class TestApplyCode(TestCase):
    """Tests for PromoCodeService.apply_code."""

    def setUp(self):
        self.service = PromoCodeService()
        self.rider = create_user("rider@example.com")
        self.promo = create_promo_code()
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Point A",
            destination="Point B",
            fare=Decimal("100.00"),
            status="completed",
        )

    def test_successful_application_creates_usage_record(self):
        """Should apply code, create usage record, and return success."""
        result = self.service.apply_code(
            "TESTCODE", self.rider, self.ride, Decimal("100.00")
        )

        assert result.success is True
        assert result.original_fare == Decimal("100.00")
        assert result.discount_amount == Decimal("20.00")
        assert result.final_fare == Decimal("80.00")
        assert result.error_code is None

        # Verify usage record was created
        usage = PromoCodeUsage.objects.get(promo_code=self.promo, rider=self.rider)
        assert usage.original_fare == Decimal("100.00")
        assert usage.discount_amount == Decimal("20.00")
        assert usage.final_fare == Decimal("80.00")
        assert usage.ride == self.ride

    def test_code_not_found_returns_error(self):
        """Should return error when code doesn't exist."""
        result = self.service.apply_code(
            "NONEXIST", self.rider, self.ride, Decimal("100.00")
        )

        assert result.success is False
        assert result.original_fare == Decimal("100.00")
        assert result.discount_amount == Decimal("0")
        assert result.final_fare == Decimal("100.00")
        assert result.error_code == "code_not_found"

    def test_case_insensitive_lookup(self):
        """Should find code regardless of case."""
        result = self.service.apply_code(
            "testcode", self.rider, self.ride, Decimal("100.00")
        )

        assert result.success is True

    def test_inactive_code_returns_error(self):
        """Should return error when code is inactive at apply time."""
        self.promo.status = "inactive"
        self.promo.save()

        result = self.service.apply_code(
            "TESTCODE", self.rider, self.ride, Decimal("100.00")
        )

        assert result.success is False
        assert result.discount_amount == Decimal("0")
        assert result.error_code == "code_inactive"

    def test_usage_limit_enforced_at_apply_time(self):
        """Should reject when total usage limit is reached at apply time."""
        self.promo.max_total_uses = 1
        self.promo.save()

        # Create an existing usage
        other_rider = create_user("other@example.com")
        other_ride = Ride.objects.create(
            rider=other_rider,
            pickup="Point C",
            destination="Point D",
            fare=Decimal("100.00"),
            status="completed",
        )
        PromoCodeUsage.objects.create(
            promo_code=self.promo,
            rider=other_rider,
            ride=other_ride,
            original_fare=Decimal("100.00"),
            discount_amount=Decimal("20.00"),
            final_fare=Decimal("80.00"),
        )

        result = self.service.apply_code(
            "TESTCODE", self.rider, self.ride, Decimal("100.00")
        )

        assert result.success is False
        assert result.error_code == "total_limit_reached"

    def test_first_ride_only_sets_flag(self):
        """Should set is_first_ride=True on usage record for first-ride-only codes."""
        self.promo.first_ride_only = True
        self.promo.save()

        # Use a new rider with no completed rides
        new_rider = create_user("newrider@example.com", first_name="New", last_name="Rider")
        # Create a ride for this new rider that is NOT completed (so they have zero completed rides)
        ride = Ride.objects.create(
            rider=new_rider,
            pickup="Point A",
            destination="Point B",
            fare=Decimal("100.00"),
            status="in_progress",
        )

        result = self.service.apply_code(
            "TESTCODE", new_rider, ride, Decimal("100.00")
        )

        assert result.success is True
        usage = PromoCodeUsage.objects.get(promo_code=self.promo, rider=new_rider)
        assert usage.is_first_ride is True
