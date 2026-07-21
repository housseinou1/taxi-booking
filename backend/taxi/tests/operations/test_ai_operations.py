"""Tests for AI Operations & Smart Dispatch (Phase 13)."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import AIRecommendation
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS, CELERY_TASK_ALWAYS_EAGER=True)
class AIOperationsTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="ai-admin@test.local",
            password="Pass123!",
        )
        self.ops_manager = User.objects.create_user(
            email="ai-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="Operations Manager")
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

        self.finance = User.objects.create_user(
            email="ai-finance@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="Finance")
        self.finance.groups.add(Group.objects.get(name="Finance"))

        self.rider = User.objects.create_user(
            email="ai-rider@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.driver = User.objects.create_user(
            email="ai-driver@test.local",
            password="Pass123!",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            is_available=True,
            current_lat=18.0735,
            current_lng=-15.9582,
            car_type="regular",
            average_rating=4.8,
            acceptance_rate_points=95,
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Central",
            destination="Airport",
            fare=Decimal("600.00"),
            status="requested",
            pickup_lat=18.074,
            pickup_lng=-15.959,
            destination_lat=18.09,
            destination_lng=-15.97,
        )
        AIRecommendation.objects.create(
            category="surge",
            title="Test surge zone",
            summary="High demand detected",
            explanation={"demand_supply_ratio": 3.2},
            status="pending",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        response = self.client.get("/operations/ai/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_dashboard_returns_all_modules(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/ai/dashboard/")
        self.assertEqual(response.status_code, 200)
        for key in (
            "smart_dispatch",
            "surge_monitor",
            "hotspot_map",
            "predictive_alerts",
            "driver_performance",
            "fleet_health",
            "recommendations",
            "financial_insights",
        ):
            self.assertIn(key, response.data)

    def test_smart_dispatch_explains_selection(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/operations/ai/smart-dispatch/?ride_id={self.ride.id}")
        self.assertEqual(response.status_code, 200)
        rides = response.data.get("rides", [])
        self.assertGreaterEqual(len(rides), 1)
        selected = rides[0].get("selected_driver")
        if selected:
            self.assertIn("reasons", selected)
            self.assertIn("breakdown", selected)

    def test_recommendation_ceo_only(self):
        self.client.force_authenticate(self.ops_manager)
        rec = AIRecommendation.objects.first()
        response = self.client.post(
            f"/operations/ai/recommendations/{rec.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_recommendation_approve_logged(self):
        self.client.force_authenticate(self.admin)
        rec = AIRecommendation.objects.first()
        response = self.client.post(
            f"/operations/ai/recommendations/{rec.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        rec.refresh_from_db()
        self.assertEqual(rec.status, "approved")

    def test_hotspot_periods(self):
        self.client.force_authenticate(self.admin)
        for period in ("hour", "today", "week"):
            response = self.client.get(f"/operations/ai/hotspots/?period={period}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["period"], period)

    def test_financial_insights_no_auto_action(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/ai/financial/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("disclaimer", response.data)
        self.assertIn("forecast", response.data)

    def test_driver_performance_categories(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/ai/driver-performance/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        if response.data.get("drivers"):
            self.assertIn("category", response.data["drivers"][0])
