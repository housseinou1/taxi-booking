from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.cache import cache
from django.db import transaction

from referrals.models import RewardConfiguration


class RewardConfigService:
    """Service for managing configurable referral reward parameters.

    Provides cached access to the active configuration and validation
    of proposed config values against allowed ranges.
    """

    CACHE_KEY = "referral:reward_config:active"
    CACHE_TIMEOUT = 60 * 60  # 1 hour

    # Validation ranges: (min, max) for each configurable field
    FIELD_RANGES: dict[str, tuple[Any, Any]] = {
        "rider_referrer_credit": (Decimal("0.01"), Decimal("10000.00")),
        "rider_referee_credit": (Decimal("0.01"), Decimal("10000.00")),
        "driver_bonus_amount": (Decimal("0.01"), Decimal("50000.00")),
        "driver_ride_threshold": (1, 500),
        "rider_credit_cap_count": (1, 1000),
        "rider_credit_cap_days": (1, 365),
        "driver_bonus_cap_count": (1, 1000),
        "driver_bonus_cap_days": (1, 365),
        "credit_expiration_days": (1, 730),
    }

    def get_active_config(self) -> RewardConfiguration:
        """Get the current active reward configuration, with Redis caching.

        Checks cache first; on miss, queries the database for the active
        config and rebuilds the cache entry. If no active config exists,
        creates one with default values.
        """
        cached = cache.get(self.CACHE_KEY)
        if cached is not None:
            return cached

        config = RewardConfiguration.objects.filter(is_active=True).first()
        if config is None:
            config = RewardConfiguration.objects.create(is_active=True)

        cache.set(self.CACHE_KEY, config, self.CACHE_TIMEOUT)
        return config

    def update_config(self, admin, **kwargs) -> RewardConfiguration:
        """Validate and update the reward configuration.

        Validates all provided values against allowed ranges. On success,
        deactivates the previous active config, creates a new active one
        with the updated values, and invalidates the cache.

        Args:
            admin: The admin user performing the update.
            **kwargs: Field-value pairs to update.

        Returns:
            The newly created active RewardConfiguration instance.

        Raises:
            ValueError: If any proposed values fail validation.
        """
        errors = self.validate_config_values(**kwargs)
        if errors:
            raise ValueError(errors)

        with transaction.atomic():
            # Deactivate all currently active configs
            RewardConfiguration.objects.filter(is_active=True).update(
                is_active=False
            )

            # Build new config from current active values + overrides
            current = (
                RewardConfiguration.objects.filter(is_active=False)
                .order_by("-updated_at")
                .first()
            )

            new_config_data = {}
            for field in self.FIELD_RANGES:
                if field in kwargs:
                    new_config_data[field] = kwargs[field]
                elif current:
                    new_config_data[field] = getattr(current, field)

            new_config = RewardConfiguration.objects.create(
                is_active=True,
                updated_by=admin,
                **new_config_data,
            )

        # Invalidate cache so next read picks up the new config
        cache.delete(self.CACHE_KEY)

        return new_config

    def validate_config_values(self, **kwargs) -> list[str]:
        """Validate proposed configuration values against allowed ranges.

        Args:
            **kwargs: Field-value pairs to validate.

        Returns:
            A list of validation error strings. Empty list means all valid.
            Each error includes the field name and allowed range.
        """
        errors: list[str] = []

        for field, value in kwargs.items():
            if field not in self.FIELD_RANGES:
                errors.append(
                    f"Field '{field}' is not a configurable reward parameter."
                )
                continue

            min_val, max_val = self.FIELD_RANGES[field]

            # Coerce to proper type for comparison
            if isinstance(min_val, Decimal):
                try:
                    value = Decimal(str(value))
                except (ValueError, TypeError, InvalidOperation):
                    errors.append(
                        f"Field '{field}' must be a valid decimal number."
                    )
                    continue
            else:
                try:
                    value = int(value)
                except (ValueError, TypeError):
                    errors.append(
                        f"Field '{field}' must be a valid integer."
                    )
                    continue

            if value < min_val or value > max_val:
                errors.append(
                    f"Field '{field}' must be between {min_val} and {max_val}."
                )

        return errors
