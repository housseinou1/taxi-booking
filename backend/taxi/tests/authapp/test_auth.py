"""
Auth tests — aligned with the actual API endpoints:
  POST /auth/register/  → register a new user
  POST /auth/login/     → login and receive JWT tokens
"""
from rest_framework.test import APIClient
import pytest
from faker import Faker

from cities.models import City, Region

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"

# The driver app identifies itself via the X-App-Type header. RegisterSerializer
# requires it and enforces that it matches the submitted user_type.
DRIVER_APP_HEADER = {"HTTP_X_APP_TYPE": "driver"}


@pytest.fixture
def city(db):
    """An active city for the required `city` registration field."""
    region = Region.objects.create(name=faker.unique.city())
    return City.objects.create(region=region, name=faker.city(), is_active=True)


def _driver_payload(city_pk, **overrides):
    """Minimal valid driver registration payload (no profile_picture required)."""
    base = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"{faker.email()}Ab2!",
        "user_type": "driver",
        "phone_number": f"+2222{faker.numerify('#######')}",
        "national_id_number": f"9{faker.numerify('#########')}",
        "city": city_pk,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_user_registration(city):
    """Driver registration should return 201."""
    response = client.post(REGISTER_URL, _driver_payload(city.pk), **DRIVER_APP_HEADER)
    assert response.status_code == 201


@pytest.mark.django_db
def test_user_registration_failed_weak_pwd(city):
    """Weak password (no uppercase / special char) should return 400."""
    payload = _driver_payload(city.pk, password="azerty123")
    response = client.post(REGISTER_URL, payload, **DRIVER_APP_HEADER)
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_registration_email_exists(city):
    """Registering with a duplicate email should return 400."""
    payload = _driver_payload(city.pk)
    client.post(REGISTER_URL, payload, **DRIVER_APP_HEADER)  # first registration
    # second registration with same email
    payload2 = _driver_payload(city.pk, email=payload["email"])
    response = client.post(REGISTER_URL, payload2, **DRIVER_APP_HEADER)
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_login(city):
    """After registration, login should return 200 with access + refresh tokens."""
    payload = _driver_payload(city.pk)
    client.post(REGISTER_URL, payload, **DRIVER_APP_HEADER)

    response = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_user_login_fail_wrong_pwd(city):
    """Login with wrong password should return 401."""
    payload = _driver_payload(city.pk)
    client.post(REGISTER_URL, payload, **DRIVER_APP_HEADER)

    response = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": "thisIsAWrongPassword99!",
    })
    assert response.status_code == 401
