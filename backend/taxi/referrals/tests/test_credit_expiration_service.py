import secrets
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from referrals.models import RideCredit, RiderReferral, RiderReferralCode
from referrals.services.credit_expiration_service import CreditExpirationService


@pytest.mark.django_db
class TestExpireCredits:
    """Tests for CreditExpirationService.expire_credits"""

    def setup_method(self):
        self.service = CreditExpirationService()

    def _create_rider(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"rider_{unique}@test.com",
            password="testpass123",
            user_type="rider",
        )
        return user

    def _create_referral(self, referrer, referee):
        """Get or create a RiderReferralCode and create a RiderReferral for test setup."""
        # The signal auto-creates a code for riders, so use get_or_create
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )
        return referral

    def _create_credit(
        self, rider, referral, *, status="active", remaining=Decimal("50.00"),
        expires_at=None
    ):
        """Helper to create a RideCredit with configurable parameters."""
        if expires_at is None:
            expires_at = timezone.now() - timedelta(days=1)  # expired by default
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=remaining,
            status=status,
            credit_type="referrer",
            expires_at=expires_at,
        )

    def test_expires_active_credits_past_expiration_date(self):
        """Active credits past their expires_at should be marked expired."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(days=5),
        )

        count = self.service.expire_credits()

        assert count == 1
        credit.refresh_from_db()
        assert credit.status == "expired"
        assert credit.remaining_amount == Decimal("0.00")

    def test_does_not_expire_active_credits_not_yet_due(self):
        """Active credits with future expires_at should remain active."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=30),
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "active"
        assert credit.remaining_amount == Decimal("50.00")

    def test_does_not_expire_already_expired_credits(self):
        """Credits already in 'expired' status should not be processed again."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            status="expired",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() - timedelta(days=10),
        )

        count = self.service.expire_credits()

        assert count == 0

    def test_does_not_expire_used_credits(self):
        """Credits with status 'used' should not be touched."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            status="used",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() - timedelta(days=5),
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "used"

    def test_does_not_expire_revoked_credits(self):
        """Credits with status 'revoked' should not be touched."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            status="revoked",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() - timedelta(days=5),
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "revoked"

    def test_does_not_expire_withheld_credits(self):
        """Credits with status 'withheld' should not be touched."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            status="withheld",
            remaining=Decimal("50.00"),
            expires_at=timezone.now() - timedelta(days=5),
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "withheld"

    def test_idempotent_second_call_returns_zero(self):
        """Calling expire_credits twice should expire on first, return 0 on second."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(days=1),
        )

        first_count = self.service.expire_credits()
        second_count = self.service.expire_credits()

        assert first_count == 1
        assert second_count == 0

    def test_expires_multiple_credits(self):
        """Multiple expired credits should all be marked expired in one call."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credits = []
        for _ in range(3):
            c = self._create_credit(
                rider, referral,
                expires_at=timezone.now() - timedelta(days=2),
            )
            credits.append(c)

        count = self.service.expire_credits()

        assert count == 3
        for c in credits:
            c.refresh_from_db()
            assert c.status == "expired"
            assert c.remaining_amount == Decimal("0.00")

    def test_partially_used_credit_gets_expired(self):
        """A partially used active credit past expiry should be expired
        with remaining_amount set to zero."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            remaining=Decimal("25.00"),  # partially consumed
            expires_at=timezone.now() - timedelta(days=1),
        )

        count = self.service.expire_credits()

        assert count == 1
        credit.refresh_from_db()
        assert credit.status == "expired"
        assert credit.remaining_amount == Decimal("0.00")

    def test_mixed_statuses_only_expires_active_past_due(self):
        """Only active credits past their expiration should be expired."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        # Should be expired
        expired_credit = self._create_credit(
            rider, referral,
            status="active",
            expires_at=timezone.now() - timedelta(days=1),
        )
        # Should NOT be expired (future expiry)
        future_credit = self._create_credit(
            rider, referral,
            status="active",
            expires_at=timezone.now() + timedelta(days=30),
        )
        # Should NOT be expired (already used)
        used_credit = self._create_credit(
            rider, referral,
            status="used",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() - timedelta(days=5),
        )

        count = self.service.expire_credits()

        assert count == 1
        expired_credit.refresh_from_db()
        assert expired_credit.status == "expired"

        future_credit.refresh_from_db()
        assert future_credit.status == "active"
        assert future_credit.remaining_amount == Decimal("50.00")

        used_credit.refresh_from_db()
        assert used_credit.status == "used"


from unittest.mock import patch


@pytest.mark.django_db
class TestSendExpirationReminders:
    """Tests for CreditExpirationService.send_expiration_reminders"""

    def setup_method(self):
        self.service = CreditExpirationService()

    def _create_rider(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"rider_{unique}@test.com",
            password="testpass123",
            user_type="rider",
        )
        return user

    def _create_referral(self, referrer, referee):
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )
        return referral

    def _create_credit(
        self, rider, referral, *, status="active", remaining=Decimal("50.00"),
        expires_at=None, reminder_sent=False
    ):
        if expires_at is None:
            expires_at = timezone.now() + timedelta(days=5)  # within 7-day window
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=remaining,
            status=status,
            credit_type="referrer",
            expires_at=expires_at,
            reminder_sent=reminder_sent,
        )

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_sends_reminder_for_credit_expiring_within_7_days(self, mock_push):
        """Credits expiring within 7 days with reminder_sent=False get a reminder."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=5),
        )

        count = self.service.send_expiration_reminders()

        assert count == 1
        credit.refresh_from_db()
        assert credit.reminder_sent is True
        mock_push.assert_called_once()
        call_args = mock_push.call_args
        assert call_args[0][0] == rider
        assert "expiring soon" in call_args[0][1].lower() or "Ride credit expiring soon" == call_args[0][1]
        assert str(credit.remaining_amount) in call_args[0][2] or "50.00" in call_args[0][2]

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_does_not_send_reminder_if_already_sent(self, mock_push):
        """Credits with reminder_sent=True should not get a second reminder."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=5),
            reminder_sent=True,
        )

        count = self.service.send_expiration_reminders()

        assert count == 0
        mock_push.assert_not_called()

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_does_not_send_reminder_for_expired_credits(self, mock_push):
        """Credits already past their expiration date should not get reminders."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(days=1),
        )

        count = self.service.send_expiration_reminders()

        assert count == 0
        mock_push.assert_not_called()

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_does_not_send_reminder_for_non_active_credits(self, mock_push):
        """Credits with statuses other than 'active' should not get reminders."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        for status in ["used", "expired", "revoked", "withheld"]:
            self._create_credit(
                rider, referral,
                status=status,
                expires_at=timezone.now() + timedelta(days=3),
            )

        count = self.service.send_expiration_reminders()

        assert count == 0
        mock_push.assert_not_called()

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_does_not_send_reminder_for_credits_expiring_beyond_7_days(self, mock_push):
        """Credits expiring more than 7 days from now should not get reminders."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=15),
        )

        count = self.service.send_expiration_reminders()

        assert count == 0
        mock_push.assert_not_called()

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_sends_reminders_for_multiple_credits(self, mock_push):
        """Multiple eligible credits should each get a reminder."""
        rider1 = self._create_rider()
        rider2 = self._create_rider()
        referee = self._create_rider()
        referral1 = self._create_referral(rider1, referee)
        referee2 = self._create_rider()
        referral2 = self._create_referral(rider2, referee2)

        self._create_credit(
            rider1, referral1,
            expires_at=timezone.now() + timedelta(days=3),
        )
        self._create_credit(
            rider2, referral2,
            expires_at=timezone.now() + timedelta(days=6),
        )

        count = self.service.send_expiration_reminders()

        assert count == 2
        assert mock_push.call_count == 2

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_idempotent_second_call_returns_zero(self, mock_push):
        """Calling send_expiration_reminders twice should send on first, return 0 on second."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=5),
        )

        first_count = self.service.send_expiration_reminders()
        second_count = self.service.send_expiration_reminders()

        assert first_count == 1
        assert second_count == 0

    @patch("referrals.services.credit_expiration_service.send_push_notification")
    def test_notification_contains_amount_and_expiry_date(self, mock_push):
        """The push notification body should mention the credit amount and expiration date."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)

        expires_at = timezone.now() + timedelta(days=4)
        self._create_credit(
            rider, referral,
            remaining=Decimal("75.50"),
            expires_at=expires_at,
        )

        self.service.send_expiration_reminders()

        mock_push.assert_called_once()
        call_args = mock_push.call_args
        body = call_args[0][2]
        # Body should contain the remaining amount
        assert "75.50" in body
        # Body should contain the formatted expiration date
        expected_date = expires_at.strftime("%B %d, %Y")
        assert expected_date in body


@pytest.mark.django_db
class TestIsCreditUsable:
    """Tests for CreditExpirationService.is_credit_usable"""

    def setup_method(self):
        self.service = CreditExpirationService()

    def _create_rider(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"rider_{unique}@test.com",
            password="testpass123",
            user_type="rider",
        )
        return user

    def _create_referral(self, referrer, referee):
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )
        return referral

    def _create_credit(
        self, rider, referral, *, status="active", remaining=Decimal("50.00"),
        expires_at=None
    ):
        if expires_at is None:
            expires_at = timezone.now() + timedelta(days=30)
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=remaining,
            status=status,
            credit_type="referrer",
            expires_at=expires_at,
        )

    def test_active_credit_with_future_expiry_is_usable(self):
        """An active credit with future expires_at and positive remaining is usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() + timedelta(days=30),
        )

        assert self.service.is_credit_usable(credit) is True

    def test_expired_status_credit_is_not_usable(self):
        """A credit with status='expired' is not usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="expired",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() - timedelta(days=1),
        )

        assert self.service.is_credit_usable(credit) is False

    def test_active_credit_past_expiration_date_is_not_usable(self):
        """An active credit past expires_at is not usable (even before periodic task runs)."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="active",
            expires_at=timezone.now() - timedelta(hours=1),
        )

        assert self.service.is_credit_usable(credit) is False

    def test_used_credit_is_not_usable(self):
        """A credit with status='used' is not usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="used",
            remaining=Decimal("0.00"),
        )

        assert self.service.is_credit_usable(credit) is False

    def test_revoked_credit_is_not_usable(self):
        """A credit with status='revoked' is not usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="revoked",
            remaining=Decimal("0.00"),
        )

        assert self.service.is_credit_usable(credit) is False

    def test_withheld_credit_is_not_usable(self):
        """A credit with status='withheld' is not usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="withheld",
            remaining=Decimal("50.00"),
        )

        assert self.service.is_credit_usable(credit) is False

    def test_active_credit_with_zero_remaining_is_not_usable(self):
        """An active credit with zero remaining_amount is not usable."""
        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            status="active",
            remaining=Decimal("0.00"),
            expires_at=timezone.now() + timedelta(days=30),
        )

        assert self.service.is_credit_usable(credit) is False


@pytest.mark.django_db
class TestExpireCreditsHonorsActiveRides:
    """Tests that expire_credits honors credits for riders with active rides."""

    def setup_method(self):
        self.service = CreditExpirationService()

    def _create_rider(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"rider_{unique}@test.com",
            password="testpass123",
            user_type="rider",
        )
        return user

    def _create_referral(self, referrer, referee):
        code_obj, _ = RiderReferralCode.objects.get_or_create(
            rider=referrer,
            defaults={"code": secrets.token_hex(4)[:8].upper()},
        )
        referral = RiderReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            status="completed",
        )
        return referral

    def _create_credit(
        self, rider, referral, *, status="active", remaining=Decimal("50.00"),
        expires_at=None
    ):
        if expires_at is None:
            expires_at = timezone.now() - timedelta(days=1)
        return RideCredit.objects.create(
            rider=rider,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=remaining,
            status=status,
            credit_type="referrer",
            expires_at=expires_at,
        )

    def test_does_not_expire_credit_for_rider_with_in_progress_ride(self):
        """Credits for riders with in_progress rides should be honored (not expired)."""
        from taxi.rides.models.ride import Ride

        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(hours=2),
        )

        # Create an in-progress ride for the rider
        Ride.objects.create(
            rider=rider,
            pickup="Start",
            destination="End",
            status="in_progress",
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "active"
        assert credit.remaining_amount == Decimal("50.00")

    def test_does_not_expire_credit_for_rider_with_scheduled_ride(self):
        """Credits for riders with scheduled rides should be honored (not expired)."""
        from taxi.rides.models.ride import Ride

        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(hours=2),
        )

        # Create a scheduled ride for the rider
        Ride.objects.create(
            rider=rider,
            pickup="Start",
            destination="End",
            status="scheduled",
        )

        count = self.service.expire_credits()

        assert count == 0
        credit.refresh_from_db()
        assert credit.status == "active"
        assert credit.remaining_amount == Decimal("50.00")

    def test_expires_credit_for_rider_with_completed_ride_only(self):
        """Credits for riders whose rides are already completed SHOULD be expired."""
        from taxi.rides.models.ride import Ride

        rider = self._create_rider()
        referee = self._create_rider()
        referral = self._create_referral(rider, referee)
        credit = self._create_credit(
            rider, referral,
            expires_at=timezone.now() - timedelta(hours=2),
        )

        # Create a completed ride — should not protect the credit
        Ride.objects.create(
            rider=rider,
            pickup="Start",
            destination="End",
            status="completed",
        )

        count = self.service.expire_credits()

        assert count == 1
        credit.refresh_from_db()
        assert credit.status == "expired"
        assert credit.remaining_amount == Decimal("0.00")
