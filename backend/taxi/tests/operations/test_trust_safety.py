"""Trust & Safety Center tests (Phase 29)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import LaunchAlert
from safety.models import SafetyIncident, SafetyResponseLog
from taxi.rides.models import Ride

User = get_user_model()


class TrustSafetyCenterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(
            email="rider-trust@test.local",
            password="Pass123!",
            user_type="rider",
            phone_number="+22248102020",
        )
        self.driver = User.objects.create_user(
            email="driver-trust@test.local",
            password="Pass123!",
            user_type="driver",
        )
        self.admin = User.objects.create_superuser(
            email="admin-trust@test.local",
            password="Pass123!",
        )
        self.ride = Ride.objects.create(
            rider=self.rider,
            driver=self.driver,
            pickup="A",
            destination="B",
            fare=Decimal("200"),
            status="in_progress",
            pickup_lat=18.07,
            pickup_lng=-15.95,
            destination_lat=18.09,
            destination_lng=-15.97,
        )

    def test_sos_creates_launch_alert(self):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/safety/sos/",
            {"ride_id": self.ride.id, "latitude": 18.08, "longitude": -15.96},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            LaunchAlert.objects.filter(alert_type="sos_event", metadata__incident_id=response.data["incident"]["id"]).exists()
        )

    def test_trust_safety_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        denied = self.client.get("/operations/trust-safety/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/trust-safety/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("safety_score", response.data)
        self.assertIn("incident_queue", response.data)
        self.assertIn("monitoring", response.data)

    def test_incident_queue_status_mapping(self):
        SafetyIncident.objects.create(
            reporter=self.rider,
            ride=self.ride,
            incident_type="sos",
            severity="critical",
            status="open",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/trust-safety/incidents/?status=new")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["new"], 1)
        self.assertEqual(response.data["incidents"][0]["status"], "new")

    def test_update_incident_via_trust_safety_api(self):
        incident = SafetyIncident.objects.create(
            reporter=self.rider,
            ride=self.ride,
            incident_type="sos",
            severity="critical",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/operations/trust-safety/incidents/{incident.id}/",
            {"status": "assigned", "resolution_notes": "Ops notified"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "assigned")
        incident.refresh_from_db()
        self.assertEqual(incident.status, "acknowledged")
        self.assertTrue(SafetyResponseLog.objects.filter(incident=incident).exists())

    def test_monitoring_scan_endpoint(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/operations/trust-safety/monitoring/", format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("alerts", response.data)

    def test_rider_safety_profile(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/operations/trust-safety/riders/{self.rider.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["id"], self.rider.id)
        self.assertIn("blacklist", response.data)

    def test_safety_reports_kpi(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/trust-safety/reports/?type=kpi")
        self.assertEqual(response.status_code, 200)
        self.assertIn("safety_score", response.data)
        self.assertIn("last_24h", response.data)

    def test_ceo_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/trust-safety/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("safety_score", response.data)
        self.assertIn("repeat_offenders", response.data)
