"""Tests for real-time operations center."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from deliveries.models import Delivery
from safety.models import SafetyIncident
from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS, CELERY_TASK_ALWAYS_EAGER=True)
class OperationsCenterTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="ops-admin@test.local",
            password="Pass123!",
        )
        self.ops_manager = User.objects.create_user(
            email="ops-manager@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="Operations Manager")
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

        self.viewer = User.objects.create_user(
            email="ops-viewer@test.local",
            password="Pass123!",
            is_staff=True,
        )
        Group.objects.get_or_create(name="Finance")
        self.viewer.groups.add(Group.objects.get(name="Finance"))

        self.rider = User.objects.create_user(
            email="ops-rider@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.driver = User.objects.create_user(
            email="ops-driver@test.local",
            password="Pass123!",
            user_type="driver",
        )
        DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            is_available=True,
            current_lat=18.07,
            current_lng=-15.95,
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            vehicle_plate="1234 AB 00",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="Airport",
            destination="Hotel",
            fare=Decimal("500.00"),
            status="driver_arriving",
            pickup_lat=18.08,
            pickup_lng=-15.96,
            destination_lat=18.09,
            destination_lng=-15.97,
        )
        self.delivery = Delivery.objects.create(
            customer=self.rider,
            driver=self.driver,
            pickup="Restaurant",
            destination="Office",
            recipient_name="Test",
            recipient_phone="+22248000000",
            fare=Decimal("200.00"),
            status="accepted",
            pickup_lat=18.07,
            pickup_lng=-15.95,
        )
        self.incident = SafetyIncident.objects.create(
            reference="SOS-TEST-001",
            reporter=self.rider,
            incident_type="sos",
            severity="critical",
            status="open",
            latitude=18.07,
            longitude=-15.95,
        )

    def tearDown(self):
        self.qr_patch.stop()

    def test_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        response = self.client.get("/operations/center/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_dashboard_returns_all_modules(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/center/dashboard/")
        self.assertEqual(response.status_code, 200)
        for key in ("fleet", "map", "trips", "deliveries", "emergency", "alerts", "timeline", "analytics"):
            self.assertIn(key, response.data)
        self.assertGreaterEqual(len(response.data["trips"]), 1)
        self.assertGreaterEqual(response.data["emergency"]["open_count"], 1)

    def test_fleet_and_map_endpoints(self):
        self.client.force_authenticate(self.admin)
        fleet = self.client.get("/operations/center/fleet/")
        self.assertEqual(fleet.status_code, 200)
        self.assertIn("online_drivers", fleet.data)
        map_data = self.client.get("/operations/center/map/")
        self.assertEqual(map_data.status_code, 200)
        self.assertIn("markers", map_data.data)

    def test_dispatch_requires_ops_role(self):
        self.client.force_authenticate(self.viewer)
        response = self.client.post(
            f"/operations/center/rides/{self.ride.id}/reassign/",
            {"driver_id": self.driver.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_ops_manager_can_acknowledge_incident(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.post(
            f"/operations/center/incidents/{self.incident.id}/action/",
            {"action": "acknowledge"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "acknowledged")

    def test_analytics_endpoint(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/center/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("requests", response.data)
        self.assertIn("revenue_per_hour", response.data)

    def test_incident_export_csv(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/operations/center/incidents/{self.incident.id}/export/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.get("Content-Type", ""))
        self.assertIn(b"SOS-TEST-001", response.content)
