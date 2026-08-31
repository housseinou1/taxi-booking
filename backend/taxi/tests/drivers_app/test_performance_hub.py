"""Tests for Driver Performance & Rewards Hub."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile, DriverSettings
from taxi.rides.models import Ride

User = get_user_model()

HUB_URL = "/drivers/me/performance-hub/"
OPT_OUT_URL = "/drivers/me/performance-hub/leaderboard-opt-out/"


def _user(email, user_type="driver"):
    return User.objects.create_user(email=email, password="Pass123!", user_type=user_type)


def _profile(user, **kwargs):
    defaults = dict(
        status="approved",
        is_available=True,
        total_rides_completed=12,
        total_rides_accepted=15,
        total_rides_cancelled=1,
        total_rides_received=20,
        average_rating=4.6,
        acceptance_rate_points=85,
        performance_points=100,
        driver_level="bronze",
    )
    defaults.update(kwargs)
    return DriverProfile.objects.create(user=user, **defaults)


class DriverPerformanceHubTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver_user = _user("perf-hub@test.local")
        self.profile = _profile(self.driver_user)
        self.rider = _user("rider-perf@test.local", user_type="rider")
        self.client.force_authenticate(user=self.driver_user)

    def test_performance_hub_returns_scorecard(self):
        response = self.client.get(HUB_URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("scorecard", data)
        scorecard = data["scorecard"]
        self.assertEqual(scorecard["total_trips"], 12)
        self.assertIn("trends", scorecard)
        self.assertIn("week", scorecard["trends"])
        self.assertIn("month", scorecard["trends"])

    def test_performance_hub_includes_achievements_and_insights(self):
        response = self.client.get(HUB_URL)
        data = response.json()
        self.assertIn("achievements", data)
        self.assertGreater(len(data["achievements"]["badges"]), 0)
        self.assertIn("insights", data)
        self.assertIn("suggested_goals", data["insights"])

    def test_performance_hub_includes_level_and_history(self):
        response = self.client.get(HUB_URL)
        data = response.json()
        self.assertEqual(data["level"]["current_level"], "bronze")
        self.assertIn("level_requirements", data)
        self.assertIn("rewards_history", data)
        self.assertIn("incentives", data)

    def test_leaderboard_opt_out_toggle(self):
        response = self.client.patch(OPT_OUT_URL, {"opted_out": True}, format="json")
        self.assertEqual(response.status_code, 200)
        settings_obj = DriverSettings.objects.get(driver=self.profile)
        self.assertTrue(settings_obj.privacy_leaderboard_opt_out)

        hub = self.client.get(HUB_URL).json()
        self.assertTrue(hub["leaderboard"]["opted_out"])

        self.client.patch(OPT_OUT_URL, {"opted_out": False}, format="json")
        settings_obj.refresh_from_db()
        self.assertFalse(settings_obj.privacy_leaderboard_opt_out)

    def test_scorecard_pickup_time_from_rides(self):
        now = timezone.now()
        Ride.objects.create(
            rider=self.rider,
            driver=self.driver_user,
            status="completed",
            pickup="A",
            destination="B",
            created_at=now - timezone.timedelta(minutes=20),
            offer_sent_at=now - timezone.timedelta(minutes=20),
            driver_arrived_at=now - timezone.timedelta(minutes=10),
            completed_at=now,
            rating=5,
            driver_earning=Decimal("200"),
        )
        response = self.client.get(HUB_URL)
        pickup = response.json()["scorecard"]["average_pickup_time_minutes"]
        self.assertIsNotNone(pickup)
        self.assertGreaterEqual(pickup, 9)
