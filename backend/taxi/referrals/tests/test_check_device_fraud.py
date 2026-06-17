import secrets
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from referrals.models import (
    FlaggedReferral,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)
from referrals.services.fraud_detection_service import FraudDetectionService


@pytest.mark.django_db
class TestCheckDeviceFraud:
    """Tests for FraudDetectionService.check_device_fraud"""

    def setup_method(self):
        self.service = FraudDetectionService()

    def _create_user(self, user_type="rider"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        return User.objects.create_user(
            email=f"{user_type}_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
        )

    def _get_or_create_referral_code(self, rider):
        """Get the referral code auto-created by the signal, or create one."""
        try:
            return RiderReferralCode.objects.get(rider=rider)
        except RiderReferralCode.DoesNotExist:
            return RiderReferralCode.objects.create(
                rider=rider,
                code=secrets.token_hex(4)[:8].upper(),
            )

    def _create_referral(self, referral_code, referee, device_id, created_at=None):
        referral = RiderReferral.objects.create(
            referral_code=referral_code,
            referee=referee,
            device_id=device_id,
        )
        if created_at is not None:
            # Override auto_now_add by using queryset update
            RiderReferral.objects.filter(pk=referral.pk).update(
                created_at=created_at
            )
            referral.refresh_from_db()
        return referral

    def test_no_fraud_when_fewer_than_3_signups(self):
        """Should return empty list when fewer than 3 signups from same device."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_abc123"

        # Create only 2 referrals from same device
        for _ in range(2):
            referee = self._create_user()
            self._create_referral(code, referee, device_id, created_at=now - timedelta(hours=1))

        result = self.service.check_device_fraud(device_id, now)

        assert result == []
        assert FlaggedReferral.objects.count() == 0

    def test_flags_referrals_when_3_or_more_signups(self):
        """Should flag all referrals when 3+ signups from same device in 24h."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_xyz789"

        # Create 3 referrals from same device within 24h
        referrals = []
        for i in range(3):
            referee = self._create_user()
            r = self._create_referral(
                code, referee, device_id, created_at=now - timedelta(hours=i + 1)
            )
            referrals.append(r)

        result = self.service.check_device_fraud(device_id, now)

        assert len(result) == 3
        assert all(isinstance(f, FlaggedReferral) for f in result)
        assert all(f.reason == "device_abuse" for f in result)
        assert all(f.status == "pending" for f in result)

    def test_referral_status_set_to_flagged(self):
        """Flagged referrals should have status updated to 'flagged'."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_flag_test"

        for _ in range(3):
            referee = self._create_user()
            self._create_referral(code, referee, device_id, created_at=now - timedelta(hours=1))

        self.service.check_device_fraud(device_id, now)

        flagged_count = RiderReferral.objects.filter(
            device_id=device_id, status="flagged"
        ).count()
        assert flagged_count == 3

    def test_withholds_active_credits(self):
        """Should withhold active credits for flagged referrals."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_credit_test"

        # Create 3 referrals from same device
        for _ in range(3):
            referee = self._create_user()
            referral = self._create_referral(
                code, referee, device_id, created_at=now - timedelta(hours=1)
            )
            # Create active credits for this referral
            RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status="active",
                credit_type="referrer",
                expires_at=now + timedelta(days=90),
            )

        self.service.check_device_fraud(device_id, now)

        # All credits should be withheld
        withheld_count = RideCredit.objects.filter(
            status="withheld"
        ).count()
        assert withheld_count == 3

    def test_empty_device_id_returns_empty_list(self):
        """Should return empty list when device_id is empty."""
        result = self.service.check_device_fraud("", timezone.now())
        assert result == []

    def test_does_not_flag_referrals_outside_24h_window(self):
        """Referrals outside the 24h window should not trigger fraud."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_window_test"

        # Create 2 referrals within window
        for i in range(2):
            referee = self._create_user()
            self._create_referral(
                code, referee, device_id, created_at=now - timedelta(hours=i + 1)
            )

        # This one is outside the window (25 hours ago)
        referee = self._create_user()
        self._create_referral(
            code, referee, device_id, created_at=now - timedelta(hours=25)
        )

        result = self.service.check_device_fraud(device_id, now)

        assert result == []

    def test_does_not_duplicate_flags_for_already_flagged_referrals(self):
        """Should not create duplicate flags for referrals already flagged."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_dup_test"

        for _ in range(3):
            referee = self._create_user()
            self._create_referral(code, referee, device_id, created_at=now - timedelta(hours=1))

        # First call should flag them
        result1 = self.service.check_device_fraud(device_id, now)
        assert len(result1) == 3

        # Second call should not create duplicate flags
        result2 = self.service.check_device_fraud(device_id, now)
        assert len(result2) == 0
        assert FlaggedReferral.objects.filter(reason="device_abuse").count() == 3

    def test_flagged_referral_has_correct_referrer_and_referee(self):
        """FlaggedReferral should reference the correct referrer and referee."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_refs_test"

        referees = []
        for _ in range(3):
            referee = self._create_user()
            referees.append(referee)
            self._create_referral(code, referee, device_id, created_at=now - timedelta(hours=1))

        result = self.service.check_device_fraud(device_id, now)

        referee_ids = {f.referee_id for f in result}
        expected_ids = {r.pk for r in referees}
        assert referee_ids == expected_ids
        assert all(f.referrer_id == referrer.pk for f in result)

    def test_more_than_3_signups_all_flagged(self):
        """Should flag all referrals when more than 3 signups (e.g., 5)."""
        referrer = self._create_user()
        code = self._get_or_create_referral_code(referrer)

        now = timezone.now()
        device_id = "device_many_test"

        for i in range(5):
            referee = self._create_user()
            self._create_referral(
                code, referee, device_id, created_at=now - timedelta(hours=i + 1)
            )

        result = self.service.check_device_fraud(device_id, now)

        assert len(result) == 5
        assert FlaggedReferral.objects.count() == 5
