import secrets
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from referrals.models import (
    DriverBonus,
    DriverReferral,
    DriverReferralCode,
    FlaggedReferral,
    RewardConfiguration,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)
from referrals.services.fraud_detection_service import FraudDetectionService


@pytest.mark.django_db
class TestApproveReferral:
    """Tests for FraudDetectionService.approve_referral"""

    def setup_method(self):
        self.service = FraudDetectionService()
        RewardConfiguration.objects.filter(is_active=True).update(is_active=False)
        self.config = RewardConfiguration.objects.create(
            rider_referrer_credit=Decimal("50.00"),
            rider_referee_credit=Decimal("25.00"),
            credit_expiration_days=90,
            is_active=True,
        )

    def _create_user(self, user_type="rider", is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"{user_type}_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
            is_active=is_active,
        )
        return user

    def _create_flagged_rider_referral(self, referrer, referee, status="pending"):
        """Create a flagged rider referral with withheld credits."""
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="flagged",
        )
        flagged = FlaggedReferral.objects.create(
            rider_referral=referral,
            referrer=referrer,
            referee=referee,
            reason="device_abuse",
            status=status,
        )
        return flagged, referral

    def test_approve_sets_status_to_approved(self):
        """Approving a flagged referral sets status to 'approved'."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)

        self.service.approve_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.status == "approved"

    def test_approve_sets_resolved_at_and_resolved_by(self):
        """Approving sets resolved_at and resolved_by fields."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)

        self.service.approve_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.resolved_at is not None
        assert flagged.resolved_by == admin

    def test_approve_releases_withheld_credits(self):
        """Approving releases withheld RideCredits back to active with original amount."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        # Create withheld credits
        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("0.00"),
            status="withheld",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.service.approve_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.status == "active"
        assert credit.remaining_amount == Decimal("50.00")

    def test_approve_restores_remaining_to_original_amount(self):
        """Approving restores remaining_amount to original_amount."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("75.00"),
            remaining_amount=Decimal("10.00"),
            status="withheld",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.service.approve_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.remaining_amount == Decimal("75.00")

    def test_approve_releases_multiple_withheld_credits(self):
        """Approving releases all withheld credits for the referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credits = []
        for i in range(3):
            credit = RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("0.00"),
                status="withheld",
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )
            credits.append(credit)

        self.service.approve_referral(flagged.pk, admin)

        for credit in credits:
            credit.refresh_from_db()
            assert credit.status == "active"
            assert credit.remaining_amount == Decimal("50.00")

    def test_approve_works_for_escalated_status(self):
        """Approving also works for flagged referrals with 'escalated' status."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(
            referrer, referee, status="escalated"
        )

        self.service.approve_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.status == "approved"

    def test_approve_raises_value_error_for_already_approved(self):
        """Cannot approve an already approved flagged referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)
        flagged.status = "approved"
        flagged.save()

        with pytest.raises(ValueError):
            self.service.approve_referral(flagged.pk, admin)

    def test_approve_raises_value_error_for_already_rejected(self):
        """Cannot approve an already rejected flagged referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)
        flagged.status = "rejected"
        flagged.save()

        with pytest.raises(ValueError):
            self.service.approve_referral(flagged.pk, admin)

    def test_approve_raises_does_not_exist_for_invalid_id(self):
        """Should raise DoesNotExist for a non-existent flagged id."""
        admin = self._create_user()

        with pytest.raises(FlaggedReferral.DoesNotExist):
            self.service.approve_referral(99999, admin)

    def test_approve_releases_driver_bonus(self):
        """Approving a driver referral flag releases withheld DriverBonus."""
        referrer = self._create_user(user_type="driver")
        referee = self._create_user(user_type="driver")
        admin = self._create_user()

        code_obj, _ = DriverReferralCode.objects.get_or_create(
            driver=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        driver_referral = DriverReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="pending",
            ride_threshold=20,
        )
        bonus = DriverBonus.objects.create(
            referral=driver_referral,
            referrer=referrer,
            amount=Decimal("500.00"),
            status="withheld",
        )
        flagged = FlaggedReferral.objects.create(
            driver_referral=driver_referral,
            referrer=referrer,
            referee=referee,
            reason="velocity_abuse",
            status="pending",
        )

        self.service.approve_referral(flagged.pk, admin)

        bonus.refresh_from_db()
        assert bonus.status == "released"
        assert bonus.released_at is not None

    def test_approve_does_not_affect_non_withheld_credits(self):
        """Approving should not affect credits that are not withheld."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        # Active credit (not withheld) - should not be affected
        active_credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("30.00"),
            status="active",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.service.approve_referral(flagged.pk, admin)

        active_credit.refresh_from_db()
        assert active_credit.status == "active"
        assert active_credit.remaining_amount == Decimal("30.00")


@pytest.mark.django_db
class TestRejectReferral:
    """Tests for FraudDetectionService.reject_referral"""

    def setup_method(self):
        self.service = FraudDetectionService()
        RewardConfiguration.objects.filter(is_active=True).update(is_active=False)
        self.config = RewardConfiguration.objects.create(
            rider_referrer_credit=Decimal("50.00"),
            rider_referee_credit=Decimal("25.00"),
            credit_expiration_days=90,
            is_active=True,
        )

    def _create_user(self, user_type="rider", is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"{user_type}_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
            is_active=is_active,
        )
        return user

    def _create_flagged_rider_referral(self, referrer, referee, status="pending"):
        """Create a flagged rider referral."""
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="flagged",
        )
        flagged = FlaggedReferral.objects.create(
            rider_referral=referral,
            referrer=referrer,
            referee=referee,
            reason="device_abuse",
            status=status,
        )
        return flagged, referral

    def test_reject_sets_status_to_rejected(self):
        """Rejecting sets status to 'rejected'."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)

        self.service.reject_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.status == "rejected"

    def test_reject_sets_resolved_at_and_resolved_by(self):
        """Rejecting sets resolved_at and resolved_by fields."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)

        self.service.reject_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.resolved_at is not None
        assert flagged.resolved_by == admin

    def test_reject_revokes_withheld_credits(self):
        """Rejecting revokes withheld credits (sets revoked, remaining=0)."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("50.00"),
            status="withheld",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.service.reject_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.status == "revoked"
        assert credit.remaining_amount == Decimal("0.00")
        assert credit.revoked_at is not None

    def test_reject_revokes_active_credits(self):
        """Rejecting revokes already-active credits (deduction from balance)."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("40.00"),
            status="active",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.service.reject_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.status == "revoked"
        assert credit.remaining_amount == Decimal("0.00")
        assert credit.revoked_at is not None

    def test_reject_revokes_used_credits(self):
        """Rejecting revokes already-used credits (deduction for disbursed)."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("0.00"),
            status="used",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
            used_at=timezone.now() - timedelta(hours=1),
        )

        self.service.reject_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.status == "revoked"
        assert credit.remaining_amount == Decimal("0.00")
        assert credit.revoked_at is not None

    def test_reject_revokes_multiple_credits(self):
        """Rejecting revokes all credits associated with the referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credits = []
        for status in ["withheld", "active", "used"]:
            credit = RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("30.00") if status == "active" else Decimal("0.00"),
                status=status,
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )
            credits.append(credit)

        self.service.reject_referral(flagged.pk, admin)

        for credit in credits:
            credit.refresh_from_db()
            assert credit.status == "revoked"
            assert credit.remaining_amount == Decimal("0.00")

    def test_reject_works_for_escalated_status(self):
        """Rejecting works for flagged referrals with 'escalated' status."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(
            referrer, referee, status="escalated"
        )

        self.service.reject_referral(flagged.pk, admin)

        flagged.refresh_from_db()
        assert flagged.status == "rejected"

    def test_reject_raises_value_error_for_already_approved(self):
        """Cannot reject an already approved flagged referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)
        flagged.status = "approved"
        flagged.save()

        with pytest.raises(ValueError):
            self.service.reject_referral(flagged.pk, admin)

    def test_reject_raises_value_error_for_already_rejected(self):
        """Cannot reject an already rejected flagged referral."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, _ = self._create_flagged_rider_referral(referrer, referee)
        flagged.status = "rejected"
        flagged.save()

        with pytest.raises(ValueError):
            self.service.reject_referral(flagged.pk, admin)

    def test_reject_raises_does_not_exist_for_invalid_id(self):
        """Should raise DoesNotExist for non-existent flagged id."""
        admin = self._create_user()

        with pytest.raises(FlaggedReferral.DoesNotExist):
            self.service.reject_referral(99999, admin)

    def test_reject_revokes_driver_bonus(self):
        """Rejecting a driver referral flag revokes DriverBonus."""
        referrer = self._create_user(user_type="driver")
        referee = self._create_user(user_type="driver")
        admin = self._create_user()

        code_obj, _ = DriverReferralCode.objects.get_or_create(
            driver=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        driver_referral = DriverReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="pending",
            ride_threshold=20,
        )
        bonus = DriverBonus.objects.create(
            referral=driver_referral,
            referrer=referrer,
            amount=Decimal("500.00"),
            status="issued",
        )
        flagged = FlaggedReferral.objects.create(
            driver_referral=driver_referral,
            referrer=referrer,
            referee=referee,
            reason="velocity_abuse",
            status="pending",
        )

        self.service.reject_referral(flagged.pk, admin)

        bonus.refresh_from_db()
        assert bonus.status == "revoked"
        assert bonus.revoked_at is not None

    def test_reject_does_not_affect_already_revoked_credits(self):
        """Credits already in 'revoked' status should not be affected."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        earlier_revoked_at = timezone.now() - timedelta(days=5)
        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("0.00"),
            status="revoked",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
            revoked_at=earlier_revoked_at,
        )

        self.service.reject_referral(flagged.pk, admin)

        credit.refresh_from_db()
        # Should not be re-revoked (still has original revoked_at)
        assert credit.status == "revoked"
        assert credit.revoked_at == earlier_revoked_at

    def test_reject_does_not_affect_expired_credits(self):
        """Credits already in 'expired' status should not be affected."""
        referrer = self._create_user()
        referee = self._create_user()
        admin = self._create_user()
        flagged, referral = self._create_flagged_rider_referral(referrer, referee)

        credit = RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("0.00"),
            status="expired",
            credit_type="referrer",
            expires_at=timezone.now() - timedelta(days=1),
        )

        self.service.reject_referral(flagged.pk, admin)

        credit.refresh_from_db()
        assert credit.status == "expired"
