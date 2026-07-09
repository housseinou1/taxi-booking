"""
Tests for Achievements and Rewards API endpoints.

Endpoints tested:
- GET /drivers/me/achievements/ - Earned achievements with name, icon, date
- GET /drivers/me/rewards/      - Reward points balance and redemption options

Requirements: 14.2, 14.4, 14.5
"""

import pytest
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile, Achievement, DriverAchievement

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
ACHIEVEMENTS_URL = "/drivers/me/achievements/"
REWARDS_URL = "/drivers/me/rewards/"


def _create_test_city():
    """Create matching city rows for registration serializer/model FKs."""
    from cities.models import Region as CitiesRegion
    from locations.models import City as LocationsCity, Region as LocationsRegion

    pk = 91003
    cities_region, _ = CitiesRegion.objects.get_or_create(name="Driver Achievements Region")
    locations_region, _ = LocationsRegion.objects.get_or_create(
        name="Driver Achievements Region"
    )
    now = timezone.now().isoformat()

    with connection.cursor() as cursor:
        cursor.execute(
            """INSERT OR REPLACE INTO cities_city
               (id, region_id, name, name_ar, name_fr, is_active,
                latitude, longitude, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, cities_region.pk, "Driver Achievements City", "", "", True, 0, 0, now],
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
                "Driver Achievements City",
                "driver-achievements-city",
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
    """Register a driver user and return (payload, token)."""
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


def _create_achievement(code, name, description, icon):
    """Create an Achievement record."""
    return Achievement.objects.create(
        code=code,
        name=name,
        description=description,
        icon=icon,
    )


@pytest.mark.django_db
class TestDriverAchievementsView:
    """Tests for GET /drivers/me/achievements/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(ACHIEVEMENTS_URL)
        assert response.status_code == 401

    def test_no_achievements_returns_empty_list(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(ACHIEVEMENTS_URL)
        assert response.status_code == 200
        assert response.data["achievements"] == []

    def test_returns_earned_achievements(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        # Create achievements and award them
        achievement = _create_achievement(
            code="first_ride",
            name="First Ride",
            description="Completed your very first ride!",
            icon="trophy_first",
        )
        DriverAchievement.objects.create(driver=profile, achievement=achievement)

        response = c.get(ACHIEVEMENTS_URL)
        assert response.status_code == 200

        achievements = response.data["achievements"]
        assert len(achievements) == 1
        assert achievements[0]["name"] == "First Ride"
        assert achievements[0]["icon"] == "trophy_first"
        assert achievements[0]["code"] == "first_ride"
        assert "earned_at" in achievements[0]

    def test_returns_multiple_achievements(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        a1 = _create_achievement("first_ride", "First Ride", "First ride!", "trophy_first")
        a2 = _create_achievement("100_rides", "Century Driver", "100 rides!", "trophy_100")

        DriverAchievement.objects.create(driver=profile, achievement=a1)
        DriverAchievement.objects.create(driver=profile, achievement=a2)

        response = c.get(ACHIEVEMENTS_URL)
        assert response.status_code == 200

        achievements = response.data["achievements"]
        assert len(achievements) == 2

    def test_achievement_includes_all_required_fields(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        achievement = _create_achievement(
            code="500_rides",
            name="Road Warrior",
            description="Completed 500 rides.",
            icon="trophy_500",
        )
        DriverAchievement.objects.create(driver=profile, achievement=achievement)

        response = c.get(ACHIEVEMENTS_URL)
        assert response.status_code == 200

        a = response.data["achievements"][0]
        assert "id" in a
        assert "achievement_id" in a
        assert "name" in a
        assert "description" in a
        assert "icon" in a
        assert "code" in a
        assert "earned_at" in a


@pytest.mark.django_db
class TestDriverRewardsView:
    """Tests for GET /drivers/me/rewards/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(REWARDS_URL)
        assert response.status_code == 401

    def test_new_driver_has_zero_points(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(REWARDS_URL)
        assert response.status_code == 200
        assert response.data["points_balance"] == 0

    def test_returns_points_balance(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile
        profile.reward_points = 250
        profile.save()

        response = c.get(REWARDS_URL)
        assert response.status_code == 200
        assert response.data["points_balance"] == 250

    def test_returns_redemption_options(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(REWARDS_URL)
        assert response.status_code == 200

        assert "redemption_options" in response.data
        options = response.data["redemption_options"]
        assert isinstance(options, list)
        assert len(options) > 0

        # Each option should have required fields
        for option in options:
            assert "id" in option
            assert "name" in option
            assert "description" in option
            assert "points_required" in option
            assert "redeemable" in option

    def test_redemption_options_redeemable_flag(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile
        profile.reward_points = 150
        profile.save()

        response = c.get(REWARDS_URL)
        assert response.status_code == 200

        options = response.data["redemption_options"]
        for option in options:
            if option["points_required"] <= 150:
                assert option["redeemable"] is True
            else:
                assert option["redeemable"] is False

    def test_returns_points_info(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(REWARDS_URL)
        assert response.status_code == 200

        assert "points_info" in response.data
        info = response.data["points_info"]
        assert info.get("ride_complete") == 10
        assert info.get("five_star_rating") == 5
        assert "reward_tier" in response.data
        assert "progress_percent" in response.data
