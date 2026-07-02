import secrets

import pytest
from unittest.mock import patch

from referrals.models import DriverReferral, DriverReferralCode, RewardConfiguration
from referrals.services.driver_referral_service import (
    DriverReferralService,
    DriverReferralStatus,
    ValidationResult,
)


@pytest.mark.django_db
class TestDriverGenerateReferralCode:
    """Tests for DriverReferralService.generate_referral_code"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
        )
        return user

    def test_generates_8_char_alphanumeric_code(self):
        """Code should be exactly 8 characters from [A-Z, 0-9]."""
        import re

        driver = self._create_driver()
        code = self.service.generate_referral_code(driver)

        assert len(code) == 8
        assert re.match(r"^[A-Z0-9]{8}$", code)

    def test_returns_existing_code_if_already_generated(self):
        """Calling generate twice should return the same code (idempotent)."""
        driver = self._create_driver()
        code1 = self.service.generate_referral_code(driver)
        code2 = self.service.generate_referral_code(driver)

        assert code1 == code2

    def test_stores_code_as_uppercase(self):
        """Code stored in the database should be uppercase."""
        driver = self._create_driver()
        code = self.service.generate_referral_code(driver)
        db_code = DriverReferralCode.objects.get(driver=driver).code

        assert db_code == db_code.upper()
        assert code == db_code

    def test_different_drivers_get_different_codes(self):
        """Two different drivers should get unique codes."""
        driver1 = self._create_driver()
        driver2 = self._create_driver()

        code1 = self.service.generate_referral_code(driver1)
        code2 = self.service.generate_referral_code(driver2)

        assert code1 != code2

    def test_raises_error_after_max_attempts_on_collision(self):
        """Should raise RuntimeError after 5 failed attempts."""
        driver = self._create_driver()

        # Create an existing code to cause collisions
        existing_driver = self._create_driver()
        existing_code = self.service.generate_referral_code(existing_driver)

        with patch.object(
            self.service,
            "_generate_random_code",
            return_value=existing_code,
        ):
            with pytest.raises(RuntimeError, match="Unable to generate"):
                self.service.generate_referral_code(driver)

    def test_retries_on_collision_and_succeeds(self):
        """Should retry on collision and succeed with a unique code."""
        driver = self._create_driver()

        # Create existing code
        existing_driver = self._create_driver()
        existing_code = self.service.generate_referral_code(existing_driver)

        # First 2 calls return the existing code (collision), third returns unique
        unique_code = "ZZZZ9999"
        call_count = {"n": 0}

        def mock_generate():
            call_count["n"] += 1
            if call_count["n"] <= 2:
                return existing_code
            return unique_code

        with patch.object(self.service, "_generate_random_code", side_effect=mock_generate):
            code = self.service.generate_referral_code(driver)

        assert code == unique_code
        assert call_count["n"] == 3

    def test_case_insensitive_collision_detection(self):
        """Should detect collisions case-insensitively."""
        driver1 = self._create_driver()
        driver2 = self._create_driver()

        # Generate a code for driver1
        code1 = self.service.generate_referral_code(driver1)

        # Mock to return lowercase version first (collision), then unique
        unique_code = "YYYY8888"
        call_count = {"n": 0}

        def mock_generate():
            call_count["n"] += 1
            if call_count["n"] == 1:
                return code1.lower()  # lowercase variant should collide
            return unique_code

        with patch.object(self.service, "_generate_random_code", side_effect=mock_generate):
            code2 = self.service.generate_referral_code(driver2)

        assert code2 == unique_code
        assert call_count["n"] == 2


@pytest.mark.django_db
class TestDriverValidateReferralCode:
    """Tests for DriverReferralService.validate_referral_code"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            is_active=is_active,
        )
        return user

    def test_rejects_invalid_format_too_short(self):
        """Codes shorter than 8 chars should be rejected with invalid_format."""
        referee = self._create_driver()
        result = self.service.validate_referral_code("ABC123", referee)

        assert result.is_valid is False
        assert result.error_code == "invalid_format"
        assert result.referral_code_obj is None

    def test_rejects_invalid_format_too_long(self):
        """Codes longer than 8 chars should be rejected with invalid_format."""
        referee = self._create_driver()
        result = self.service.validate_referral_code("ABCDEFGH9", referee)

        assert result.is_valid is False
        assert result.error_code == "invalid_format"

    def test_rejects_invalid_format_special_chars(self):
        """Codes with special characters should be rejected with invalid_format."""
        referee = self._create_driver()
        result = self.service.validate_referral_code("ABC!@#12", referee)

        assert result.is_valid is False
        assert result.error_code == "invalid_format"

    def test_rejects_empty_string(self):
        """Empty string should be rejected with invalid_format."""
        referee = self._create_driver()
        result = self.service.validate_referral_code("", referee)

        assert result.is_valid is False
        assert result.error_code == "invalid_format"

    def test_rejects_code_not_found(self):
        """A valid format code that doesn't exist returns code_not_found."""
        referee = self._create_driver()
        result = self.service.validate_referral_code("ZZZZ9999", referee)

        assert result.is_valid is False
        assert result.error_code == "code_not_found"

    def test_rejects_inactive_referrer(self):
        """Code belonging to an inactive driver should return referrer_inactive."""
        referrer = self._create_driver(is_active=False)
        referee = self._create_driver()

        # Create a code for the inactive referrer directly
        DriverReferralCode.objects.create(driver=referrer, code="ABCD1234")

        result = self.service.validate_referral_code("ABCD1234", referee)

        assert result.is_valid is False
        assert result.error_code == "referrer_inactive"

    def test_rejects_self_referral(self):
        """Using your own code should return self_referral."""
        driver = self._create_driver()
        code = self.service.generate_referral_code(driver)

        result = self.service.validate_referral_code(code, driver)

        assert result.is_valid is False
        assert result.error_code == "self_referral"

    def test_accepts_valid_code(self):
        """A valid code for an active, different driver should pass."""
        referrer = self._create_driver()
        referee = self._create_driver()
        code = self.service.generate_referral_code(referrer)

        result = self.service.validate_referral_code(code, referee)

        assert result.is_valid is True
        assert result.error_code is None
        assert result.error_message is None
        assert result.referral_code_obj is not None
        assert result.referral_code_obj.driver == referrer

    def test_case_insensitive_lookup(self):
        """Lookup should work regardless of case."""
        referrer = self._create_driver()
        referee = self._create_driver()
        code = self.service.generate_referral_code(referrer)

        # Validate with lowercase version
        result = self.service.validate_referral_code(code.lower(), referee)

        assert result.is_valid is True
        assert result.referral_code_obj.code == code


@pytest.mark.django_db
class TestDriverRecordReferralSignup:
    """Tests for DriverReferralService.record_referral_signup"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            is_active=is_active,
        )
        return user

    def _ensure_active_config(self, ride_threshold=20):
        """Ensure an active RewardConfiguration exists."""
        from django.core.cache import cache

        RewardConfiguration.objects.filter(is_active=True).update(
            is_active=False
        )
        config = RewardConfiguration.objects.create(
            is_active=True,
            driver_ride_threshold=ride_threshold,
        )
        # Invalidate the RewardConfigService cache
        cache.delete("referral:reward_config:active")
        return config

    def test_records_referral_with_threshold_snapshot(self):
        """Should create a DriverReferral with ride_threshold from active config."""
        config = self._ensure_active_config(ride_threshold=25)
        referrer = self._create_driver()
        referee = self._create_driver()
        code = self.service.generate_referral_code(referrer)

        referral = self.service.record_referral_signup(referee, code)

        assert referral.referee == referee
        assert referral.referral_code.driver == referrer
        assert referral.ride_threshold == 25
        assert referral.status == "pending"
        assert referral.completed_rides == 0

    def test_enforces_one_referral_per_account(self):
        """Second referral for the same driver should raise ValueError."""
        self._ensure_active_config()
        referrer1 = self._create_driver()
        referrer2 = self._create_driver()
        referee = self._create_driver()
        code1 = self.service.generate_referral_code(referrer1)
        code2 = self.service.generate_referral_code(referrer2)

        # First signup succeeds
        self.service.record_referral_signup(referee, code1)

        # Second signup should raise ValueError
        with pytest.raises(ValueError, match="already has a referral"):
            self.service.record_referral_signup(referee, code2)

    def test_raises_on_invalid_code(self):
        """Should raise ValueError if the code fails validation."""
        self._ensure_active_config()
        referee = self._create_driver()

        with pytest.raises(ValueError, match="not recognized"):
            self.service.record_referral_signup(referee, "ZZZZ0000")

    def test_raises_on_self_referral(self):
        """Should raise ValueError on self-referral."""
        self._ensure_active_config()
        driver = self._create_driver()
        code = self.service.generate_referral_code(driver)

        with pytest.raises(ValueError, match="cannot use your own"):
            self.service.record_referral_signup(driver, code)

    def test_uses_current_active_config_threshold(self):
        """Should use the threshold from whatever config is active at signup time."""
        # Create first config with threshold 10
        self._ensure_active_config(ride_threshold=10)
        referrer = self._create_driver()
        referee1 = self._create_driver()
        code = self.service.generate_referral_code(referrer)

        referral1 = self.service.record_referral_signup(referee1, code)
        assert referral1.ride_threshold == 10

        # Update config to threshold 30
        self._ensure_active_config(ride_threshold=30)
        referee2 = self._create_driver()

        referral2 = self.service.record_referral_signup(referee2, code)
        assert referral2.ride_threshold == 30

    def test_creates_referral_in_database(self):
        """Should persist the DriverReferral in the database."""
        self._ensure_active_config()
        referrer = self._create_driver()
        referee = self._create_driver()
        code = self.service.generate_referral_code(referrer)

        self.service.record_referral_signup(referee, code)

        assert DriverReferral.objects.filter(referee=referee).exists()
        referral = DriverReferral.objects.get(referee=referee)
        assert referral.referral_code.driver == referrer


@pytest.mark.django_db
class TestDriverExpireStaleReferrals:
    """Tests for DriverReferralService.expire_stale_referrals"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            is_active=is_active,
        )
        return user

    def _ensure_active_config(self, ride_threshold=20):
        """Ensure an active RewardConfiguration exists."""
        from django.core.cache import cache

        RewardConfiguration.objects.filter(is_active=True).update(
            is_active=False
        )
        config = RewardConfiguration.objects.create(
            is_active=True,
            driver_ride_threshold=ride_threshold,
        )
        cache.delete("referral:reward_config:active")
        return config

    def _create_referral(self, referrer, referee, ride_threshold=20):
        """Helper to create a DriverReferral directly."""
        code_obj = DriverReferralCode.objects.get_or_create(
            driver=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
        )[0]
        referral = DriverReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            ride_threshold=ride_threshold,
            status="pending",
            completed_rides=0,
        )
        return referral

    def test_expires_referral_with_no_rides_after_90_days(self):
        """Referral with no rides and created_at > 90 days ago should expire."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Backdate created_at to 91 days ago
        old_date = timezone.now() - timedelta(days=91)
        DriverReferral.objects.filter(pk=referral.pk).update(created_at=old_date)

        count = self.service.expire_stale_referrals()

        assert count == 1
        referral.refresh_from_db()
        assert referral.status == "expired"
        assert referral.expired_at is not None

    def test_does_not_expire_referral_within_90_days_no_rides(self):
        """Referral created less than 90 days ago with no rides should not expire."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Set created_at to 89 days ago (within 90 day window)
        recent_date = timezone.now() - timedelta(days=89)
        DriverReferral.objects.filter(pk=referral.pk).update(created_at=recent_date)

        count = self.service.expire_stale_referrals()

        assert count == 0
        referral.refresh_from_db()
        assert referral.status == "pending"
        assert referral.expired_at is None

    def test_expires_referral_with_last_ride_over_90_days_ago(self):
        """Referral with last_ride_at > 90 days ago should expire."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Set last_ride_at to 91 days ago, with some rides but below threshold
        old_ride_date = timezone.now() - timedelta(days=91)
        DriverReferral.objects.filter(pk=referral.pk).update(
            last_ride_at=old_ride_date,
            completed_rides=5,
        )

        count = self.service.expire_stale_referrals()

        assert count == 1
        referral.refresh_from_db()
        assert referral.status == "expired"

    def test_does_not_expire_referral_with_recent_ride(self):
        """Referral with last_ride_at within 90 days should not expire."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Set last_ride_at to 30 days ago
        recent_ride = timezone.now() - timedelta(days=30)
        DriverReferral.objects.filter(pk=referral.pk).update(
            last_ride_at=recent_ride,
            completed_rides=5,
        )

        count = self.service.expire_stale_referrals()

        assert count == 0
        referral.refresh_from_db()
        assert referral.status == "pending"

    def test_does_not_expire_completed_referrals(self):
        """Referrals with status 'completed' should not be expired."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Set as completed but with old dates
        old_date = timezone.now() - timedelta(days=100)
        DriverReferral.objects.filter(pk=referral.pk).update(
            status="completed",
            created_at=old_date,
            completed_rides=20,
        )

        count = self.service.expire_stale_referrals()

        assert count == 0
        referral.refresh_from_db()
        assert referral.status == "completed"

    def test_does_not_expire_referral_at_threshold(self):
        """Referral with rides at threshold should not expire (even if old)."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        # Set rides at threshold with old dates
        old_date = timezone.now() - timedelta(days=100)
        DriverReferral.objects.filter(pk=referral.pk).update(
            created_at=old_date,
            last_ride_at=old_date,
            completed_rides=20,  # at threshold
        )

        count = self.service.expire_stale_referrals()

        assert count == 0
        referral.refresh_from_db()
        assert referral.status == "pending"

    def test_returns_count_of_expired_referrals(self):
        """Should return the total count of expired referrals."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        old_date = timezone.now() - timedelta(days=91)

        # Create 3 stale referrals
        for _ in range(3):
            referee = self._create_driver()
            referral = self._create_referral(referrer, referee, ride_threshold=20)
            DriverReferral.objects.filter(pk=referral.pk).update(created_at=old_date)

        count = self.service.expire_stale_referrals()
        assert count == 3

    def test_sets_expired_at_timestamp(self):
        """expired_at should be set to approximately now when expired."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        old_date = timezone.now() - timedelta(days=91)
        DriverReferral.objects.filter(pk=referral.pk).update(created_at=old_date)

        before = timezone.now()
        self.service.expire_stale_referrals()
        after = timezone.now()

        referral.refresh_from_db()
        assert referral.expired_at is not None
        assert before <= referral.expired_at <= after

    def test_notification_is_sent_on_expiration(self):
        """Should call _send_expiration_notification for each expired referral."""
        from datetime import timedelta
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=20)

        old_date = timezone.now() - timedelta(days=91)
        DriverReferral.objects.filter(pk=referral.pk).update(created_at=old_date)

        with patch.object(
            self.service, "_send_expiration_notification"
        ) as mock_notify:
            self.service.expire_stale_referrals()
            mock_notify.assert_called_once_with(referrer, referee)


@pytest.mark.django_db
class TestDriverIncrementRideCount:
    """Tests for DriverReferralService.increment_ride_count"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, first_name="Test", last_name="Driver"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            first_name=first_name,
            last_name=last_name,
        )
        return user

    def _ensure_active_config(self, ride_threshold=20):
        from django.core.cache import cache

        RewardConfiguration.objects.filter(is_active=True).update(
            is_active=False
        )
        config = RewardConfiguration.objects.create(
            is_active=True,
            driver_ride_threshold=ride_threshold,
        )
        cache.delete("referral:reward_config:active")
        return config

    def _create_referral(self, referrer, referee, ride_threshold=20):
        """Create a pending DriverReferral for testing."""
        code = self.service.generate_referral_code(referrer)
        referral_code_obj = DriverReferralCode.objects.get(driver=referrer)
        return DriverReferral.objects.create(
            referral_code=referral_code_obj,
            referee=referee,
            ride_threshold=ride_threshold,
            status="pending",
        )

    def test_increments_ride_count_for_pending_referral(self):
        """Should increment completed_rides by 1 for a pending referral."""
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=10)

        result = self.service.increment_ride_count(referee)

        assert result is not None
        referral.refresh_from_db()
        assert referral.completed_rides == 1

    def test_updates_last_ride_at(self):
        """Should set last_ride_at to approximately now."""
        from django.utils import timezone as tz

        referrer = self._create_driver()
        referee = self._create_driver()
        self._create_referral(referrer, referee, ride_threshold=10)

        before = tz.now()
        result = self.service.increment_ride_count(referee)
        after = tz.now()

        assert result is not None
        assert result.last_ride_at is not None
        assert before <= result.last_ride_at <= after

    def test_returns_none_for_driver_without_referral(self):
        """Should return None if the driver has no pending referral."""
        driver = self._create_driver()

        result = self.service.increment_ride_count(driver)

        assert result is None

    def test_returns_none_for_completed_referral(self):
        """Should return None if the referral status is not 'pending'."""
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=5)
        referral.status = "completed"
        referral.save()

        result = self.service.increment_ride_count(referee)

        assert result is None

    def test_returns_none_for_expired_referral(self):
        """Should return None if the referral status is 'expired'."""
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=5)
        referral.status = "expired"
        referral.save()

        result = self.service.increment_ride_count(referee)

        assert result is None

    def test_does_not_increment_at_threshold(self):
        """Should not increment if completed_rides already equals ride_threshold."""
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=5)
        referral.completed_rides = 5
        referral.save()

        result = self.service.increment_ride_count(referee)

        assert result is None
        referral.refresh_from_db()
        assert referral.completed_rides == 5

    def test_increments_up_to_threshold(self):
        """Should increment when completed_rides is one below threshold."""
        referrer = self._create_driver()
        referee = self._create_driver()
        referral = self._create_referral(referrer, referee, ride_threshold=5)
        referral.completed_rides = 4
        referral.save()

        result = self.service.increment_ride_count(referee)

        assert result is not None
        referral.refresh_from_db()
        assert referral.completed_rides == 5

    def test_multiple_increments(self):
        """Should increment correctly over multiple calls."""
        referrer = self._create_driver()
        referee = self._create_driver()
        self._create_referral(referrer, referee, ride_threshold=10)

        for i in range(3):
            result = self.service.increment_ride_count(referee)
            assert result is not None

        referral = DriverReferral.objects.get(referee=referee)
        assert referral.completed_rides == 3


@pytest.mark.django_db
class TestDriverGetReferralStatus:
    """Tests for DriverReferralService.get_referral_status"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, first_name="Test", last_name="Driver"):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            first_name=first_name,
            last_name=last_name,
        )
        return user

    def _create_referral(self, referrer, referee, ride_threshold=20, status="pending", completed_rides=0):
        """Create a DriverReferral for testing."""
        referral_code_obj = DriverReferralCode.objects.get(driver=referrer)
        return DriverReferral.objects.create(
            referral_code=referral_code_obj,
            referee=referee,
            ride_threshold=ride_threshold,
            status=status,
            completed_rides=completed_rides,
        )

    def test_returns_empty_list_for_driver_without_code(self):
        """Should return empty list if the referrer has no referral code."""
        driver = self._create_driver()

        result = self.service.get_referral_status(driver)

        assert result == []

    def test_returns_empty_list_for_driver_with_no_referrals(self):
        """Should return empty list if referrer has a code but no referrals."""
        referrer = self._create_driver()
        self.service.generate_referral_code(referrer)

        result = self.service.get_referral_status(referrer)

        assert result == []

    def test_returns_status_for_single_referral(self):
        """Should return correct status for a single referred driver."""
        from referrals.services.driver_referral_service import DriverReferralStatus

        referrer = self._create_driver(first_name="Referrer", last_name="One")
        referee = self._create_driver(first_name="Referee", last_name="Two")
        self.service.generate_referral_code(referrer)
        self._create_referral(referrer, referee, ride_threshold=20, completed_rides=5)

        result = self.service.get_referral_status(referrer)

        assert len(result) == 1
        assert isinstance(result[0], DriverReferralStatus)
        assert result[0].referee_name == "Referee Two"
        assert result[0].completed_rides == 5
        assert result[0].ride_threshold == 20
        assert result[0].status == "pending"

    def test_returns_multiple_referral_statuses(self):
        """Should return statuses for all referred drivers."""
        referrer = self._create_driver()
        self.service.generate_referral_code(referrer)

        referee1 = self._create_driver(first_name="Alice", last_name="Smith")
        referee2 = self._create_driver(first_name="Bob", last_name="Jones")
        referee3 = self._create_driver(first_name="Charlie", last_name="Brown")

        self._create_referral(referrer, referee1, ride_threshold=20, status="pending", completed_rides=10)
        self._create_referral(referrer, referee2, ride_threshold=20, status="completed", completed_rides=20)
        self._create_referral(referrer, referee3, ride_threshold=20, status="expired", completed_rides=3)

        result = self.service.get_referral_status(referrer)

        assert len(result) == 3
        names = [s.referee_name for s in result]
        assert "Alice Smith" in names
        assert "Bob Jones" in names
        assert "Charlie Brown" in names

        statuses = {s.referee_name: s.status for s in result}
        assert statuses["Alice Smith"] == "pending"
        assert statuses["Bob Jones"] == "completed"
        assert statuses["Charlie Brown"] == "expired"

    def test_uses_email_when_name_is_empty(self):
        """Should fall back to email when first_name and last_name are empty."""
        referrer = self._create_driver()
        referee = self._create_driver(first_name="", last_name="")
        self.service.generate_referral_code(referrer)
        self._create_referral(referrer, referee, ride_threshold=10)

        result = self.service.get_referral_status(referrer)

        assert len(result) == 1
        assert result[0].referee_name == referee.email

    def test_status_reflects_correct_values(self):
        """Each status should correctly reflect pending/completed/expired."""
        referrer = self._create_driver()
        self.service.generate_referral_code(referrer)

        for status_val in ["pending", "completed", "expired"]:
            referee = self._create_driver(first_name=status_val.capitalize(), last_name="Test")
            self._create_referral(referrer, referee, ride_threshold=20, status=status_val)

        result = self.service.get_referral_status(referrer)

        assert len(result) == 3
        result_statuses = {s.referee_name: s.status for s in result}
        assert result_statuses["Pending Test"] == "pending"
        assert result_statuses["Completed Test"] == "completed"
        assert result_statuses["Expired Test"] == "expired"


@pytest.mark.django_db
class TestDriverReleasePendingBonuses:
    """Tests for DriverReferralService.release_pending_bonuses"""

    def setup_method(self):
        self.service = DriverReferralService()

    def _create_driver(self, first_name="Test", last_name="Driver", is_active=True):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        unique = secrets.token_hex(4)
        user = User.objects.create_user(
            email=f"driver_{unique}@test.com",
            password="testpass123",
            first_name=first_name,
            last_name=last_name,
            is_active=is_active,
        )
        return user

    def _ensure_active_config(self, ride_threshold=20):
        """Ensure an active RewardConfiguration exists."""
        from django.core.cache import cache

        RewardConfiguration.objects.filter(is_active=True).update(
            is_active=False
        )
        config = RewardConfiguration.objects.create(
            is_active=True,
            driver_ride_threshold=ride_threshold,
        )
        cache.delete("referral:reward_config:active")
        return config

    def _create_referral_with_bonus(self, referrer, referee, bonus_status="withheld"):
        """Create a completed DriverReferral with a DriverBonus."""
        from referrals.models import DriverBonus

        code_obj = DriverReferralCode.objects.get_or_create(
            driver=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
        )[0]
        referral = DriverReferral.objects.create(
            referral_code=code_obj,
            referee=referee,
            ride_threshold=20,
            status="completed",
            completed_rides=20,
        )
        bonus = DriverBonus.objects.create(
            referral=referral,
            referrer=referrer,
            amount=500.00,
            status=bonus_status,
        )
        return referral, bonus

    def test_releases_all_withheld_bonuses(self):
        """Should set status to 'released' for all withheld bonuses."""
        from referrals.models import DriverBonus

        referrer = self._create_driver()
        referee1 = self._create_driver(first_name="Alice", last_name="Smith")
        referee2 = self._create_driver(first_name="Bob", last_name="Jones")

        _, bonus1 = self._create_referral_with_bonus(referrer, referee1, "withheld")
        _, bonus2 = self._create_referral_with_bonus(referrer, referee2, "withheld")

        count = self.service.release_pending_bonuses(referrer)

        assert count == 2
        bonus1.refresh_from_db()
        bonus2.refresh_from_db()
        assert bonus1.status == "released"
        assert bonus2.status == "released"

    def test_sets_released_at_timestamp(self):
        """Should set released_at to approximately now."""
        from django.utils import timezone

        referrer = self._create_driver()
        referee = self._create_driver()
        _, bonus = self._create_referral_with_bonus(referrer, referee, "withheld")

        before = timezone.now()
        self.service.release_pending_bonuses(referrer)
        after = timezone.now()

        bonus.refresh_from_db()
        assert bonus.released_at is not None
        assert before <= bonus.released_at <= after

    def test_returns_zero_when_no_withheld_bonuses(self):
        """Should return 0 if the driver has no withheld bonuses."""
        referrer = self._create_driver()

        count = self.service.release_pending_bonuses(referrer)

        assert count == 0

    def test_does_not_release_issued_bonuses(self):
        """Should only release 'withheld' bonuses, not 'issued' ones."""
        referrer = self._create_driver()
        referee = self._create_driver()
        _, bonus = self._create_referral_with_bonus(referrer, referee, "issued")

        count = self.service.release_pending_bonuses(referrer)

        assert count == 0
        bonus.refresh_from_db()
        assert bonus.status == "issued"

    def test_does_not_release_revoked_bonuses(self):
        """Should only release 'withheld' bonuses, not 'revoked' ones."""
        referrer = self._create_driver()
        referee = self._create_driver()
        _, bonus = self._create_referral_with_bonus(referrer, referee, "revoked")

        count = self.service.release_pending_bonuses(referrer)

        assert count == 0
        bonus.refresh_from_db()
        assert bonus.status == "revoked"

    def test_does_not_release_other_drivers_bonuses(self):
        """Should only release bonuses belonging to the specified driver."""
        referrer1 = self._create_driver()
        referrer2 = self._create_driver()
        referee1 = self._create_driver()
        referee2 = self._create_driver()

        _, bonus1 = self._create_referral_with_bonus(referrer1, referee1, "withheld")
        _, bonus2 = self._create_referral_with_bonus(referrer2, referee2, "withheld")

        count = self.service.release_pending_bonuses(referrer1)

        assert count == 1
        bonus1.refresh_from_db()
        bonus2.refresh_from_db()
        assert bonus1.status == "released"
        assert bonus2.status == "withheld"

    def test_sends_notification_for_each_released_bonus(self):
        """Should call _send_bonus_released_notification for each released bonus."""
        referrer = self._create_driver()
        referee1 = self._create_driver(first_name="Alice", last_name="Smith")
        referee2 = self._create_driver(first_name="Bob", last_name="Jones")

        self._create_referral_with_bonus(referrer, referee1, "withheld")
        self._create_referral_with_bonus(referrer, referee2, "withheld")

        with patch.object(
            DriverReferralService, "_send_bonus_released_notification"
        ) as mock_notify:
            self.service.release_pending_bonuses(referrer)
            assert mock_notify.call_count == 2

    def test_notification_receives_correct_arguments(self):
        """Notification should be called with referrer, referee, and amount."""
        from decimal import Decimal

        referrer = self._create_driver(first_name="Referrer", last_name="Driver")
        referee = self._create_driver(first_name="Referee", last_name="Driver")

        self._create_referral_with_bonus(referrer, referee, "withheld")

        with patch.object(
            DriverReferralService, "_send_bonus_released_notification"
        ) as mock_notify:
            self.service.release_pending_bonuses(referrer)
            mock_notify.assert_called_once_with(
                referrer, referee, Decimal("500.00")
            )

    def test_returns_correct_count_with_mixed_statuses(self):
        """Should only count and release withheld bonuses among mixed statuses."""
        referrer = self._create_driver()
        referee1 = self._create_driver()
        referee2 = self._create_driver()
        referee3 = self._create_driver()

        self._create_referral_with_bonus(referrer, referee1, "withheld")
        self._create_referral_with_bonus(referrer, referee2, "issued")
        self._create_referral_with_bonus(referrer, referee3, "withheld")

        count = self.service.release_pending_bonuses(referrer)

        assert count == 2
