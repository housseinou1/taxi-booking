"""Tests for Smart Pricing & Dispatch Engine (Phase 28)."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from operations.models import PlatformSetting
from operations.smart_pricing_dispatch_service import (
    calculate_dynamic_fare,
    get_engine_flags,
    simulate_pricing,
)

User = get_user_model()


class SmartPricingDispatchTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="smart-engine-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.ops = User.objects.create_user(
            email="smart-engine-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops.groups.add(Group.objects.get(name="Operations Manager"))

        self.rider = User.objects.create_user(
            email="smart-engine-rider@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()
        PlatformSetting.objects.filter(
            key__in=[
                "smart_engine",
                "dispatch_rules",
                "dynamic_pricing_rules",
                "surge_engine_config",
                "smart_engine_audit",
            ]
        ).delete()

    def test_ops_can_load_dashboard(self):
        self.client.force_authenticate(self.ops)
        response = self.client.get("/operations/smart-engine/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("engine_flags", data)
        self.assertIn("dispatch_analytics", data)
        self.assertFalse(data["engine_flags"]["enabled"])

    def test_ops_can_update_dispatch_rules(self):
        self.client.force_authenticate(self.ops)
        response = self.client.patch(
            "/operations/smart-engine/dispatch-rules/",
            {"weights": {"distance": 0.5, "eta": 0.2}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["weights"]["distance"], 0.5)

    def test_pricing_simulation_dry_run(self):
        self.client.force_authenticate(self.ops)
        response = self.client.post(
            "/operations/smart-engine/simulate/",
            {"distance_km": 10, "ride_type": "regular", "use_engine": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["simulation"])
        self.assertIn("customer_price", data["result"])
        self.assertEqual(data["result"]["engine"], "legacy")

    def test_ceo_can_update_surge_config(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.patch(
            "/operations/smart-engine/surge/",
            {"enabled": True, "max_multiplier": 2.0},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["config"]["enabled"])

    def test_ops_cannot_update_surge_config(self):
        self.client.force_authenticate(self.ops)
        response = self.client.patch(
            "/operations/smart-engine/surge/",
            {"enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_ceo_dashboard_requires_ceo(self):
        self.client.force_authenticate(self.ops)
        response = self.client.get("/operations/smart-engine/ceo/")
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/smart-engine/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("revenue_impact", response.json())

    def test_legacy_pricing_when_engine_disabled(self):
        result = calculate_dynamic_fare(distance_km=5, ride_type="regular", use_engine=False)
        self.assertEqual(result["engine"], "legacy")
        self.assertEqual(Decimal(result["customer_price"]), Decimal("300.00"))

    def test_simulate_pricing_writes_audit_entry(self):
        simulate_pricing({"distance_km": 3}, user=self.ops)
        audit = PlatformSetting.get_value("smart_engine_audit", {})
        self.assertTrue(audit.get("entries"))

    def test_engine_flags_default_off(self):
        flags = get_engine_flags()
        self.assertFalse(flags["enabled"])
