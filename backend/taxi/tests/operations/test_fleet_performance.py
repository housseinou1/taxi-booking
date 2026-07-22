"""Tests for Fleet & Driver Performance Center (Phase 22)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

User = get_user_model()


class FleetPerformanceTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="Supervisor")
        Group.objects.get_or_create(name="Operations Manager")

        self.supervisor = User.objects.create_user(
            email="fleet-supervisor@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.supervisor.groups.add(Group.objects.get(name="Supervisor"))

        self.driver_user = User.objects.create_user(
            email="fleet-driver@test.local",
            password="Pass123!",
            user_type="driver",
        )
        DriverProfile.objects.create(user=self.driver_user, status="approved")

        self.regular = User.objects.create_user(
            email="fleet-regular@test.local",
            password="Pass123!",
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_fleet_dashboard_requires_fleet_role(self):
        self.client.force_authenticate(self.regular)
        response = self.client.get("/operations/fleet/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_supervisor_can_load_dashboard(self):
        self.client.force_authenticate(self.supervisor)
        response = self.client.get("/operations/fleet/dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in ("overview", "map", "drivers", "documents", "ceo"):
            self.assertIn(key, data)
        self.assertIn("total_registered", data["overview"])

    def test_fleet_report_export_csv(self):
        self.client.force_authenticate(self.supervisor)
        response = self.client.get("/operations/fleet/reports/export/?type=daily_fleet&export_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_suspend_and_reactivate_driver(self):
        self.client.force_authenticate(self.supervisor)
        suspend = self.client.post(f"/operations/fleet/drivers/{self.driver_user.id}/suspend/")
        self.assertEqual(suspend.status_code, 200)
        self.driver_user.refresh_from_db()
        self.assertFalse(self.driver_user.is_active)

        reactivate = self.client.post(f"/operations/fleet/drivers/{self.driver_user.id}/reactivate/")
        self.assertEqual(reactivate.status_code, 200)
        self.driver_user.refresh_from_db()
        self.assertTrue(self.driver_user.is_active)
