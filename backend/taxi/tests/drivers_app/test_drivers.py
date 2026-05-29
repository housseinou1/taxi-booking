"""
Driver tests — aligned with the actual API endpoints:
  POST /auth/register/          → register a driver user
  POST /auth/login/             → get JWT token
  GET  /drivers/me/             → get own driver profile
  POST /drivers/profile/update/ → update driver profile (files)
  POST /drivers/register/       → submit driver registration with vehicle docs
  GET  /drivers/available/      → list available drivers (public)
"""
import tempfile
import pytest
from PIL import Image
from rest_framework.test import APIClient
from faker import Faker

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
DRIVER_ME_URL = "/drivers/me/"
DRIVER_PROFILE_UPDATE_URL = "/drivers/profile/update/"
DRIVER_REGISTER_URL = "/drivers/register/"
AVAILABLE_DRIVERS_URL = "/drivers/available/"


def temporary_image():
    """Return an in-memory JPEG temp file."""
    image = Image.new("RGB", (100, 100), color=(100, 150, 200))
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    image.save(tmp, "JPEG")
    tmp.seek(0)
    return tmp


def _register_driver():
    """Register a driver user and return (driver_profile_id, token)."""
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
    }
    reg = client.post(REGISTER_URL, payload)
    assert reg.status_code == 201, f"Registration failed: {reg.data}"

    login = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login.status_code == 200, f"Login failed: {login.data}"

    token = login.data["access"]
    # driver_profile_id comes from the driver_profile_id field in login response
    driver_profile_id = login.data.get("driver_profile_id")
    return driver_profile_id, token


@pytest.mark.django_db
def test_retrieve_driver_profile():
    """Authenticated driver can retrieve their own profile."""
    driver_profile_id, token = _register_driver()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get(DRIVER_ME_URL)
    client.credentials()
    assert response.status_code == 200
    assert "driver_name" in response.data or "email" in response.data


@pytest.mark.django_db
def test_retrieve_driver_profile_fail():
    """Unauthenticated request to a non-existent driver location returns 404."""
    response = client.get("/drivers/location/999999/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_update_driver_profile():
    """Driver can update their profile with a photo."""
    driver_profile_id, token = _register_driver()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    data = {
        "vehicle_make": "Toyota",
        "vehicle_model": "Corolla",
        "vehicle_color": "White",
        "driver_photo": temporary_image(),
    }
    response = client.patch(DRIVER_PROFILE_UPDATE_URL, data, format="multipart")
    client.credentials()
    assert response.status_code == 200
    assert "driver" in response.data


@pytest.mark.django_db
def test_driver_register_without_terms_fails():
    """Submitting driver registration without accepting terms returns 400."""
    _, token = _register_driver()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post(DRIVER_REGISTER_URL, {
        "terms_accepted": "false",
        "vehicle_make": "Toyota",
    })
    client.credentials()
    assert response.status_code == 400


@pytest.mark.django_db
def test_driver_register_with_terms():
    """Submitting driver registration with terms accepted returns 200."""
    _, token = _register_driver()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post(DRIVER_REGISTER_URL, {
        "terms_accepted": "true",
        "vehicle_make": "Toyota",
        "vehicle_model": "Hilux",
        "vehicle_color": "Black",
        "car_type": "regular",
        "plate_number": "NKT-1234",
    })
    client.credentials()
    assert response.status_code == 200
    assert "driver" in response.data


@pytest.mark.django_db
def test_available_drivers_public():
    """Available drivers endpoint is public and returns a list."""
    response = client.get(AVAILABLE_DRIVERS_URL)
    assert response.status_code == 200
    assert isinstance(response.data, list)
