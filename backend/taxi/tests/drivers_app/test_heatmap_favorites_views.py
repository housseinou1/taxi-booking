"""
Tests for Heatmap and Favorite Areas API endpoints.

Endpoints tested:
- GET /drivers/heatmap/
- GET /drivers/me/favorites/
- POST /drivers/me/favorites/
- DELETE /drivers/me/favorites/{id}/

Requirements: 1.6, 13.3, 13.4
"""

import pytest
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile, DriverFavoriteArea, HeatmapZone

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
HEATMAP_URL = "/drivers/heatmap/"
FAVORITES_URL = "/drivers/me/favorites/"


def _register_driver():
    """Register a driver user and return (payload, token)."""
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
        "phone_number": f"+2222{faker.numerify('#######')}",
        "national_id_number": f"9{faker.numerify('#########')}",
    }
    reg = client.post(REGISTER_URL, payload)
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
class TestHeatmapView:
    """Tests for GET /drivers/heatmap/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(HEATMAP_URL)
        assert response.status_code == 401

    def test_returns_empty_list_when_no_zones(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(HEATMAP_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_returns_only_active_zones(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create active and inactive zones
        HeatmapZone.objects.create(
            center_lat=18.07, center_lng=-15.95, radius_km=1.0, intensity=0.8, active=True
        )
        HeatmapZone.objects.create(
            center_lat=18.10, center_lng=-15.90, radius_km=2.0, intensity=0.3, active=False
        )

        response = c.get(HEATMAP_URL)
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["center_lat"] == 18.07
        assert response.data[0]["intensity"] == 0.8
        assert response.data[0]["active"] is True


@pytest.mark.django_db
class TestDriverFavoriteAreaListView:
    """Tests for GET /drivers/me/favorites/ and POST /drivers/me/favorites/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(FAVORITES_URL)
        assert response.status_code == 401

    def test_returns_empty_list_for_new_driver(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(FAVORITES_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_create_favorite_area(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        data = {
            "label": "Home Area",
            "center_lat": 18.07,
            "center_lng": -15.95,
            "radius_km": 3.0,
        }
        response = c.post(FAVORITES_URL, data)
        assert response.status_code == 201
        assert response.data["label"] == "Home Area"
        assert response.data["center_lat"] == 18.07
        assert response.data["center_lng"] == -15.95
        assert response.data["radius_km"] == 3.0

    def test_list_favorite_areas(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create 2 favorites
        c.post(FAVORITES_URL, {"label": "Area 1", "center_lat": 18.0, "center_lng": -15.0, "radius_km": 3.0})
        c.post(FAVORITES_URL, {"label": "Area 2", "center_lat": 18.1, "center_lng": -15.1, "radius_km": 3.0})

        response = c.get(FAVORITES_URL)
        assert response.status_code == 200
        assert len(response.data) == 2

    def test_max_5_favorite_areas_enforced(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create 5 favorites
        for i in range(5):
            resp = c.post(FAVORITES_URL, {
                "label": f"Area {i+1}",
                "center_lat": 18.0 + i * 0.01,
                "center_lng": -15.0 + i * 0.01,
                "radius_km": 3.0,
            })
            assert resp.status_code == 201, f"Failed to create area {i+1}: {resp.data}"

        # Attempt to create 6th should fail
        response = c.post(FAVORITES_URL, {
            "label": "Area 6",
            "center_lat": 18.1,
            "center_lng": -15.1,
            "radius_km": 3.0,
        })
        assert response.status_code == 400
        assert "Maximum 5 favorite areas" in str(response.data)

    def test_create_without_required_fields_returns_400(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.post(FAVORITES_URL, {})
        assert response.status_code == 400


@pytest.mark.django_db
class TestDriverFavoriteAreaDeleteView:
    """Tests for DELETE /drivers/me/favorites/{id}/"""

    def test_delete_favorite_area(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create a favorite
        resp = c.post(FAVORITES_URL, {
            "label": "To Delete",
            "center_lat": 18.0,
            "center_lng": -15.0,
            "radius_km": 3.0,
        })
        assert resp.status_code == 201
        favorite_id = resp.data["id"]

        # Delete it
        response = c.delete(f"{FAVORITES_URL}{favorite_id}/")
        assert response.status_code == 204

        # Verify it's gone
        list_resp = c.get(FAVORITES_URL)
        assert len(list_resp.data) == 0

    def test_delete_nonexistent_returns_404(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.delete(f"{FAVORITES_URL}99999/")
        assert response.status_code == 404

    def test_cannot_delete_other_drivers_favorite(self):
        # Create first driver with a favorite
        _, token1 = _register_driver()
        c1 = _get_authenticated_client(token1)

        resp = c1.post(FAVORITES_URL, {
            "label": "Driver 1 Area",
            "center_lat": 18.0,
            "center_lng": -15.0,
            "radius_km": 3.0,
        })
        assert resp.status_code == 201
        favorite_id = resp.data["id"]

        # Second driver tries to delete it
        _, token2 = _register_driver()
        c2 = _get_authenticated_client(token2)

        response = c2.delete(f"{FAVORITES_URL}{favorite_id}/")
        assert response.status_code == 404

    def test_can_add_after_delete_when_at_limit(self):
        """After deleting one from 5, should be able to add a new one."""
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create 5 favorites
        ids = []
        for i in range(5):
            resp = c.post(FAVORITES_URL, {
                "label": f"Area {i+1}",
                "center_lat": 18.0 + i * 0.01,
                "center_lng": -15.0 + i * 0.01,
                "radius_km": 3.0,
            })
            assert resp.status_code == 201
            ids.append(resp.data["id"])

        # Delete one
        c.delete(f"{FAVORITES_URL}{ids[0]}/")

        # Should now be able to add a new one
        response = c.post(FAVORITES_URL, {
            "label": "New Area",
            "center_lat": 18.2,
            "center_lng": -15.2,
            "radius_km": 3.0,
        })
        assert response.status_code == 201
