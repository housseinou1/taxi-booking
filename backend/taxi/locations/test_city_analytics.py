import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from cities.models import City as CitiesCity
from cities.models import Region as CitiesRegion
from locations.models import City as LocationsCity
from locations.models import Region as LocationsRegion
from locations.services import city_analytics

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def locations_city():
    region = LocationsRegion.objects.create(name="Regression Test Region")
    return LocationsCity.objects.create(region=region, name="Regressionville")


@pytest.fixture
def cities_city():
    region = CitiesRegion.objects.create(name="Regression Test Region")
    return CitiesCity.objects.create(region=region, name="Regressionville")


def _rider(email, city=None):
    return User.objects.create_user(
        email=email, password=None, user_type="rider", is_active=True, city=city
    )


def test_city_analytics_accepts_locations_city(locations_city, cities_city):
    _rider("in-city@example.com", city=cities_city)
    _rider("no-city@example.com")

    result = city_analytics(locations_city)

    assert result["active_riders"] == 1


def test_city_analytics_without_matching_user_city_reports_zero(locations_city):
    _rider("no-city@example.com")

    assert city_analytics(locations_city)["active_riders"] == 0


def test_city_analytics_summary_counts_all_riders(cities_city):
    _rider("a@example.com", city=cities_city)
    _rider("b@example.com")

    assert city_analytics()["active_riders"] == 2


def test_city_analytics_endpoint_returns_200_for_staff(locations_city, cities_city):
    _rider("in-city@example.com", city=cities_city)
    staff = User.objects.create_user(email="staff@example.com", password=None, is_staff=True)
    client = APIClient()
    client.force_authenticate(staff)

    response = client.get("/locations/analytics/")

    assert response.status_code == 200
    row = next(r for r in response.data["cities"] if r["city_id"] == locations_city.id)
    assert row["active_riders"] == 1


def test_city_analytics_endpoint_rejects_anonymous_and_non_staff():
    client = APIClient()
    assert client.get("/locations/analytics/").status_code in (401, 403)

    rider = _rider("rider@example.com")
    client.force_authenticate(rider)
    assert client.get("/locations/analytics/").status_code == 403
