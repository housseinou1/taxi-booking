import secrets
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from referrals.models import (
    FlaggedReferral,
    RewardConfiguration,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)
from referrals.services.fraud_detection_service import FraudDetectionService


@pytest.mark.django_db
class TestCheckGhostAccountFraud:
    """Tests for FraudDetectionService.check_ghost_account_fraud"""

    def setup_method(self):
        self.service = FraudDetectionService()
        # Create an active reward configuration
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
        user = User.objects.create_user(
            email=f"user_{unique}@test.com",
            password="testpass123",
            user_type="rider",
            is_active=is_active,
        )
        return user

    def _create_completed_referral(self, referrer, referee, completed_at=None):
        """Create a completed referral with a specific completed_at time."""
        # Use existing code created by signal, or create one if needed
        try:
            code_obj = RiderReferralCode.objects.get(rider=referrer)
        except RiderReferralCode.DoesNotExist:
            code_obj = RiderReferralCode.objects.create(
                rider=referrer, code=secrets.token_hex(4)[:8].upper()
            )
        if completed_at is None:
            completed_at = timezone.now() - timedelta(hours=72)

        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
            completed_at=completed_at,
        )
        return referral

    def _create_active_credit(self, rider, referral):
        """Create an active credit linked to a referral."""
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("50.00"),
            status="active",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )

    def test_flags_referral_with_no_activity_after_48h(self):
        """Should flag a completed referral when referee has no activity 48h after completion."""
        referrer = self._create_user()
        referee = self._create_user()
        # Completed 72 hours ago (well past the 48h threshold)
        self._create_completed_referral(
            referrer, referee, completed_at=timezone.now() - timedelta(hours=72)
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 1
        assert result[0].reason == "ghost_account"
        assert result[0].referrer == referrer
        assert result[0].referee == referee
        assert result[0].status == "pending"

    def test_does_not_flag_referral_within_48h(self):
        """Should not flag a completed referral that is less than 48h old."""
        referrer = self._create_user()
        referee = self._create_user()
        # Completed only 24 hours ago (within the 48h window)
        self._create_completed_referral(
            referrer, referee, completed_at=timezone.now() - timedelta(hours=24)
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 0

    def test_does_not_flag_referral_with_credit_usage(self):
        """Should not flag if referee has used credits after the 48h window."""
        referrer = self._create_user()
        referee = self._create_user()
        completed_at = timezone.now() - timedelta(hours=72)
        referral = self._create_completed_referral(
            referrer, referee, completed_at=completed_at
        )

        # Referee has used a credit after completed_at + 48h
        credit = RideCredit.objects.create(
            rider=referee,
            referral=referral,
            original_amount=Decimal("25.00"),
            remaining_amount=Decimal("0.00"),
            status="used",
            credit_type="referee",
            expires_at=timezone.now() + timedelta(days=90),
            used_at=completed_at + timedelta(hours=50),  # After the 48h window
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 0

    def test_does_not_flag_already_flagged_referral(self):
        """Should not flag a referral that has already been flagged as ghost_account."""
        referrer = self._create_user()
        referee = self._create_user()
        referral = self._create_completed_referral(
            referrer, referee, completed_at=timezone.now() - timedelta(hours=72)
        )

        # Already flagged
        FlaggedReferral.objects.create(
            rider_referral=referral,
            referrer=referrer,
            referee=referee,
            reason="ghost_account",
            status="pending",
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 0

    def test_withholds_pending_rewards(self):
        """Should withhold active credits when flagging a ghost account."""
        referrer = self._create_user()
        referee = self._create_user()
        referral = self._create_completed_referral(
            referrer, referee, completed_at=timezone.now() - timedelta(hours=72)
        )
        credit = self._create_active_credit(referrer, referral)

        self.service.check_ghost_account_fraud()

        credit.refresh_from_db()
        assert credit.status == "withheld"
        assert credit.remaining_amount == Decimal("0.00")

    def test_flags_multiple_ghost_accounts(self):
        """Should flag multiple referrals if all meet ghost account criteria."""
        referrer = self._create_user()
        referee1 = self._create_user()
        referee2 = self._create_user()
        self._create_completed_referral(
            referrer, referee1, completed_at=timezone.now() - timedelta(hours=72)
        )
        self._create_completed_referral(
            referrer, referee2, completed_at=timezone.now() - timedelta(hours=96)
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 2
        assert all(f.reason == "ghost_account" for f in result)

    def test_does_not_flag_pending_referrals(self):
        """Should only check completed referrals, not pending ones."""
        referrer = self._create_user()
        referee = self._create_user()
        # Use existing code created by signal, or create one
        try:
            code_obj = RiderReferralCode.objects.get(rider=referrer)
        except RiderReferralCode.DoesNotExist:
            code_obj = RiderReferralCode.objects.create(
                rider=referrer, code=secrets.token_hex(4)[:8].upper()
            )
        # Pending referral - no completed_at, should not be flagged
        RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="pending",
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 0

    def test_returns_list_of_flagged_referral_objects(self):
        """Should return FlaggedReferral instances."""
        referrer = self._create_user()
        referee = self._create_user()
        referral = self._create_completed_referral(
            referrer, referee, completed_at=timezone.now() - timedelta(hours=72)
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 1
        assert isinstance(result[0], FlaggedReferral)
        assert result[0].rider_referral == referral

    def test_does_not_flag_referral_with_referrer_activity(self):
        """Should not flag if the referee has referral activity (as a referrer themselves)."""
        referrer = self._create_user()
        referee = self._create_user()
        completed_at = timezone.now() - timedelta(hours=72)
        referral = self._create_completed_referral(
            referrer, referee, completed_at=completed_at
        )

        # The referee has also become a referrer and has a completed referral
        sub_referee = self._create_user()
        # Use existing code created by signal for the referee
        try:
            sub_code = RiderReferralCode.objects.get(rider=referee)
        except RiderReferralCode.DoesNotExist:
            sub_code = RiderReferralCode.objects.create(
                rider=referee, code=secrets.token_hex(4)[:8].upper()
            )
        RiderReferral.objects.create(
            referral_code=sub_code,
            referee=sub_referee,
            status="completed",
            completed_at=completed_at + timedelta(hours=50),  # After the 48h window
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 0

    def test_credit_usage_before_48h_window_does_not_prevent_flag(self):
        """Credit usage before the 48h window should not prevent flagging."""
        referrer = self._create_user()
        referee = self._create_user()
        completed_at = timezone.now() - timedelta(hours=72)
        referral = self._create_completed_referral(
            referrer, referee, completed_at=completed_at
        )

        # Referee used a credit before the 48h window (before completed_at + 48h)
        RideCredit.objects.create(
            rider=referee,
            referral=referral,
            original_amount=Decimal("25.00"),
            remaining_amount=Decimal("0.00"),
            status="used",
            credit_type="referee",
            expires_at=timezone.now() + timedelta(days=90),
            used_at=completed_at + timedelta(hours=24),  # Before the 48h window
        )

        result = self.service.check_ghost_account_fraud()

        assert len(result) == 1


from referrals.services.fraud_detection_service import DEFAULT_DAILY_CREDIT_THRESHOLD


@pytest.mark.django_db
class TestCheckVelocityFraud:
    """Tests for FraudDetectionService.check_velocity_fraud"""

    def setup_method(self):
        self.service = FraudDetectionService()

    def _create_user(self, user_type="rider"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"{user_type}_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
        )
        return user

    def _create_referral_with_credits(self, referrer, num_credits, hours_ago=0):
        """Helper to create a referral and associated credits for a referrer.

        Creates a referral code, a referee, a referral, and the specified
        number of RideCredits with credit_type='referrer' issued at the
        specified time offset.
        """
        referee = self._create_user()
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )

        issued_time = timezone.now() - timedelta(hours=hours_ago)
        credits = []
        for _ in range(num_credits):
            credit = RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status="active",
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )
            # Manually set issued_at since auto_now_add
            RideCredit.objects.filter(pk=credit.pk).update(issued_at=issued_time)
            credit.refresh_from_db()
            credits.append(credit)

        return referral, credits

    def test_returns_none_when_below_threshold(self):
        """Should return None when credit count is below the threshold."""
        referrer = self._create_user()
        # Create fewer credits than the default threshold
        self._create_referral_with_credits(referrer, num_credits=5, hours_ago=0)

        result = self.service.check_velocity_fraud(referrer)

        assert result is None

    def test_returns_none_when_at_threshold(self):
        """Should return None when credit count equals the threshold (not exceeds)."""
        referrer = self._create_user()
        # Create exactly the threshold number of credits
        self._create_referral_with_credits(
            referrer, num_credits=DEFAULT_DAILY_CREDIT_THRESHOLD, hours_ago=0
        )

        result = self.service.check_velocity_fraud(referrer)

        assert result is None

    def test_flags_when_exceeds_threshold(self):
        """Should create a FlaggedReferral when credits exceed threshold."""
        referrer = self._create_user()
        self._create_referral_with_credits(
            referrer, num_credits=DEFAULT_DAILY_CREDIT_THRESHOLD + 1, hours_ago=0
        )

        result = self.service.check_velocity_fraud(referrer)

        assert result is not None
        assert isinstance(result, FlaggedReferral)
        assert result.reason == "velocity_abuse"
        assert result.status == "pending"
        assert result.referrer == referrer

    def test_flagged_referral_links_to_referrer(self):
        """The FlaggedReferral should link to the referrer."""
        referrer = self._create_user()
        self._create_referral_with_credits(
            referrer, num_credits=DEFAULT_DAILY_CREDIT_THRESHOLD + 1, hours_ago=0
        )

        result = self.service.check_velocity_fraud(referrer)

        assert result.referrer == referrer

    def test_flagged_referral_links_to_most_recent_referral(self):
        """The FlaggedReferral should link to the most recent referral."""
        referrer = self._create_user()
        # Create first referral (older)
        referral1, _ = self._create_referral_with_credits(
            referrer, num_credits=6, hours_ago=2
        )
        # Create second referral (newer) - total now exceeds threshold
        referral2, _ = self._create_referral_with_credits(
            referrer, num_credits=6, hours_ago=0
        )

        result = self.service.check_velocity_fraud(referrer)

        assert result is not None
        # Should link to most recent referral
        assert result.rider_referral == referral2

    def test_withholds_pending_rewards(self):
        """Should withhold all active credits for the referrer."""
        referrer = self._create_user()
        _, credits = self._create_referral_with_credits(
            referrer, num_credits=DEFAULT_DAILY_CREDIT_THRESHOLD + 1, hours_ago=0
        )

        self.service.check_velocity_fraud(referrer)

        # All active credits should now be withheld
        for credit in credits:
            credit.refresh_from_db()
            assert credit.status == "withheld"

    def test_ignores_credits_older_than_24_hours(self):
        """Credits older than 24 hours should not be counted."""
        referrer = self._create_user()
        # Create many credits older than 24 hours
        self._create_referral_with_credits(
            referrer, num_credits=DEFAULT_DAILY_CREDIT_THRESHOLD + 5, hours_ago=25
        )

        result = self.service.check_velocity_fraud(referrer)

        assert result is None

    def test_only_counts_referrer_type_credits(self):
        """Should only count credits with credit_type='referrer'."""
        referrer = self._create_user()
        referee = self._create_user()

        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )

        # Create many referee-type credits (should not be counted)
        for _ in range(DEFAULT_DAILY_CREDIT_THRESHOLD + 5):
            RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status="active",
                credit_type="referee",
                expires_at=timezone.now() + timedelta(days=90),
            )

        result = self.service.check_velocity_fraud(referrer)

        assert result is None

    def test_uses_configured_threshold(self):
        """Should use the threshold from RewardConfiguration if available."""
        from django.core.cache import cache

        # Clear the cache to ensure we pick up the new config
        cache.clear()

        # Set up a custom threshold of 3
        RewardConfiguration.objects.all().update(is_active=False)
        RewardConfiguration.objects.create(
            is_active=True, rider_credit_cap_count=3
        )

        referrer = self._create_user()
        self._create_referral_with_credits(referrer, num_credits=4, hours_ago=0)

        result = self.service.check_velocity_fraud(referrer)

        assert result is not None
        assert result.reason == "velocity_abuse"

    def test_returns_none_no_referrals_exist(self):
        """Should return None if referrer has no referrals (edge case)."""
        referrer = self._create_user()
        # No referral code or credits exist for this referrer

        result = self.service.check_velocity_fraud(referrer)

        assert result is None

    def test_does_not_withhold_already_withheld_credits(self):
        """Already withheld credits should remain withheld (not double-counted)."""
        referrer = self._create_user()
        referee = self._create_user()

        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )

        # Create credits - some already withheld, some active
        for i in range(DEFAULT_DAILY_CREDIT_THRESHOLD + 2):
            status = "withheld" if i == 0 else "active"
            RideCredit.objects.create(
                rider=referrer,
                referral=referral,
                original_amount=Decimal("50.00"),
                remaining_amount=Decimal("50.00"),
                status=status,
                credit_type="referrer",
                expires_at=timezone.now() + timedelta(days=90),
            )

        self.service.check_velocity_fraud(referrer)

        # Check that all credits are withheld now
        withheld_count = RideCredit.objects.filter(
            rider=referrer, credit_type="referrer", status="withheld"
        ).count()
        assert withheld_count == DEFAULT_DAILY_CREDIT_THRESHOLD + 2


@pytest.mark.django_db
class TestEscalateStaleFlags:
    """Tests for FraudDetectionService.escalate_stale_flags"""

    def setup_method(self):
        self.service = FraudDetectionService()

    def _create_user(self, user_type="rider"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"{user_type}_{unique}@test.com",
            password="testpass123",
            user_type=user_type,
        )
        return user

    def _create_flagged_referral(self, referrer, referee, flagged_at=None, status="pending", reason="device_abuse"):
        """Create a FlaggedReferral with a specific flagged_at time."""
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
            reason=reason,
            status=status,
        )
        # Override auto_now_add for flagged_at if needed
        if flagged_at is not None:
            FlaggedReferral.objects.filter(pk=flagged.pk).update(flagged_at=flagged_at)
            flagged.refresh_from_db()
        return flagged

    def test_escalates_pending_flags_older_than_30_days(self):
        """Should escalate pending flags that are older than 30 days."""
        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=31)
        flag = self._create_flagged_referral(referrer, referee, flagged_at=flagged_at)

        count = self.service.escalate_stale_flags()

        assert count == 1
        flag.refresh_from_db()
        assert flag.status == "escalated"
        assert flag.escalated_at is not None

    def test_does_not_escalate_flags_within_30_days(self):
        """Should not escalate pending flags that are less than 30 days old."""
        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=15)
        flag = self._create_flagged_referral(referrer, referee, flagged_at=flagged_at)

        count = self.service.escalate_stale_flags()

        assert count == 0
        flag.refresh_from_db()
        assert flag.status == "pending"
        assert flag.escalated_at is None

    def test_does_not_escalate_already_resolved_flags(self):
        """Should not escalate flags that have already been approved or rejected."""
        referrer = self._create_user()
        referee1 = self._create_user()
        referee2 = self._create_user()
        flagged_at = timezone.now() - timedelta(days=31)

        approved_flag = self._create_flagged_referral(
            referrer, referee1, flagged_at=flagged_at, status="approved"
        )
        rejected_flag = self._create_flagged_referral(
            referrer, referee2, flagged_at=flagged_at, status="rejected"
        )

        count = self.service.escalate_stale_flags()

        assert count == 0
        approved_flag.refresh_from_db()
        rejected_flag.refresh_from_db()
        assert approved_flag.status == "approved"
        assert rejected_flag.status == "rejected"

    def test_does_not_escalate_already_escalated_flags(self):
        """Should not re-escalate flags already in escalated status."""
        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=60)
        flag = self._create_flagged_referral(
            referrer, referee, flagged_at=flagged_at, status="escalated"
        )

        count = self.service.escalate_stale_flags()

        assert count == 0

    def test_escalates_multiple_stale_flags(self):
        """Should escalate all pending flags older than 30 days."""
        referrer = self._create_user()
        referee1 = self._create_user()
        referee2 = self._create_user()
        referee3 = self._create_user()
        flagged_at = timezone.now() - timedelta(days=35)

        flag1 = self._create_flagged_referral(referrer, referee1, flagged_at=flagged_at)
        flag2 = self._create_flagged_referral(referrer, referee2, flagged_at=flagged_at)
        flag3 = self._create_flagged_referral(referrer, referee3, flagged_at=flagged_at)

        count = self.service.escalate_stale_flags()

        assert count == 3
        for flag in [flag1, flag2, flag3]:
            flag.refresh_from_db()
            assert flag.status == "escalated"
            assert flag.escalated_at is not None

    def test_returns_zero_when_no_stale_flags(self):
        """Should return 0 when there are no stale pending flags."""
        count = self.service.escalate_stale_flags()
        assert count == 0

    def test_escalation_sets_escalated_at_to_current_time(self):
        """Should set escalated_at to approximately the current time."""
        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=31)
        flag = self._create_flagged_referral(referrer, referee, flagged_at=flagged_at)

        before = timezone.now()
        self.service.escalate_stale_flags()
        after = timezone.now()

        flag.refresh_from_db()
        assert flag.escalated_at >= before
        assert flag.escalated_at <= after

    def test_boundary_exactly_30_days(self):
        """Should escalate a flag that is exactly 30 days old."""
        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=30)
        flag = self._create_flagged_referral(referrer, referee, flagged_at=flagged_at)

        count = self.service.escalate_stale_flags()

        assert count == 1
        flag.refresh_from_db()
        assert flag.status == "escalated"

    def test_mixed_stale_and_fresh_flags(self):
        """Should only escalate stale flags, leaving fresh ones unchanged."""
        referrer = self._create_user()
        referee_stale = self._create_user()
        referee_fresh = self._create_user()

        stale_flag = self._create_flagged_referral(
            referrer, referee_stale, flagged_at=timezone.now() - timedelta(days=40)
        )
        fresh_flag = self._create_flagged_referral(
            referrer, referee_fresh, flagged_at=timezone.now() - timedelta(days=5)
        )

        count = self.service.escalate_stale_flags()

        assert count == 1
        stale_flag.refresh_from_db()
        fresh_flag.refresh_from_db()
        assert stale_flag.status == "escalated"
        assert fresh_flag.status == "pending"

    def test_sends_admin_notification_on_escalation(self):
        """Should call _send_admin_escalation_notification with the count when flags are escalated."""
        from unittest.mock import patch

        referrer = self._create_user()
        referee1 = self._create_user()
        referee2 = self._create_user()
        flagged_at = timezone.now() - timedelta(days=35)
        self._create_flagged_referral(referrer, referee1, flagged_at=flagged_at)
        self._create_flagged_referral(referrer, referee2, flagged_at=flagged_at)

        with patch.object(
            self.service, "_send_admin_escalation_notification"
        ) as mock_notify:
            self.service.escalate_stale_flags()
            mock_notify.assert_called_once_with(2)

    def test_no_admin_notification_when_no_escalations(self):
        """Should NOT call _send_admin_escalation_notification when no flags are escalated."""
        from unittest.mock import patch

        with patch.object(
            self.service, "_send_admin_escalation_notification"
        ) as mock_notify:
            self.service.escalate_stale_flags()
            mock_notify.assert_not_called()

    @pytest.mark.django_db
    def test_sends_push_notification_to_admin_users(self):
        """Should send push notifications to all active staff users on escalation."""
        from unittest.mock import patch

        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Create admin users
        admin1 = User.objects.create_user(
            email="admin1@test.com",
            password="testpass123",
            user_type="rider",
            is_staff=True,
            is_active=True,
        )
        admin2 = User.objects.create_user(
            email="admin2@test.com",
            password="testpass123",
            user_type="rider",
            is_staff=True,
            is_active=True,
        )
        # Inactive admin should not receive notification
        User.objects.create_user(
            email="inactive_admin@test.com",
            password="testpass123",
            user_type="rider",
            is_staff=True,
            is_active=False,
        )

        referrer = self._create_user()
        referee = self._create_user()
        flagged_at = timezone.now() - timedelta(days=35)
        self._create_flagged_referral(referrer, referee, flagged_at=flagged_at)

        with patch(
            "notifications.services.send_push_notification"
        ) as mock_push:
            self.service.escalate_stale_flags()

            assert mock_push.call_count == 2
            called_users = {call[0][0] for call in mock_push.call_args_list}
            assert admin1 in called_users
            assert admin2 in called_users

            # Verify notification content
            call_args = mock_push.call_args_list[0]
            assert "escalat" in call_args[0][2].lower()
            assert call_args[0][3]["type"] == "fraud_escalation"
            assert call_args[0][3]["count"] == 1
