"""Launch & Growth Sprint tests."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from operations.cache_utils import invalidate_ops_cache
from taxi.drivers.models import DriverProfile

User = get_user_model()


class LaunchGrowthCenterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin-launch-growth@test.local",
            password="Pass123!",
        )
        self.rider = User.objects.create_user(
            email="rider-lg@test.local",
            password="Pass123!",
            user_type="rider",
        )

    def test_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        denied = self.client.get("/operations/launch-growth/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/launch-growth/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("driver_recruitment", response.data)
        self.assertIn("rider_growth", response.data)
        self.assertIn("promotions", response.data)
        self.assertIn("partnerships", response.data)
        self.assertIn("marketing", response.data)
        self.assertIn("executive_scorecard", response.data)
        self.assertIn("scaling_readiness", response.data)

    def test_driver_recruitment_kpis(self):
        driver_user = User.objects.create_user(
            email="driver-lg@test.local",
            password="Pass123!",
            user_type="driver",
        )
        DriverProfile.objects.create(user=driver_user, status="pending")

        invalidate_ops_cache("launch_growth_center")
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/launch-growth/")
        funnel = response.data["driver_recruitment"]["funnel"]
        self.assertGreaterEqual(funnel["applications_received"], 1)
        self.assertGreaterEqual(funnel["documents_pending"], 1)

    def test_partnership_create(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "name": "Nouakchott Airport",
            "category": "airport",
            "status": "prospect",
            "contact_person": "Ops Lead",
            "contact_email": "ops@airport.test",
            "agreement": "MOU draft",
        }
        response = self.client.post("/operations/launch-growth/partnerships/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Nouakchott Airport")

        dashboard = self.client.get("/operations/launch-growth/")
        self.assertEqual(dashboard.data["partnerships"]["total"], 1)

    def test_scaling_readiness_endpoint(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/launch-growth/scaling/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("verdict", response.data)
        self.assertIn("recommendation", response.data)

    def test_promo_create(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/operations/launch-growth/promos/",
            {"code": "GROWTH10", "discount_value": 10, "campaign_type": "general"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], "GROWTH10")
