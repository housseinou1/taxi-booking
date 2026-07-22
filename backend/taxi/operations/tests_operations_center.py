from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.rides.models import Ride

User = get_user_model()


class OperationsCenterPermissionTests(TestCase):
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

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def test_dashboard_returns_all_modules(self):
        self._login(self.ceo)
        response = self.client.get("/operations/center/dashboard/")
        self.assertEqual(response.status_code, 200)
        for key in ("fleet", "map", "trips", "deliveries", "emergency", "alerts", "timeline", "analytics", "permissions"):
            self.assertIn(key, response.data)

    def test_regular_user_rejected(self):
        self._login(self.regular)
        response = self.client.get("/operations/center/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_fleet_endpoint(self):
        self._login(self.ops)
        response = self.client.get("/operations/center/fleet/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("counts", response.data)

    def test_map_endpoint(self):
        self._login(self.ops)
        response = self.client.get("/operations/center/map/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("markers", response.data)

    def test_analytics_endpoint(self):
        self._login(self.ops)
        response = self.client.get("/operations/center/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("requests", response.data)


class OperationsCenterDispatchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        patcher = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.addCleanup(patcher.stop)
        patcher.start()

        self.ceo = User.objects.create_user(
            email="ceo@yala.test", password="testpass", is_staff=True
        )
        self.ceo.groups.create(name="CEO")
        self.regular = User.objects.create_user(
            email="regular@yala.test", password="testpass"
        )

        self.driver = User.objects.create_user(
            email="driver@yala.test", password="testpass", user_type="driver"
        )
        DriverProfile.objects.create(
            user=self.driver, status="approved", is_available=True
        )
        self.rider = User.objects.create_user(
            email="rider@yala.test", password="testpass", user_type="rider"
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            pickup="Street A",
            destination="Street B",
            pickup_lat=18.07,
            pickup_lng=-15.95,
            destination_lat=18.08,
            destination_lng=-15.96,
            status="requested",
            dispatch_status="searching",
        )

    def test_force_assign_requires_dispatch_permission(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.post(
            f"/operations/center/rides/{self.ride.id}/force-assign/",
            {"driver_id": self.driver.id},
        )
        self.assertEqual(response.status_code, 403)

    def test_force_assign_driver_to_ride(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post(
            f"/operations/center/rides/{self.ride.id}/force-assign/",
            {"driver_id": self.driver.id},
        )
        self.assertEqual(response.status_code, 200)
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.driver_id, self.driver.id)

    def test_cancel_ride_requires_permission(self):
        self.client.force_authenticate(user=self.regular)
        response = self.client.post(
            f"/operations/center/rides/{self.ride.id}/cancel/",
            {"reason": "test"},
        )
        self.assertEqual(response.status_code, 403)

    def test_pause_driver(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post(
            f"/operations/center/drivers/{self.driver.id}/pause/",
            {"paused": True},
        )
        self.assertEqual(response.status_code, 200)
        self.driver.driver_profile.refresh_from_db()
        self.assertFalse(self.driver.driver_profile.is_available)

    def test_broadcast_nearby_rejects_missing_coords(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.post(
            "/operations/center/broadcast-nearby/",
            {"message": "test"},
        )
        self.assertEqual(response.status_code, 400)
