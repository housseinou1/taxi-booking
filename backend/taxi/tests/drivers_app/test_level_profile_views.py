"""
Tests for Driver Level and Profile API endpoints.

Endpoints tested:
- GET /drivers/me/level/
- GET /drivers/me/level/requirements/
- GET /drivers/me/stats/
- GET /drivers/me/profile/

Requirements: 5.1, 5.2, 5.3, 6.2, 6.3, 6.7
"""

import pytest
from decimal import Decimal
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
LEVEL_URL = "/drivers/me/level/"
LEVEL_REQUIREMENTS_URL = "/drivers/me/level/requirements/"
STATS_URL = "/drivers/me/stats/"
PROFILE_URL = "/drivers/me/profile/"


def _create_test_city():
    """Create matching city rows for registration serializer/model FKs."""
    from cities.models import Region as CitiesRegion
    from locations.models import City as LocationsCity, Region as LocationsRegion

    pk = 91006
    cities_region, _ = CitiesRegion.objects.get_or_create(name="Driver Level Region")
    locations_region, _ = LocationsRegion.objects.get_or_create(name="Driver Level Region")
    now = timezone.now().isoformat()

    with connection.cursor() as cursor:
        cursor.execute(
            """INSERT OR REPLACE INTO cities_city
               (id, region_id, name, name_ar, name_fr, is_active,
                latitude, longitude, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, cities_region.pk, "Driver Level City", "", "", True, 0, 0, now],
        )
        cursor.execute(
            """INSERT OR REPLACE INTO locations_city
               (id, region_id, commune_id, name, slug, is_active, is_default,
                latitude, longitude, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                pk,
                locations_region.pk,
                None,
                "Driver Level City",
                "driver-level-city",
                True,
                False,
                None,
                None,
                now,
                now,
            ],
        )

    return LocationsCity.objects.get(pk=pk)


def _register_driver():
    """Register a driver user and return (driver_profile, token)."""
    cache.clear()
    city = _create_test_city()
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
        "phone_number": f"+2222{faker.numerify('#######')}",
        "national_id_number": f"9{faker.numerify('#########')}",
        "city": city.pk,
    }
    reg = client.post(REGISTER_URL, payload, HTTP_X_APP_TYPE="driver")
    assert reg.status_code == 201, f"Registration failed: {reg.data}"

    login = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login.status_code == 200, f"Login failed: {login.data}"

    token = login.data["access"]
    return payload, token


def _get_authenticated_client(token):
    """Return a client with auth credentials set."""
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


@pytest.mark.django_db
class TestDriverLevelView:
    """Tests for GET /drivers/me/level/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(LEVEL_URL)
        assert response.status_code == 401

    def test_returns_level_data_for_new_driver(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(LEVEL_URL)
        assert response.status_code == 200

        data = response.data
        assert data["current_level"] == "bronze"
        assert data["next_level"] == "silver"
        assert 0 <= data["progress_percentage"] <= 100
        assert "metrics" in data
        assert "next_thresholds" in data
        assert "benefits" in data
        assert "badge" in data
        assert data["badge"]["level"] == "bronze"
        assert data["badge"]["label"] == "Bronze"

    def test_returns_correct_progress_for_silver_driver(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        # Update driver to silver level
        from authapp.models import User
        user = User.objects.get(email=payload["email"])
        profile = user.driver_profile
        profile.driver_level = "silver"
        profile.total_rides_completed = 60
        profile.total_rides_accepted = 70
        profile.total_rides_received = 90
        profile.average_rating = Decimal("4.6")
        profile.save()

        response = c.get(LEVEL_URL)
        assert response.status_code == 200

        data = response.data
        assert data["current_level"] == "silver"
        assert data["next_level"] == "gold"

    def test_elite_driver_has_100_progress(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        user = User.objects.get(email=payload["email"])
        profile = user.driver_profile
        profile.driver_level = "elite"
        profile.total_rides_completed = 600
        profile.average_rating = Decimal("4.95")
        profile.save()

        response = c.get(LEVEL_URL)
        assert response.status_code == 200

        data = response.data
        assert data["current_level"] == "elite"
        assert data["next_level"] is None
        assert data["progress_percentage"] == 100


@pytest.mark.django_db
class TestDriverLevelRequirementsView:
    """Tests for GET /drivers/me/level/requirements/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(LEVEL_REQUIREMENTS_URL)
        assert response.status_code == 401

    def test_returns_all_levels(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(LEVEL_REQUIREMENTS_URL)
        assert response.status_code == 200

        data = response.data
        assert "levels" in data
        levels = data["levels"]
        assert len(levels) == 5

        level_names = [l["level"] for l in levels]
        assert level_names == ["bronze", "silver", "gold", "platinum", "elite"]

    def test_bronze_has_no_requirements(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(LEVEL_REQUIREMENTS_URL)
        levels = response.data["levels"]
        bronze = levels[0]
        assert bronze["level"] == "bronze"
        assert bronze["requirements"] is None
        assert "benefits" in bronze

    def test_silver_has_correct_thresholds(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(LEVEL_REQUIREMENTS_URL)
        levels = response.data["levels"]
        silver = levels[1]
        assert silver["level"] == "silver"
        assert silver["requirements"]["rides"] == 50
        assert silver["requirements"]["rating"] == 4.5
        assert silver["requirements"]["acceptance_rate"] == 70
        assert silver["requirements"]["completion_rate"] == 85

    def test_each_level_has_benefits(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(LEVEL_REQUIREMENTS_URL)
        levels = response.data["levels"]
        for level in levels:
            assert "benefits" in level
            assert "description" in level["benefits"]


@pytest.mark.django_db
class TestDriverStatsView:
    """Tests for GET /drivers/me/stats/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(STATS_URL)
        assert response.status_code == 401

    def test_returns_stats_for_new_driver(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(STATS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["total_rides_completed"] == 0
        assert data["total_rides_accepted"] == 0
        assert data["total_rides_received"] == 0
        assert data["total_rides_cancelled"] == 0
        assert data["average_rating"] == 0.0
        assert data["acceptance_rate"] == 0
        assert data["completion_rate"] == 0
        assert data["cancellation_rate"] == 0
        assert "years_driving" in data

    def test_returns_correct_rates(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        user = User.objects.get(email=payload["email"])
        profile = user.driver_profile
        profile.total_rides_received = 100
        profile.total_rides_accepted = 80
        profile.total_rides_completed = 70
        profile.total_rides_cancelled = 5
        profile.average_rating = Decimal("4.7")
        profile.save()

        response = c.get(STATS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["acceptance_rate"] == 80.0  # 80/100 * 100
        assert data["completion_rate"] == 87.5  # 70/80 * 100
        assert data["cancellation_rate"] == 6.2  # 5/80 * 100 rounded to 1 decimal
        assert data["average_rating"] == 4.7


@pytest.mark.django_db
class TestDriverProfileView:
    """Tests for GET /drivers/me/profile/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(PROFILE_URL)
        assert response.status_code == 401

    def test_returns_full_profile(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(PROFILE_URL)
        assert response.status_code == 200

        data = response.data
        # Personal info
        assert "driver_name" in data
        assert "email" in data
        assert "is_available" in data
        assert "driver_photo" in data

        # Vehicle details
        assert "vehicle" in data
        assert "make" in data["vehicle"]
        assert "model" in data["vehicle"]
        assert "color" in data["vehicle"]
        assert "plate_number" in data["vehicle"]

        # Level info
        assert "level" in data
        assert data["level"]["current_level"] == "bronze"
        assert "progress_percentage" in data["level"]
        assert "benefits" in data["level"]

        # Stats
        assert "stats" in data
        assert "total_rides_completed" in data["stats"]
        assert "average_rating" in data["stats"]
        assert "acceptance_rate" in data["stats"]
        assert "completion_rate" in data["stats"]
        assert "cancellation_rate" in data["stats"]
        assert "years_driving" in data["stats"]

        # Earnings
        assert "earnings" in data
        assert "lifetime" in data["earnings"]
        assert "monthly" in data["earnings"]
        assert "weekly" in data["earnings"]
        assert data["earnings"]["currency"] == "MRU"

        # Reward points
        assert "reward_points" in data

    def test_profile_reflects_updated_level(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        user = User.objects.get(email=payload["email"])
        profile = user.driver_profile
        profile.driver_level = "gold"
        profile.total_rides_completed = 250
        profile.average_rating = Decimal("4.8")
        profile.save()

        response = c.get(PROFILE_URL)
        assert response.status_code == 200
        assert response.data["level"]["current_level"] == "gold"

    def test_profile_auto_creates_missing_driver_profile(self):
        payload, token = _register_driver()
        from authapp.models import User

        user = User.objects.get(email=payload["email"])
        DriverProfile.objects.filter(user=user).delete()

        c = _get_authenticated_client(token)
        response = c.get(PROFILE_URL)
        assert response.status_code == 200
        assert DriverProfile.objects.filter(user=user).exists()
        assert response.data["status"] == "pending"

    def test_rider_without_profile_gets_403(self):
        from authapp.models import User

        user = User.objects.create_user(
            email=faker.email(),
            password="Test@1234Ab",
            first_name=faker.first_name(),
            last_name=faker.last_name(),
            user_type="rider",
        )
        login = client.post(LOGIN_URL, {
            "email": user.email,
            "password": "Test@1234Ab",
        })
        assert login.status_code == 200, login.data

        c = _get_authenticated_client(login.data["access"])
        response = c.get(PROFILE_URL)
        assert response.status_code == 403
        assert response.data["code"] == "not_driver_account"
