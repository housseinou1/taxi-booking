from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache

from referrals.models import RewardConfiguration
from referrals.services.reward_config_service import RewardConfigService

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear cache before each test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_user(db):
    """Create an admin user for testing."""
    return User.objects.create_user(
        email="admin@yala-test.com",
        password="adminpass123",
        first_name="Admin",
        last_name="User",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def service():
    """Return a RewardConfigService instance."""
    return RewardConfigService()


@pytest.fixture
def active_config(db):
    """Create an active RewardConfiguration."""
    return RewardConfiguration.objects.create(
        rider_referrer_credit=Decimal("50.00"),
        rider_referee_credit=Decimal("50.00"),
        driver_bonus_amount=Decimal("500.00"),
        driver_ride_threshold=20,
        rider_credit_cap_count=10,
        rider_credit_cap_days=30,
        driver_bonus_cap_count=5,
        driver_bonus_cap_days=30,
        credit_expiration_days=90,
        is_active=True,
    )


@pytest.mark.django_db
class TestGetActiveConfig:
    """Tests for RewardConfigService.get_active_config()."""

    def test_returns_existing_active_config(self, service, active_config):
        """Should return the existing active configuration."""
        result = service.get_active_config()
        assert result.pk == active_config.pk
        assert result.is_active is True

    def test_creates_default_config_when_none_exists(self, service):
        """Should create a default config when no active one exists."""
        assert RewardConfiguration.objects.filter(is_active=True).count() == 0
        result = service.get_active_config()
        assert result.is_active is True
        assert result.rider_referrer_credit == Decimal("50.00")
        assert result.driver_ride_threshold == 20

    def test_caches_config_on_first_call(self, service, active_config):
        """Should cache the config after first DB hit."""
        service.get_active_config()
        # Second call should hit cache, not DB
        cached = cache.get(service.CACHE_KEY)
        assert cached is not None
        assert cached.pk == active_config.pk

    def test_returns_cached_config_on_subsequent_calls(
        self, service, active_config
    ):
        """Should return cached config without hitting DB again."""
        first = service.get_active_config()
        # Modify config in DB but don't invalidate cache
        active_config.rider_referrer_credit = Decimal("999.00")
        active_config.save()
        second = service.get_active_config()
        # Should still return original cached value
        assert second.rider_referrer_credit == Decimal("50.00")
        assert first.pk == second.pk


@pytest.mark.django_db
class TestUpdateConfig:
    """Tests for RewardConfigService.update_config()."""

    def test_creates_new_active_config(
        self, service, admin_user, active_config
    ):
        """Should deactivate old config and create new active one."""
        new_config = service.update_config(
            admin_user, rider_referrer_credit=Decimal("75.00")
        )
        assert new_config.is_active is True
        assert new_config.rider_referrer_credit == Decimal("75.00")
        assert new_config.updated_by == admin_user
        # Old config should be deactivated
        active_config.refresh_from_db()
        assert active_config.is_active is False

    def test_preserves_unchanged_fields(
        self, service, admin_user, active_config
    ):
        """Should carry over values not specified in update."""
        new_config = service.update_config(
            admin_user, driver_ride_threshold=30
        )
        assert new_config.driver_ride_threshold == 30
        # Unchanged fields should keep previous values
        assert new_config.rider_referrer_credit == Decimal("50.00")
        assert new_config.driver_bonus_amount == Decimal("500.00")

    def test_invalidates_cache_on_update(
        self, service, admin_user, active_config
    ):
        """Should invalidate cache after successful update."""
        # Populate cache
        service.get_active_config()
        assert cache.get(service.CACHE_KEY) is not None
        # Update config
        service.update_config(admin_user, driver_ride_threshold=25)
        # Cache should be cleared
        assert cache.get(service.CACHE_KEY) is None

    def test_raises_value_error_on_invalid_values(
        self, service, admin_user, active_config
    ):
        """Should raise ValueError with error list for invalid values."""
        with pytest.raises(ValueError) as exc_info:
            service.update_config(
                admin_user, rider_referrer_credit=Decimal("0.00")
            )
        errors = exc_info.value.args[0]
        assert len(errors) == 1
        assert "rider_referrer_credit" in errors[0]

    def test_does_not_modify_db_on_validation_failure(
        self, service, admin_user, active_config
    ):
        """Should not deactivate old config if validation fails."""
        with pytest.raises(ValueError):
            service.update_config(
                admin_user, driver_ride_threshold=0
            )
        active_config.refresh_from_db()
        assert active_config.is_active is True

    def test_update_multiple_fields(self, service, admin_user, active_config):
        """Should update multiple fields at once."""
        new_config = service.update_config(
            admin_user,
            rider_referrer_credit=Decimal("100.00"),
            driver_bonus_amount=Decimal("1000.00"),
            credit_expiration_days=180,
        )
        assert new_config.rider_referrer_credit == Decimal("100.00")
        assert new_config.driver_bonus_amount == Decimal("1000.00")
        assert new_config.credit_expiration_days == 180


@pytest.mark.django_db
class TestValidateConfigValues:
    """Tests for RewardConfigService.validate_config_values()."""

    def test_valid_values_return_empty_list(self, service):
        """Should return empty list for all valid values."""
        errors = service.validate_config_values(
            rider_referrer_credit=Decimal("50.00"),
            rider_referee_credit=Decimal("100.00"),
            driver_bonus_amount=Decimal("500.00"),
            driver_ride_threshold=20,
            rider_credit_cap_count=10,
            rider_credit_cap_days=30,
            driver_bonus_cap_count=5,
            driver_bonus_cap_days=30,
            credit_expiration_days=90,
        )
        assert errors == []

    def test_rejects_value_below_min(self, service):
        """Should reject values below minimum."""
        errors = service.validate_config_values(
            rider_referrer_credit=Decimal("0.00")
        )
        assert len(errors) == 1
        assert "rider_referrer_credit" in errors[0]
        assert "0.01" in errors[0]
        assert "10000.00" in errors[0]

    def test_rejects_value_above_max(self, service):
        """Should reject values above maximum."""
        errors = service.validate_config_values(
            driver_bonus_amount=Decimal("50001.00")
        )
        assert len(errors) == 1
        assert "driver_bonus_amount" in errors[0]

    def test_accepts_boundary_min_values(self, service):
        """Should accept minimum boundary values."""
        errors = service.validate_config_values(
            rider_referrer_credit=Decimal("0.01"),
            driver_ride_threshold=1,
            credit_expiration_days=1,
        )
        assert errors == []

    def test_accepts_boundary_max_values(self, service):
        """Should accept maximum boundary values."""
        errors = service.validate_config_values(
            rider_referrer_credit=Decimal("10000.00"),
            driver_bonus_amount=Decimal("50000.00"),
            driver_ride_threshold=500,
            credit_expiration_days=730,
        )
        assert errors == []

    def test_rejects_unknown_field(self, service):
        """Should reject unknown configuration fields."""
        errors = service.validate_config_values(unknown_field=100)
        assert len(errors) == 1
        assert "unknown_field" in errors[0]

    def test_rejects_invalid_decimal_type(self, service):
        """Should reject non-numeric values for decimal fields."""
        errors = service.validate_config_values(
            rider_referrer_credit="not_a_number"
        )
        assert len(errors) == 1
        assert "rider_referrer_credit" in errors[0]

    def test_rejects_invalid_integer_type(self, service):
        """Should reject non-integer values for integer fields."""
        errors = service.validate_config_values(
            driver_ride_threshold="abc"
        )
        assert len(errors) == 1
        assert "driver_ride_threshold" in errors[0]

    def test_multiple_errors_returned(self, service):
        """Should return all errors when multiple fields are invalid."""
        errors = service.validate_config_values(
            rider_referrer_credit=Decimal("0.00"),
            driver_ride_threshold=0,
            credit_expiration_days=731,
        )
        assert len(errors) == 3

    def test_integer_field_range_validation(self, service):
        """Should enforce integer ranges correctly."""
        errors = service.validate_config_values(
            rider_credit_cap_count=0,
            rider_credit_cap_days=366,
            driver_bonus_cap_count=1001,
            driver_bonus_cap_days=0,
        )
        assert len(errors) == 4
