import secrets
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.utils import timezone

from referrals.models import (
    DriverBonus,
    DriverReferral,
    DriverReferralCode,
    RewardConfiguration,
)
from referrals.services.driver_referral_service import (
    BonusIssuanceResult,
    DriverReferralService,
)


@pytest.mark.django_db
class TestCheckAndIssueBonus:
    """Tests for DriverReferralService.check_and_issue_bonus"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, is_active=True, first_name="Test", last_name="Driver"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            is_active=is_active,
            first_name=first_name,
            last_name=last_name,
        )
        return user

    def _ensure_active_config(
        self,
        ride_threshold=20,
        bonus_amount=Decimal("500.00"),
        cap_count=5,
        cap_days=30,
    ):
        """Ensure an active RewardConfiguration exists."""
        RewardConfiguration.objects.filter(is_active=True).update(is_active=False)
        config = RewardConfiguration.objects.create(
            is_active=True,
            driver_ride_threshold=ride_threshold,
            driver_bonus_amount=bonus_amount,
            driver_bonus_cap_count=cap_count,
            driver_bonus_cap_days=cap_days,
        )
        cache.delete("referral:reward_config:active")
        return config

    def _create_referral(
        self, referrer, referee, ride_threshold=20, completed_rides=0, status="pending"
    ):
        """Create a DriverReferral with the given parameters."""
        code_obj, _ = DriverReferralCode.objects.get_or_create(
            driver=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = DriverReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            ride_threshold=ride_threshold,
            status=status,
            completed_rides=completed_rides,
        )
        return referral

    # --- Test: threshold not met ---

    def test_rejects_when_threshold_not_met(self):
        """Should return failure if completed_rides < ride_threshold."""
        self._ensure_active_config(ride_threshold=20)
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=20, completed_rides=10
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is False
        assert result.bonus is None
        assert result.withheld is False
        assert "threshold" in result.reason.lower()

    # --- Test: exactly-once semantics ---

    def test_rejects_duplicate_bonus_issuance(self):
        """Should reject if a bonus already exists for this referral."""
        self._ensure_active_config(ride_threshold=5, bonus_amount=Decimal("100.00"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        # Issue bonus first time
        result1 = self.service.check_and_issue_bonus(referral)
        assert result1.success is True

        # Try to issue again — should be rejected
        result2 = self.service.check_and_issue_bonus(referral)

        assert result2.success is False
        assert result2.bonus is None
        assert "already issued" in result2.reason.lower()

    def test_only_one_bonus_record_created(self):
        """Should create exactly one DriverBonus record even if called multiple times."""
        self._ensure_active_config(ride_threshold=5, bonus_amount=Decimal("100.00"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        self.service.check_and_issue_bonus(referral)
        self.service.check_and_issue_bonus(referral)
        self.service.check_and_issue_bonus(referral)

        assert DriverBonus.objects.filter(referral=referral).count() == 1

    # --- Test: successful issuance ---

    def test_issues_bonus_when_threshold_met(self):
        """Should create a bonus with status='issued' when all checks pass."""
        self._ensure_active_config(ride_threshold=10, bonus_amount=Decimal("750.00"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=10, completed_rides=10
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.bonus is not None
        assert result.bonus.status == "issued"
        assert result.bonus.amount == Decimal("750.00")
        assert result.bonus.referrer == referrer
        assert result.bonus.referral == referral
        assert result.withheld is False

    def test_updates_referral_status_to_completed(self):
        """Should set referral status to 'completed' and set completed_at."""
        self._ensure_active_config(ride_threshold=5)
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        before = timezone.now()
        self.service.check_and_issue_bonus(referral)
        after = timezone.now()

        referral.refresh_from_db()
        assert referral.status == "completed"
        assert referral.completed_at is not None
        assert before <= referral.completed_at <= after

    def test_uses_bonus_amount_from_active_config(self):
        """Bonus amount should come from the active RewardConfiguration."""
        self._ensure_active_config(ride_threshold=3, bonus_amount=Decimal("1234.56"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=3, completed_rides=3
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.bonus.amount == Decimal("1234.56")

    # --- Test: referrer suspended ---

    def test_withholds_bonus_when_referrer_suspended(self):
        """Should create bonus with status='withheld' if referrer is inactive."""
        self._ensure_active_config(ride_threshold=5, bonus_amount=Decimal("500.00"))
        referrer = self._create_driver(is_active=False)
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.withheld is True
        assert result.bonus is not None
        assert result.bonus.status == "withheld"
        assert result.bonus.amount == Decimal("500.00")
        assert "suspended" in result.reason.lower()

    def test_withheld_bonus_does_not_complete_referral(self):
        """Withheld bonus should NOT mark the referral as completed."""
        self._ensure_active_config(ride_threshold=5)
        referrer = self._create_driver(is_active=False)
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        self.service.check_and_issue_bonus(referral)

        referral.refresh_from_db()
        # Referral status should remain pending since bonus is withheld
        assert referral.status == "pending"

    # --- Test: bonus cap reached ---

    def test_withholds_bonus_when_cap_reached(self):
        """Should withhold if referrer has >= cap_count bonuses in the cap period."""
        self._ensure_active_config(
            ride_threshold=3,
            bonus_amount=Decimal("200.00"),
            cap_count=2,
            cap_days=30,
        )
        referrer = self._create_driver()

        # Create 2 existing bonuses within the cap period
        for _ in range(2):
            other_referee = self._create_driver()
            other_referral = self._create_referral(
                referrer, other_referee, ride_threshold=3, completed_rides=3
            )
            DriverBonus.objects.create(
                referral=other_referral,
                referrer=referrer,
                amount=Decimal("200.00"),
                status="issued",
            )

        # Now try to issue a new bonus — should be withheld
        new_referee = self._create_driver()
        referral = self._create_referral(
            referrer, new_referee, ride_threshold=3, completed_rides=3
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.withheld is True
        assert result.bonus.status == "withheld"
        assert "cap" in result.reason.lower()

    def test_cap_only_counts_issued_and_released_bonuses(self):
        """Only bonuses with status 'issued' or 'released' count toward the cap."""
        self._ensure_active_config(
            ride_threshold=3,
            bonus_amount=Decimal("200.00"),
            cap_count=2,
            cap_days=30,
        )
        referrer = self._create_driver()

        # Create 2 bonuses: one withheld, one revoked (neither counts)
        for status in ("withheld", "revoked"):
            other_referee = self._create_driver()
            other_referral = self._create_referral(
                referrer, other_referee, ride_threshold=3, completed_rides=3
            )
            DriverBonus.objects.create(
                referral=other_referral,
                referrer=referrer,
                amount=Decimal("200.00"),
                status=status,
            )

        # New bonus should be issued (not withheld) since cap not reached
        new_referee = self._create_driver()
        referral = self._create_referral(
            referrer, new_referee, ride_threshold=3, completed_rides=3
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.withheld is False
        assert result.bonus.status == "issued"

    def test_cap_only_counts_bonuses_within_cap_period(self):
        """Bonuses older than cap_days should not count toward the cap."""
        self._ensure_active_config(
            ride_threshold=3,
            bonus_amount=Decimal("200.00"),
            cap_count=2,
            cap_days=30,
        )
        referrer = self._create_driver()

        # Create 2 bonuses but backdate them beyond the cap period
        for _ in range(2):
            other_referee = self._create_driver()
            other_referral = self._create_referral(
                referrer, other_referee, ride_threshold=3, completed_rides=3
            )
            bonus = DriverBonus.objects.create(
                referral=other_referral,
                referrer=referrer,
                amount=Decimal("200.00"),
                status="issued",
            )
            # Backdate to 31 days ago (outside the 30-day cap window)
            old_date = timezone.now() - timedelta(days=31)
            DriverBonus.objects.filter(pk=bonus.pk).update(issued_at=old_date)

        # New bonus should be issued since old bonuses are outside window
        new_referee = self._create_driver()
        referral = self._create_referral(
            referrer, new_referee, ride_threshold=3, completed_rides=3
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.withheld is False
        assert result.bonus.status == "issued"

    # --- Test: notification ---

    def test_sends_notification_on_successful_issuance(self):
        """Should call _send_bonus_notification when bonus is issued."""
        self._ensure_active_config(ride_threshold=5, bonus_amount=Decimal("500.00"))
        referrer = self._create_driver(first_name="John", last_name="Doe")
        referee = self._create_driver(first_name="Jane", last_name="Smith")
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        with patch.object(
            self.service, "_send_bonus_notification"
        ) as mock_notify:
            self.service.check_and_issue_bonus(referral)
            mock_notify.assert_called_once_with(
                referrer, referee, Decimal("500.00")
            )

    def test_no_notification_when_threshold_not_met(self):
        """Should NOT send notification if threshold not met."""
        self._ensure_active_config(ride_threshold=10)
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=10, completed_rides=5
        )

        with patch.object(
            self.service, "_send_bonus_notification"
        ) as mock_notify:
            self.service.check_and_issue_bonus(referral)
            mock_notify.assert_not_called()

    def test_no_notification_when_bonus_withheld(self):
        """Should NOT send notification if bonus is withheld."""
        self._ensure_active_config(ride_threshold=5)
        referrer = self._create_driver(is_active=False)
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=5
        )

        with patch.object(
            self.service, "_send_bonus_notification"
        ) as mock_notify:
            self.service.check_and_issue_bonus(referral)
            mock_notify.assert_not_called()

    # --- Test: threshold boundary ---

    def test_issues_bonus_at_exact_threshold(self):
        """Should issue bonus when completed_rides == ride_threshold."""
        self._ensure_active_config(ride_threshold=20, bonus_amount=Decimal("500.00"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=20, completed_rides=20
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.bonus.status == "issued"

    def test_issues_bonus_above_threshold(self):
        """Should issue bonus when completed_rides > ride_threshold."""
        self._ensure_active_config(ride_threshold=5, bonus_amount=Decimal("500.00"))
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=5, completed_rides=7
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.success is True
        assert result.bonus.status == "issued"

    # --- Test: records correct fields ---

    def test_bonus_records_correct_referrer(self):
        """Bonus should be linked to the correct referrer."""
        self._ensure_active_config(ride_threshold=3)
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(
            referrer, referee, ride_threshold=3, completed_rides=3
        )

        result = self.service.check_and_issue_bonus(referral)

        assert result.bonus.referrer == referrer
        assert result.bonus.referral == referral
