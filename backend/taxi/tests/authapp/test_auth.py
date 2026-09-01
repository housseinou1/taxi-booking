"""
Auth tests — aligned with the actual API endpoints:
  POST /auth/register/  → register a new user
  POST /auth/login/     → login and receive JWT tokens
"""
from rest_framework.test import APIClient
import pytest
from faker import Faker
from django.db import connection
from django.utils import timezone

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"


def _create_test_city():
    """Create matching city rows for registration serializer/model FKs."""
    from cities.models import Region as CitiesRegion
    from locations.models import City as LocationsCity, Region as LocationsRegion

    pk = 91000
    cities_region, _ = CitiesRegion.objects.get_or_create(name="Auth Tests Region")
    locations_region, _ = LocationsRegion.objects.get_or_create(name="Auth Tests Region")
    now = timezone.now().isoformat()

    with connection.cursor() as cursor:
        cursor.execute(
            """INSERT OR REPLACE INTO cities_city
               (id, region_id, name, name_ar, name_fr, is_active,
                latitude, longitude, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, cities_region.pk, "Auth Tests City", "", "", True, 0, 0, now],
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
                "Auth Tests City",
                "auth-tests-city",
                True,
                False,
                None,
                None,
                now,
                now,
            ],
        )

    return LocationsCity.objects.get(pk=pk)


def _driver_payload(**overrides):
    """Minimal valid driver registration payload (city + X-App-Type required)."""
    city = overrides.pop("city", None) or _create_test_city()
    base = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"{faker.email()}Ab2!",
        "user_type": "driver",
        "phone_number": f"+2222{faker.numerify('#######')}",
        "national_id_number": f"9{faker.numerify('#########')}",
        "city": city.pk,
    }
    base.update(overrides)
    return base


def _register_driver(**overrides):
    """POST a valid driver registration with the required X-App-Type header."""
    return client.post(
        REGISTER_URL,
        _driver_payload(**overrides),
        HTTP_X_APP_TYPE="driver",
    )


@pytest.mark.django_db
def test_user_registration():
    """Driver registration should return 201."""
    response = _register_driver()
    assert response.status_code == 201


@pytest.mark.django_db
def test_user_registration_failed_weak_pwd():
    """Weak password (no uppercase / special char) should return 400."""
    response = _register_driver(password="azerty123")
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_registration_email_exists():
    """Registering with a duplicate email should return 400."""
    payload = _driver_payload()
    client.post(REGISTER_URL, payload, HTTP_X_APP_TYPE="driver")
    payload2 = _driver_payload(email=payload["email"])
    response = client.post(REGISTER_URL, payload2, HTTP_X_APP_TYPE="driver")
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_login():
    """After registration, login should return 200 with access + refresh tokens."""
    payload = _driver_payload()
    client.post(REGISTER_URL, payload, HTTP_X_APP_TYPE="driver")

    response = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_user_login_fail_wrong_pwd():
    """Login with wrong password should return 401."""
    payload = _driver_payload()
    client.post(REGISTER_URL, payload, HTTP_X_APP_TYPE="driver")

    response = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": "thisIsAWrongPassword99!",
    })
    assert response.status_code == 401
