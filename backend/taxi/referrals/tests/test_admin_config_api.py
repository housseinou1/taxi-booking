from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from referrals.models import RewardConfiguration

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
def regular_user(db):
    """Create a non-admin user for testing."""
    return User.objects.create_user(
        email="user@yala-test.com",
        password="userpass123",
        first_name="Regular",
        last_name="User",
        is_staff=False,
        is_superuser=False,
    )


@pytest.fixture
def admin_client(admin_user):
    """Return an authenticated API client for an admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def regular_client(regular_user):
    """Return an authenticated API client for a non-admin user."""
    client = APIClient()
    client.force_authenticate(user=regular_user)
    return client


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


CONFIG_URL = "/referrals/admin/config/"


@pytest.fixture(autouse=True)
def use_referrals_urls(settings):
    """Override ROOT_URLCONF to avoid importing firebase_admin."""
    settings.ROOT_URLCONF = "referrals.tests.test_urls"


@pytest.mark.django_db
class TestGetAdminConfig:
    """Tests for GET /referrals/admin/config/."""

    def test_returns_active_config(self, admin_client, active_config):
        """Should return the current active configuration."""
        response = admin_client.get(CONFIG_URL)
        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["rider_referrer_credit"]) == Decimal("50.00")
        assert Decimal(data["rider_referee_credit"]) == Decimal("50.00")
        assert Decimal(data["driver_bonus_amount"]) == Decimal("500.00")
        assert data["driver_ride_threshold"] == 20
        assert data["rider_credit_cap_count"] == 10
        assert data["rider_credit_cap_days"] == 30
        assert data["driver_bonus_cap_count"] == 5
        assert data["driver_bonus_cap_days"] == 30
        assert data["credit_expiration_days"] == 90

    def test_returns_all_config_fields(self, admin_client, active_config):
        """Should return all 9 configurable fields plus metadata."""
        response = admin_client.get(CONFIG_URL)
        data = response.json()
        expected_fields = {
            "rider_referrer_credit",
            "rider_referee_credit",
            "driver_bonus_amount",
            "driver_ride_threshold",
            "rider_credit_cap_count",
            "rider_credit_cap_days",
            "driver_bonus_cap_count",
            "driver_bonus_cap_days",
            "credit_expiration_days",
            "updated_at",
            "updated_by",
        }
        assert expected_fields.issubset(set(data.keys()))

    def test_creates_default_config_when_none_exists(self, admin_client):
        """Should create a default config when none exists."""
        response = admin_client.get(CONFIG_URL)
        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["rider_referrer_credit"]) == Decimal("50.00")

    def test_rejects_unauthenticated_request(self):
        """Should return 401/403 for unauthenticated requests."""
        client = APIClient()
        response = client.get(CONFIG_URL)
        assert response.status_code in (401, 403)

    def test_rejects_non_admin_request(self, regular_client):
        """Should return 403 for non-admin authenticated users."""
        response = regular_client.get(CONFIG_URL)
        assert response.status_code == 403


@pytest.mark.django_db
class TestPutAdminConfig:
    """Tests for PUT /referrals/admin/config/."""

    def test_updates_config_successfully(
        self, admin_client, active_config
    ):
        """Should update config and return success response."""
        response = admin_client.put(
            CONFIG_URL,
            {"rider_referrer_credit": "75.00"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Configuration updated successfully"
        assert "updated_at" in data
        assert Decimal(data["rider_referrer_credit"]) == Decimal("75.00")

    def test_returns_timestamp_on_success(
        self, admin_client, active_config
    ):
        """Should include updated_at timestamp in successful response."""
        response = admin_client.put(
            CONFIG_URL,
            {"driver_ride_threshold": 25},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert "updated_at" in data
        # Timestamp should be a valid ISO format string
        assert "T" in data["updated_at"]

    def test_partial_update_preserves_other_fields(
        self, admin_client, active_config
    ):
        """Should preserve unchanged fields when updating partially."""
        response = admin_client.put(
            CONFIG_URL,
            {"driver_ride_threshold": 30},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["driver_ride_threshold"] == 30
        # Other fields unchanged
        assert Decimal(data["rider_referrer_credit"]) == Decimal("50.00")
        assert Decimal(data["driver_bonus_amount"]) == Decimal("500.00")

    def test_rejects_value_below_min(self, admin_client, active_config):
        """Should return 400 for values below minimum range."""
        response = admin_client.put(
            CONFIG_URL,
            {"rider_referrer_credit": "0.00"},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert "errors" in data
        assert "rider_referrer_credit" in data["errors"]

    def test_rejects_value_above_max(self, admin_client, active_config):
        """Should return 400 for values above maximum range."""
        response = admin_client.put(
            CONFIG_URL,
            {"driver_bonus_amount": "50001.00"},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert "errors" in data
        assert "driver_bonus_amount" in data["errors"]

    def test_rejects_invalid_decimal_type(self, admin_client, active_config):
        """Should return 400 for non-numeric decimal field values."""
        response = admin_client.put(
            CONFIG_URL,
            {"rider_referrer_credit": "not_a_number"},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert "errors" in data
        assert "rider_referrer_credit" in data["errors"]

    def test_rejects_invalid_integer_type(self, admin_client, active_config):
        """Should return 400 for non-integer integer field values."""
        response = admin_client.put(
            CONFIG_URL,
            {"driver_ride_threshold": "abc"},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert "errors" in data
        assert "driver_ride_threshold" in data["errors"]

    def test_rejects_unknown_field(self, admin_client, active_config):
        """Should return 400 for unknown configuration fields."""
        response = admin_client.put(
            CONFIG_URL,
            {"unknown_field": 100},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert "errors" in data
        assert "unknown_field" in data["errors"]

    def test_multiple_field_update(self, admin_client, active_config):
        """Should update multiple fields at once."""
        response = admin_client.put(
            CONFIG_URL,
            {
                "rider_referrer_credit": "100.00",
                "driver_bonus_amount": "1000.00",
                "credit_expiration_days": 180,
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["rider_referrer_credit"]) == Decimal("100.00")
        assert Decimal(data["driver_bonus_amount"]) == Decimal("1000.00")
        assert data["credit_expiration_days"] == 180

    def test_rejects_unauthenticated_request(self, active_config):
        """Should return 401/403 for unauthenticated PUT requests."""
        client = APIClient()
        response = client.put(
            CONFIG_URL,
            {"rider_referrer_credit": "75.00"},
            format="json",
        )
        assert response.status_code in (401, 403)

    def test_rejects_non_admin_request(self, regular_client, active_config):
        """Should return 403 for non-admin PUT requests."""
        response = regular_client.put(
            CONFIG_URL,
            {"rider_referrer_credit": "75.00"},
            format="json",
        )
        assert response.status_code == 403

    def test_boundary_min_values_accepted(self, admin_client, active_config):
        """Should accept minimum boundary values."""
        response = admin_client.put(
            CONFIG_URL,
            {
                "rider_referrer_credit": "0.01",
                "driver_ride_threshold": 1,
                "credit_expiration_days": 1,
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["rider_referrer_credit"]) == Decimal("0.01")
        assert data["driver_ride_threshold"] == 1
        assert data["credit_expiration_days"] == 1

    def test_boundary_max_values_accepted(self, admin_client, active_config):
        """Should accept maximum boundary values."""
        response = admin_client.put(
            CONFIG_URL,
            {
                "rider_referrer_credit": "10000.00",
                "driver_bonus_amount": "50000.00",
                "driver_ride_threshold": 500,
                "credit_expiration_days": 730,
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert Decimal(data["rider_referrer_credit"]) == Decimal("10000.00")
        assert Decimal(data["driver_bonus_amount"]) == Decimal("50000.00")
