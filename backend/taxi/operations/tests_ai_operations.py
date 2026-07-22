from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()


class AIOperationsPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = User.objects.create_user(
            email="ceo@yala.test", password="testpass", is_staff=True
        )
        self.ceo.groups.create(name="CEO")
        self.ops = User.objects.create_user(
            email="ops@yala.test", password="testpass", is_staff=True
        )
        self.ops.groups.create(name="Operations Manager")
        self.regular = User.objects.create_user(
            email="regular@yala.test", password="testpass"
        )

    def test_dashboard_requires_executive_role(self):
        self.client.force_authenticate(user=self.ceo)
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
            "permissions",
        ):
            self.assertIn(key, response.data)

    def test_regular_user_rejected(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.get("/operations/ai/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_ops_can_view_smart_dispatch(self):
        self.client.force_authenticate(user=self.ops)
        response = self.client.get("/operations/ai/smart-dispatch/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("rides", response.data)

    def test_ops_can_view_surge(self):
        self.client.force_authenticate(user=self.ops)
        response = self.client.get("/operations/ai/surge/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("zones", response.data)

    def test_hotspot_period_filter(self):
        self.client.force_authenticate(user=self.ops)
        for period in ("hour", "today", "week"):
            response = self.client.get(f"/operations/ai/hotspots/?period={period}")
            self.assertEqual(response.status_code, 200, period)
            self.assertIn("points", response.data)

    def test_invalid_hotspot_period_defaults(self):
        self.client.force_authenticate(user=self.ops)
        response = self.client.get("/operations/ai/hotspots/?period=invalid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["period"], "hour")


class AIOperationsRecommendationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = User.objects.create_user(
            email="ceo@yala.test", password="testpass", is_staff=True
        )
        self.ceo.groups.create(name="CEO")
        self.ops = User.objects.create_user(
            email="ops@yala.test", password="testpass", is_staff=True
        )
        self.ops.groups.create(name="Operations Manager")
        patcher = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_recommendation_lifecycle(self):
        from .models import AIRecommendation

        rec = AIRecommendation.objects.create(
            category="contact_driver",
            title="Review driver",
            summary="Performance at risk",
            explanation={"score": 42},
        )
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post(
            f"/operations/ai/recommendations/{rec.id}/action/",
            {"action": "approve"},
        )
        self.assertEqual(response.status_code, 200)
        rec.refresh_from_db()
        self.assertEqual(rec.status, "approved")
        self.assertEqual(rec.reviewed_by, self.ceo)

    def test_recommendation_action_requires_ceo(self):
        from .models import AIRecommendation

        rec = AIRecommendation.objects.create(
            category="contact_driver",
            title="Review driver",
            summary="Performance at risk",
        )
        self.client.force_authenticate(user=self.ops)
        response = self.client.post(
            f"/operations/ai/recommendations/{rec.id}/action/",
            {"action": "approve"},
        )
        self.assertEqual(response.status_code, 403)

    def test_refresh_recommendations(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post("/operations/ai/recommendations/refresh/", {})
        self.assertEqual(response.status_code, 200)
        self.assertIn("generated", response.data)
