"""
Integration tests for the full promo code flow.

Tests end-to-end scenarios:
- Code validation → ride request → ride complete → usage recorded → payment adjusted
- Payment record contains correct discount_amount
- Driver earning is calculated from original_fare (not final_fare)
- Concurrent redemption with usage limits (select_for_update prevents over-redemption)
- Referral flow: new user → first ride with referral → both parties credited

Validates: Requirements 4.1, 4.4, 8.5, 8.6, 8.7
"""

from decimal import Decimal
from datetime import timedelta

import pytest
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from payments.models import Payment
from promotions.models import (
    PromoCode,
    PromoCodeUsage,
    ReferralCode,
    ReferralUsage,
    ReferrerCredit,
)
from promotions.services import PromoCodeService
from taxi.rides.models import Ride


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def create_user(email, user_type="rider", is_staff=False, **kwargs):
    """Create a test user."""
    defaults = {
        "first_name": "Test",
        "last_name": "User",
        "user_type": user_type,
        "is_staff": is_staff,
    }
    defaults.update(kwargs)
    user = User(email=email, **defaults)
    user.set_password("testpass123")
    user.save()
    return user


def create_promo_code(code="SAVE20", discount_type="percentage", discount_value=Decimal("20.00"), **kwargs):
    """Create a promo code with sensible defaults."""
    now = timezone.now()
    defaults = {
        "code": code,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "start_date": now - timedelta(days=1),
        "end_date": now + timedelta(days=30),
        "status": "active",
        "min_fare": Decimal("0"),
    }
    defaults.update(kwargs)
    return PromoCode.objects.create(**defaults)


def create_ride(rider, fare=Decimal("500.00"), status="completed", **kwargs):
    """Create a test ride."""
    defaults = {
        "rider": rider,
        "pickup": "Sebkha",
        "destination": "Toujounine",
        "fare": fare,
        "status": status,
    }
    defaults.update(kwargs)
    return Ride.objects.create(**defaults)


# ---------------------------------------------------------------------------
# Integration Tests: Full Promo Code Flow
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFullPromoCodeFlow(TestCase):
    """
    Test the complete promo code lifecycle:
    validate → ride request → ride complete → apply → usage recorded → payment adjusted.
    """

    def setUp(self):
        self.service = PromoCodeService()
        self.rider = create_user("rider@test.com")
        self.driver = create_user("driver@test.com", user_type="driver")
        self.promo = create_promo_code(
            code="WELCOME20",
            discount_type="percentage",
            discount_value=Decimal("20.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.rider)

    def test_full_flow_percentage_discount(self):
        """
        End-to-end: validate code → create ride → apply code → verify usage and payment.
        Validates: Requirements 4.1, 4.4, 8.5, 8.6
        """
        # Step 1: Validate the promo code with estimated fare
        response = self.client.post(
            "/promotions/validate/",
            {"code": "WELCOME20", "estimated_fare": "500.00"},
            format="json",
        )
        assert response.status_code == 200
        data = response.data
        assert data["valid"] is True
        assert Decimal(str(data["discount_amount"])) == Decimal("100.00")
        assert Decimal(str(data["final_fare"])) == Decimal("400.00")
        assert data["discount_type"] == "percentage"

        # Step 2: Create a ride (simulating ride request and completion)
        ride = create_ride(self.rider, fare=Decimal("500.00"), status="completed")

        # Step 3: Apply the promo code to the completed ride
        response = self.client.post(
            "/promotions/apply/",
            {"code": "WELCOME20", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        data = response.data
        assert data["success"] is True
        assert Decimal(str(data["original_fare"])) == Decimal("500.00")
        assert Decimal(str(data["discount_amount"])) == Decimal("100.00")
        assert Decimal(str(data["final_fare"])) == Decimal("400.00")

        # Step 4: Verify usage record was created
        usage = PromoCodeUsage.objects.get(promo_code=self.promo, rider=self.rider)
        assert usage.original_fare == Decimal("500.00")
        assert usage.discount_amount == Decimal("100.00")
        assert usage.final_fare == Decimal("400.00")
        assert usage.ride == ride

        # Step 5: Verify payment was created with correct discount_amount
        payment = Payment.objects.get(ride_id=ride.id)
        assert payment.discount_amount == Decimal("100.00")
        assert payment.status == "authorized"

    def test_full_flow_fixed_discount(self):
        """
        End-to-end with fixed amount discount.
        Validates: Requirements 4.1, 4.4, 8.5, 8.6
        """
        promo = create_promo_code(
            code="FLAT100",
            discount_type="fixed",
            discount_value=Decimal("100.00"),
        )

        # Validate
        response = self.client.post(
            "/promotions/validate/",
            {"code": "FLAT100", "estimated_fare": "500.00"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["valid"] is True
        assert Decimal(str(response.data["discount_amount"])) == Decimal("100.00")

        # Create ride and apply
        ride = create_ride(self.rider, fare=Decimal("500.00"), status="completed")
        response = self.client.post(
            "/promotions/apply/",
            {"code": "FLAT100", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True
        assert Decimal(str(response.data["discount_amount"])) == Decimal("100.00")
        assert Decimal(str(response.data["final_fare"])) == Decimal("400.00")

        # Verify payment
        payment = Payment.objects.get(ride_id=ride.id)
        assert payment.discount_amount == Decimal("100.00")
        # Rider is charged the final fare (400)
        assert payment.amount == Decimal("400.00")

    def test_full_flow_free_ride(self):
        """
        End-to-end with free ride discount.
        Validates: Requirements 1.5, 4.1, 4.4, 8.5, 8.6
        """
        promo = create_promo_code(
            code="FREERIDE",
            discount_type="free_ride",
            discount_value=Decimal("0"),
        )

        # Validate
        response = self.client.post(
            "/promotions/validate/",
            {"code": "FREERIDE", "estimated_fare": "300.00"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["valid"] is True
        assert Decimal(str(response.data["discount_amount"])) == Decimal("300.00")
        assert Decimal(str(response.data["final_fare"])) == Decimal("0.00")

        # Create ride and apply
        ride = create_ride(self.rider, fare=Decimal("300.00"), status="completed")
        response = self.client.post(
            "/promotions/apply/",
            {"code": "FREERIDE", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True
        assert Decimal(str(response.data["discount_amount"])) == Decimal("300.00")
        assert Decimal(str(response.data["final_fare"])) == Decimal("0.00")

        # Verify payment - rider pays nothing
        payment = Payment.objects.get(ride_id=ride.id)
        assert payment.discount_amount == Decimal("300.00")
        assert payment.amount == Decimal("0.00")


# ---------------------------------------------------------------------------
# Integration Tests: Payment Record Verification
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPaymentDiscountIntegration(TestCase):
    """
    Test that the Payment record contains the correct discount_amount
    and that driver_earning is calculated from original_fare.
    Validates: Requirements 8.5, 8.6, 8.7
    """

    def setUp(self):
        self.rider = create_user("rider@test.com")
        self.promo = create_promo_code(
            code="HALF50",
            discount_type="percentage",
            discount_value=Decimal("50.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.rider)

    def test_payment_contains_correct_discount_amount(self):
        """
        Payment.discount_amount should equal the promo discount applied.
        Validates: Requirements 8.6
        """
        ride = create_ride(self.rider, fare=Decimal("1000.00"), status="completed")

        response = self.client.post(
            "/promotions/apply/",
            {"code": "HALF50", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True

        payment = Payment.objects.get(ride_id=ride.id)
        assert payment.discount_amount == Decimal("500.00")

    def test_driver_earning_based_on_original_fare(self):
        """
        Driver earning must be calculated from the original fare, not the discounted fare.
        Validates: Requirements 8.7
        """
        original_fare = Decimal("1000.00")
        ride = create_ride(self.rider, fare=original_fare, status="completed")

        response = self.client.post(
            "/promotions/apply/",
            {"code": "HALF50", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True

        payment = Payment.objects.get(ride_id=ride.id)

        # Driver earning should be based on original_fare (1000), not final_fare (500)
        # driver_earning = original_fare - app_fee + tip_amount
        # With 30% app fee: app_fee = 1000 * 0.30 = 300
        # driver_earning = 1000 - 300 + 0 = 700
        assert payment.driver_earning == original_fare - payment.app_fee

        # Verify the ride model also has the correct driver_earning
        ride.refresh_from_db()
        assert ride.driver_earning == payment.driver_earning

        # Crucially, driver_earning should NOT be based on the discounted fare
        discounted_fare = Decimal("500.00")
        # If it were based on discounted fare, it would be 500 - (500*0.30) = 350
        # But it should be 1000 - (1000*0.30) = 700
        assert payment.driver_earning > discounted_fare

    def test_rider_charged_final_fare_not_original(self):
        """
        The payment amount (what rider pays) should be the final fare after discount.
        Validates: Requirements 8.5
        """
        ride = create_ride(self.rider, fare=Decimal("800.00"), status="completed")

        response = self.client.post(
            "/promotions/apply/",
            {"code": "HALF50", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200

        payment = Payment.objects.get(ride_id=ride.id)
        # Rider should be charged 400 (800 - 50% discount)
        assert payment.amount == Decimal("400.00")
        # But discount_amount is recorded for audit
        assert payment.discount_amount == Decimal("400.00")


# ---------------------------------------------------------------------------
# Integration Tests: Concurrent Redemption with Usage Limits
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConcurrentRedemption(TestCase):
    """
    Test that usage limits are enforced correctly under sequential redemption attempts.
    The service uses select_for_update() to prevent over-redemption; SQLite doesn't
    support true concurrent transactions, so we verify the logic sequentially.
    Validates: Requirements 2.5 (usage limit enforcement)
    """

    def test_total_usage_limit_enforced(self):
        """
        After max_total_uses redemptions, subsequent attempts are rejected.
        Verifies select_for_update logic prevents over-redemption.
        """
        promo = create_promo_code(
            code="ONEUSE",
            discount_type="fixed",
            discount_value=Decimal("50.00"),
            max_total_uses=2,
        )

        service = PromoCodeService()

        # First redemption - should succeed
        rider1 = create_user("rider1@test.com")
        ride1 = create_ride(rider1, fare=Decimal("200.00"), status="completed")
        result1 = service.apply_code("ONEUSE", rider1, ride1, Decimal("200.00"))
        assert result1.success is True

        # Second redemption - should succeed (limit is 2)
        rider2 = create_user("rider2@test.com")
        ride2 = create_ride(rider2, fare=Decimal("200.00"), status="completed")
        result2 = service.apply_code("ONEUSE", rider2, ride2, Decimal("200.00"))
        assert result2.success is True

        # Third redemption - should fail (limit reached)
        rider3 = create_user("rider3@test.com")
        ride3 = create_ride(rider3, fare=Decimal("200.00"), status="completed")
        result3 = service.apply_code("ONEUSE", rider3, ride3, Decimal("200.00"))
        assert result3.success is False
        assert result3.error_code == "total_limit_reached"

        # Verify exactly 2 usage records exist
        assert PromoCodeUsage.objects.filter(promo_code=promo).count() == 2

    def test_per_rider_usage_limit_enforced(self):
        """
        After max_per_rider_uses redemptions by the same rider, subsequent attempts
        by that rider are rejected while other riders can still redeem.
        """
        promo = create_promo_code(
            code="ONCEPERUSER",
            discount_type="fixed",
            discount_value=Decimal("30.00"),
            max_per_rider_uses=1,
        )

        service = PromoCodeService()
        rider = create_user("limited_rider@test.com")

        # First redemption - should succeed
        ride1 = create_ride(rider, fare=Decimal("200.00"), status="completed")
        result1 = service.apply_code("ONCEPERUSER", rider, ride1, Decimal("200.00"))
        assert result1.success is True

        # Second redemption by same rider - should fail
        ride2 = create_ride(rider, fare=Decimal("200.00"), status="completed")
        result2 = service.apply_code("ONCEPERUSER", rider, ride2, Decimal("200.00"))
        assert result2.success is False
        assert result2.error_code == "rider_limit_reached"

        # Another rider can still redeem
        other_rider = create_user("other_rider@test.com")
        ride3 = create_ride(other_rider, fare=Decimal("200.00"), status="completed")
        result3 = service.apply_code("ONCEPERUSER", other_rider, ride3, Decimal("200.00"))
        assert result3.success is True

        # Verify usage records
        assert PromoCodeUsage.objects.filter(promo_code=promo, rider=rider).count() == 1
        assert PromoCodeUsage.objects.filter(promo_code=promo, rider=other_rider).count() == 1

    def test_select_for_update_used_in_apply(self):
        """
        Verify that apply_code uses select_for_update by checking that the code
        is re-validated at apply time (not just at validate time).
        """
        promo = create_promo_code(
            code="RACECHECK",
            discount_type="fixed",
            discount_value=Decimal("25.00"),
            max_total_uses=1,
        )

        service = PromoCodeService()
        rider = create_user("racer@test.com")

        # Validate succeeds (code is available)
        validate_result = service.validate_code("RACECHECK", rider, Decimal("100.00"))
        assert validate_result.valid is True

        # Another rider redeems in between
        other_rider = create_user("other_racer@test.com")
        other_ride = create_ride(other_rider, fare=Decimal("100.00"), status="completed")
        service.apply_code("RACECHECK", other_rider, other_ride, Decimal("100.00"))

        # Now the first rider tries to apply - should fail because limit is reached
        ride = create_ride(rider, fare=Decimal("100.00"), status="completed")
        apply_result = service.apply_code("RACECHECK", rider, ride, Decimal("100.00"))
        assert apply_result.success is False
        assert apply_result.error_code == "total_limit_reached"


# ---------------------------------------------------------------------------
# Integration Tests: Referral Flow
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReferralFlowIntegration(TestCase):
    """
    Test the referral flow end-to-end:
    new user → first ride with referral → both parties credited.
    Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7
    """

    def setUp(self):
        self.service = PromoCodeService()
        # Existing rider (referrer) - signal auto-generates a referral code
        self.referrer = create_user("referrer@test.com")
        # Get the auto-generated referral code
        self.referral_code = ReferralCode.objects.get(rider=self.referrer)
        # New rider (referee) - no completed rides
        self.referee = create_user("newuser@test.com", first_name="New", last_name="User")
        self.client = APIClient()

    def test_full_referral_flow(self):
        """
        New user applies referral code on first ride → both parties credited.
        Validates: Requirements 7.4, 7.5, 7.6
        """
        # Step 1: New user's first ride
        ride = create_ride(self.referee, fare=Decimal("400.00"), status="completed")

        # Step 2: Apply referral code
        result = self.service.apply_referral(
            referral_code=self.referral_code.code,
            referee=self.referee,
            ride=ride,
            fare=Decimal("400.00"),
        )

        assert result.success is True
        assert result.referee_discount == Decimal("50.00")
        assert result.referrer_credit == Decimal("50.00")

        # Step 3: Verify ReferralUsage record
        usage = ReferralUsage.objects.get(
            referral_code=self.referral_code, referee=self.referee
        )
        assert usage.ride == ride
        assert usage.referee_discount == Decimal("50.00")
        assert usage.referrer_credit == Decimal("50.00")

        # Step 4: Verify ReferrerCredit for the referrer
        credit = ReferrerCredit.objects.get(referrer=self.referrer)
        assert credit.amount == Decimal("50.00")
        assert credit.is_used is False
        assert credit.used_on_ride is None

    def test_referral_code_retrieval_via_api(self):
        """
        Rider can retrieve their referral code via the API.
        Validates: Requirements 7.2
        """
        self.client.force_authenticate(user=self.referrer)
        response = self.client.get("/promotions/referral/")
        assert response.status_code == 200
        assert response.data["code"] == self.referral_code.code

    def test_self_referral_rejected(self):
        """
        A rider cannot use their own referral code.
        Validates: Requirements 7.7
        """
        ride = create_ride(self.referrer, fare=Decimal("400.00"), status="completed")

        result = self.service.apply_referral(
            referral_code=self.referral_code.code,
            referee=self.referrer,  # Same as code owner
            ride=ride,
            fare=Decimal("400.00"),
        )

        assert result.success is False
        assert result.error_code == "self_referral"
        assert result.message == "You cannot use your own referral code."

        # No referral usage records should be created
        assert ReferralUsage.objects.count() == 0
        assert ReferrerCredit.objects.count() == 0

    def test_inactive_referrer_rejected(self):
        """
        Referral code from an inactive user is rejected.
        Validates: Requirements 7.3
        """
        self.referrer.is_active = False
        self.referrer.save()

        ride = create_ride(self.referee, fare=Decimal("400.00"), status="completed")

        result = self.service.apply_referral(
            referral_code=self.referral_code.code,
            referee=self.referee,
            ride=ride,
            fare=Decimal("400.00"),
        )

        assert result.success is False
        assert result.error_code == "inactive_referrer"

        # No referral usage records should be created
        assert ReferralUsage.objects.count() == 0
        assert ReferrerCredit.objects.count() == 0

    def test_referral_auto_generation_on_rider_creation(self):
        """
        New rider gets a referral code auto-generated via signal on creation.
        Validates: Requirements 7.1
        """
        new_rider = create_user("brand_new@test.com")

        # Signal should have auto-generated a referral code
        assert ReferralCode.objects.filter(rider=new_rider).exists()
        referral = ReferralCode.objects.get(rider=new_rider)
        assert len(referral.code) == 8
        assert referral.code.isalnum()

    def test_referral_code_retrieval_via_api_for_new_rider(self):
        """
        New rider can retrieve their auto-generated referral code via the API.
        Validates: Requirements 7.1, 7.2
        """
        new_rider = create_user("api_new@test.com")
        self.client.force_authenticate(user=new_rider)

        response = self.client.get("/promotions/referral/")
        assert response.status_code == 200
        assert "code" in response.data
        assert len(response.data["code"]) == 8

        # Should match the auto-generated code
        referral = ReferralCode.objects.get(rider=new_rider)
        assert response.data["code"] == referral.code


# ---------------------------------------------------------------------------
# Integration Tests: Edge Cases and Error Handling
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPromoCodeEdgeCases(TestCase):
    """Test edge cases in the promo code integration flow."""

    def setUp(self):
        self.rider = create_user("rider@test.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.rider)

    def test_apply_to_nonexistent_ride_returns_404(self):
        """Applying a code to a ride that doesn't exist returns 404."""
        create_promo_code(code="VALID10", discount_type="percentage", discount_value=Decimal("10.00"))

        response = self.client.post(
            "/promotions/apply/",
            {"code": "VALID10", "ride_id": 99999},
            format="json",
        )
        assert response.status_code == 404

    def test_apply_to_another_riders_ride_returns_404(self):
        """Applying a code to a ride belonging to another rider returns 404."""
        other_rider = create_user("other@test.com")
        ride = create_ride(other_rider, fare=Decimal("300.00"), status="completed")
        create_promo_code(code="VALID10", discount_type="percentage", discount_value=Decimal("10.00"))

        response = self.client.post(
            "/promotions/apply/",
            {"code": "VALID10", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 404

    def test_validate_invalid_code_returns_error_in_response(self):
        """Validating a non-existent code returns 200 with valid=False."""
        response = self.client.post(
            "/promotions/validate/",
            {"code": "DOESNOTEXIST", "estimated_fare": "100.00"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["valid"] is False
        assert response.data["error_code"] == "code_not_found"
        assert Decimal(str(response.data["discount_amount"])) == Decimal("0")

    def test_validate_expired_code_returns_error(self):
        """Validating an expired code returns appropriate error."""
        create_promo_code(
            code="EXPIRED",
            discount_type="percentage",
            discount_value=Decimal("10.00"),
            end_date=timezone.now() - timedelta(days=1),
        )

        response = self.client.post(
            "/promotions/validate/",
            {"code": "EXPIRED", "estimated_fare": "100.00"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["valid"] is False
        assert response.data["error_code"] == "code_expired"

    def test_fixed_discount_capped_at_fare(self):
        """Fixed discount exceeding fare is capped at the fare amount."""
        create_promo_code(
            code="BIG500",
            discount_type="fixed",
            discount_value=Decimal("500.00"),
        )

        ride = create_ride(self.rider, fare=Decimal("200.00"), status="completed")

        response = self.client.post(
            "/promotions/apply/",
            {"code": "BIG500", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True
        # Discount capped at fare
        assert Decimal(str(response.data["discount_amount"])) == Decimal("200.00")
        assert Decimal(str(response.data["final_fare"])) == Decimal("0.00")

        # Payment should reflect zero charge
        payment = Payment.objects.get(ride_id=ride.id)
        assert payment.amount == Decimal("0.00")
        assert payment.discount_amount == Decimal("200.00")

    def test_usage_recorded_after_successful_apply(self):
        """Verify that a PromoCodeUsage record is created after successful apply."""
        promo = create_promo_code(
            code="TRACK",
            discount_type="fixed",
            discount_value=Decimal("25.00"),
        )

        ride = create_ride(self.rider, fare=Decimal("100.00"), status="completed")

        assert PromoCodeUsage.objects.count() == 0

        response = self.client.post(
            "/promotions/apply/",
            {"code": "TRACK", "ride_id": ride.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["success"] is True

        assert PromoCodeUsage.objects.count() == 1
        usage = PromoCodeUsage.objects.first()
        assert usage.promo_code == promo
        assert usage.rider == self.rider
        assert usage.ride == ride
        assert usage.original_fare == Decimal("100.00")
        assert usage.discount_amount == Decimal("25.00")
        assert usage.final_fare == Decimal("75.00")
