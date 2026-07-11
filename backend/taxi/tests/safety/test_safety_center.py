"""Safety Center production tests."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from safety.models import EmergencyContact, SafetyIncident, SafetyResponseLog, TripLocationPing
from taxi.rides.models import Ride

User = get_user_model()


class SafetyCenterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rider = User.objects.create_user(
            email="rider-safety@test.local",
            password="Pass123!",
            user_type="rider",
            phone_number="+22248101010",
        )
        self.driver = User.objects.create_user(
            email="driver-safety@test.local",
            password="Pass123!",
            user_type="driver",
        )
        self.admin = User.objects.create_superuser(
            email="admin-safety@test.local",
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

    def test_trusted_contacts_max_five(self):
        self.client.force_authenticate(self.rider)
        for index in range(5):
            response = self.client.post(
                "/safety/contacts/",
                {
                    "name": f"Contact {index}",
                    "phone_number": f"+2224810101{index}",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 201)
        blocked = self.client.post(
            "/safety/contacts/",
            {"name": "Extra", "phone_number": "+22248109999"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)

    def test_sos_requires_active_ride(self):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/safety/sos/",
            {"ride_id": self.ride.id, "latitude": 18.08, "longitude": -15.96},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(SafetyIncident.objects.filter(ride=self.ride, incident_type="sos").exists())

    def test_trip_share_creates_secure_link(self):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/safety/trip-share/",
            {"ride_id": self.ride.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("share_url", response.data)
        self.assertIn("token", response.data)

    def test_monitoring_ping_records_location(self):
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            "/safety/monitoring/ping/",
            {
                "ride_id": self.ride.id,
                "latitude": 18.075,
                "longitude": -15.955,
                "accuracy": 12,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(TripLocationPing.objects.filter(ride=self.ride).exists())

    def test_admin_active_trips_and_replay(self):
        TripLocationPing.objects.create(
            ride=self.ride,
            user=self.rider,
            latitude=18.075,
            longitude=-15.955,
        )
        self.client.force_authenticate(self.admin)
        active = self.client.get("/safety/admin/active-trips/")
        self.assertEqual(active.status_code, 200)
        self.assertEqual(len(active.data["active_trips"]), 1)

        replay = self.client.get(f"/safety/admin/trip-replay/{self.ride.id}/")
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(len(replay.data["pings"]), 1)

    def test_admin_status_update_creates_response_log(self):
        incident = SafetyIncident.objects.create(
            reporter=self.rider,
            ride=self.ride,
            incident_type="sos",
            severity="critical",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/safety/admin/incidents/{incident.id}/",
            {"status": "acknowledged", "resolution_notes": "Team notified"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            SafetyResponseLog.objects.filter(incident=incident, action="acknowledged").exists()
        )
