"""
Auth tests — aligned with the actual API endpoints:
  POST /auth/register/  → register a new user
  POST /auth/login/     → login and receive JWT tokens
"""
from rest_framework.test import APIClient
import pytest
from faker import Faker

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"


def _driver_payload(**overrides):
    """Minimal valid driver registration payload (no profile_picture required)."""
    base = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"{faker.email()}Ab2!",
        "user_type": "driver",
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_user_registration():
    """Driver registration should return 201."""
    response = client.post(REGISTER_URL, _driver_payload())
    assert response.status_code == 201


@pytest.mark.django_db
def test_user_registration_failed_weak_pwd():
    """Weak password (no uppercase / special char) should return 400."""
    payload = _driver_payload(password="azerty123")
    response = client.post(REGISTER_URL, payload)
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_registration_email_exists():
    """Registering with a duplicate email should return 400."""
    payload = _driver_payload()
    client.post(REGISTER_URL, payload)  # first registration
    # second registration with same email
    payload2 = _driver_payload(email=payload["email"])
    response = client.post(REGISTER_URL, payload2)
    assert response.status_code == 400


@pytest.mark.django_db
def test_user_login():
    """After registration, login should return 200 with access + refresh tokens."""
    payload = _driver_payload()
    client.post(REGISTER_URL, payload)

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
    client.post(REGISTER_URL, payload)

    response = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": "thisIsAWrongPassword99!",
    })
    assert response.status_code == 401
