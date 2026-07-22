"""Tests for Multi-City Operations Platform (Phase 27)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from locations.models import City, Region
from operations.models import OpsCityProfile

User = get_user_model()


class MultiCityOperationsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Operations Manager")
        Group.objects.get_or_create(name="Finance")

        region, _ = Region.objects.get_or_create(name="Test Region Multi")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="TestCityMulti",
            defaults={"latitude": 18.0, "longitude": -16.0, "is_active": True},
        )
        self.profile, _ = OpsCityProfile.objects.get_or_create(
            city=self.city,
            defaults={"status": "active", "currency": "MRU", "timezone": "Africa/Nouakchott"},
        )

        self.ceo = User.objects.create_user(
            email="multicity-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.city_ops = User.objects.create_user(
            email="multicity-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.city_ops.groups.add(Group.objects.get(name="Operations Manager"))
        self.profile.operations_manager = self.city_ops
        self.profile.save(update_fields=["operations_manager"])

        self.other_ops = User.objects.create_user(
            email="multicity-other@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.other_ops.groups.add(Group.objects.get(name="Operations Manager"))

    def tearDown(self):
        self.qr_patch.stop()

    def test_ceo_can_load_national_dashboard(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/multi-city/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("ceo_overview", data)
        self.assertTrue(data["permissions"]["national"])

    def test_city_ops_manager_scoped_to_assigned_city(self):
        self.client.force_authenticate(self.city_ops)
        response = self.client.get("/operations/multi-city/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertNotIn("ceo_overview", data)
        city_ids = [c["admin"]["city_id"] for c in data["cities"]]
        self.assertEqual(city_ids, [self.city.id])

    def test_unassigned_ops_manager_denied_without_city(self):
        self.client.force_authenticate(self.other_ops)
        response = self.client.get("/operations/multi-city/")
        self.assertEqual(response.status_code, 403)

    def test_ceo_can_update_city_status(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.patch(
            f"/operations/multi-city/cities/{self.city.id}/",
            {"status": "pilot"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.status, "pilot")

    def test_export_requires_ceo(self):
        self.client.force_authenticate(self.city_ops)
        response = self.client.get("/operations/multi-city/export/?export_format=csv")
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/multi-city/export/?export_format=csv")
        self.assertEqual(response.status_code, 200)
