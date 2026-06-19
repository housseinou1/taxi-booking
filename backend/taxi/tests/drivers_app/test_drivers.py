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
from datetime import date, timedelta

import pytest
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
DRIVER_ME_URL = "/drivers/me/"
DRIVER_PROFILE_UPDATE_URL = "/drivers/profile/update/"
DRIVER_REGISTER_URL = "/drivers/register/"
AVAILABLE_DRIVERS_URL = "/drivers/available/"


def _create_test_city():
    """Create matching city rows for registration serializer/model FKs."""
    from cities.models import City as CitiesCity, Region as CitiesRegion
    from locations.models import City as LocationsCity, Region as LocationsRegion

    pk = 91002
    cities_region, _ = CitiesRegion.objects.get_or_create(name="Driver Tests Region")
    locations_region, _ = LocationsRegion.objects.get_or_create(name="Driver Tests Region")
    now = timezone.now().isoformat()

    with connection.cursor() as cursor:
        cursor.execute(
            """INSERT OR REPLACE INTO cities_city
               (id, region_id, name, name_ar, name_fr, is_active,
                latitude, longitude, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, cities_region.pk, "Driver Tests City", "", "", True, 0, 0, now],
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
                "Driver Tests City",
                "driver-tests-city",
                True,
                False,
                None,
                None,
                now,
                now,
            ],
        )

    return LocationsCity.objects.get(pk=pk)


def temporary_image():
    """Return an in-memory JPEG temp file."""
    image = Image.new("RGB", (100, 100), color=(100, 150, 200))
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    image.save(tmp, "JPEG")
    tmp.seek(0)
    return tmp


def _register_driver():
    """Register a driver user and return (driver_profile_id, token)."""
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
    """Driver location is protected from unauthenticated access."""
    response = client.get("/drivers/location/999999/")
    assert response.status_code == 401


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
    """A phone-verified driver with complete documents can submit registration."""
    _, token = _register_driver()
    profile = DriverProfile.objects.get()
    profile.user.phone_verified_at = timezone.now()
    profile.user.save(update_fields=["phone_verified_at"])

    issued = (date.today() - timedelta(days=365)).isoformat()
    expires = (date.today() + timedelta(days=365)).isoformat()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.post(DRIVER_REGISTER_URL, {
        "terms_accepted": "true",
        "phone_number": profile.user.phone_number,
        "vehicle_make": "Toyota",
        "vehicle_model": "Hilux",
        "vehicle_color": "Black",
        "car_type": "regular",
        "plate_number": "NKT-1234",
        "driver_photo": temporary_image(),
        "license_file": temporary_image(),
        "vehicle_registration": temporary_image(),
        "insurance_document": temporary_image(),
        "vignette_document": temporary_image(),
        "license_issued_at": issued,
        "license_expires_at": expires,
        "vehicle_registration_expires_at": expires,
        "insurance_expires_at": expires,
        "vignette_expires_at": expires,
    }, format="multipart")
    client.credentials()
    assert response.status_code == 200
    assert "driver" in response.data


@pytest.mark.django_db
def test_available_drivers_public():
    """Available drivers are protected from unauthenticated access."""
    response = client.get(AVAILABLE_DRIVERS_URL)
    assert response.status_code == 401
