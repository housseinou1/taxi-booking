"""
QA test suite — Step 3: Driver Rewards & Incentives.

Tests:
  ✓ Points awarded on ride complete
  ✓ Points deducted on driver cancellation
  ✓ 5-star rating bonus
  ✓ Level / tier changes
  ✓ Challenge progress
  ✓ Achievement badges
  ✓ Notifications (mocked)
  ✓ Admin leaderboard
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import (
    Achievement,
    DriverChallengeProgress,
    DriverPointTransaction,
    DriverProfile,
    WeeklyChallenge,
)
from taxi.drivers.services.rewards_service import RewardsService, get_reward_tier
from taxi.drivers.services.challenge_service import ChallengeService
from taxi.drivers.services.achievement_service import AchievementService
from taxi.rides.models import Ride

User = get_user_model()

DASHBOARD_URL = "/drivers/me/rewards/dashboard/"
HISTORY_URL = "/drivers/me/rewards/history/"
CHALLENGES_URL = "/drivers/me/challenges/"
ADMIN_URL = "/drivers/rewards/admin/"
COMPLETE_URL = "/rides/complete/{ride_id}/"
CANCEL_URL = "/rides/cancel/{ride_id}/"
RATE_URL = "/rides/rate/{ride_id}/"


def _user(email, user_type="driver", superuser=False):
    if superuser:
        return User.objects.create_superuser(email=email, password="Pass123!")
    return User.objects.create_user(email=email, password="Pass123!", user_type=user_type)


def _profile(user, **kwargs):
    defaults = dict(
        status="approved",
        is_available=True,
        reward_points=0,
        reward_tier="bronze",
        total_rides_completed=0,
        performance_points=100,
        acceptance_rate_points=100,
    )
    defaults.update(kwargs)
    return DriverProfile.objects.create(user=user, **defaults)


def _ride(rider, driver, status="in_progress", **kwargs):
    defaults = dict(
        pickup="City Center",
        destination="Toujounine",
        pickup_lat=18.0735,
        pickup_lng=-15.9582,
        distance_km=Decimal("4"),
        fare=Decimal("280"),
        driver_earning=Decimal("196"),
    )
    defaults.update(kwargs)
    return Ride.objects.create(rider=rider, driver=driver, status=status, **defaults)


@patch("notifications.push.send_push_to_user")
class RewardsServiceTests(TestCase):
    def setUp(self):
        self.driver_user = _user("drv-rewards@test.local")
        self.profile = _profile(self.driver_user)
        self.rider = _user("rider-rewards@test.local", user_type="rider")
        self.svc = RewardsService()

    def test_complete_ride_awards_base_points(self, _mock_push):
        ride = _ride(self.rider, self.driver_user, status="completed", completed_at=timezone.now())
        result = self.svc.on_ride_completed(ride, self.profile)
        self.profile.refresh_from_db()
        self.assertGreaterEqual(result["points_awarded"], 10)
        self.assertGreaterEqual(self.profile.reward_points, 10)
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="ride_complete"
            ).exists()
        )

    def test_airport_ride_bonus(self, _mock_push):
        ride = _ride(
            self.rider,
            self.driver_user,
            status="completed",
            pickup="Nouakchott Airport",
            destination="Hotel",
            completed_at=timezone.now(),
        )
        self.svc.on_ride_completed(ride, self.profile)
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="airport_ride"
            ).exists()
        )

    def test_long_distance_bonus(self, _mock_push):
        ride = _ride(
            self.rider,
            self.driver_user,
            status="completed",
            distance_km=Decimal("20"),
            completed_at=timezone.now(),
        )
        self.svc.on_ride_completed(ride, self.profile)
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="long_distance_ride"
            ).exists()
        )

    def test_driver_cancel_deducts_points(self, _mock_push):
        self.profile.reward_points = 100
        self.profile.save(update_fields=["reward_points"])
        ride = _ride(self.rider, self.driver_user)
        self.svc.on_driver_cancellation(self.profile, ride)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.reward_points, 97)
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="driver_cancellation", amount=-3
            ).exists()
        )

    def test_five_star_rating_bonus(self, _mock_push):
        ride = _ride(self.rider, self.driver_user, status="completed")
        self.svc.on_ride_rated(ride, self.profile, 5)
        self.profile.refresh_from_db()
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="five_star_rating", amount=5
            ).exists()
        )

    def test_referral_completed_bonus(self, _mock_push):
        self.svc.on_referral_completed(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.reward_points, 50)

    def test_tier_progression(self, _mock_push):
        tier = get_reward_tier(1500)
        self.assertEqual(tier["tier"], "silver")
        self.assertEqual(tier["label"], "Silver")
        self.assertGreater(tier["points_to_next_level"], 0)

        self.profile.reward_points = 12000
        self.svc.sync_tier(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.reward_tier, "diamond")

    def test_first_ride_achievement(self, _mock_push):
        AchievementService().ensure_achievements_exist()
        self.profile.total_rides_completed = 1
        self.profile.save(update_fields=["total_rides_completed"])
        earned = AchievementService().check_ride_count_milestones(self.profile)
        self.assertEqual(len(earned), 1)
        self.assertEqual(earned[0].code, "first_ride")


@patch("notifications.push.send_push_to_user")
class ChallengeServiceTests(TestCase):
    def setUp(self):
        self.driver_user = _user("drv-chal@test.local")
        self.profile = _profile(self.driver_user)
        self.rider = _user("rider-chal@test.local", user_type="rider")
        self.challenge_svc = ChallengeService()

    def test_ride_count_challenge_progress(self, _mock_push):
        now = timezone.now()
        challenge = WeeklyChallenge.objects.create(
            name="Test 3 rides",
            challenge_type="ride_count",
            target_value=3,
            reward_points=25,
            reward_amount=Decimal("100"),
            status="active",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=6),
        )
        ride = _ride(
            self.rider,
            self.driver_user,
            status="completed",
            completed_at=now,
        )
        self.challenge_svc.on_ride_completed(self.profile, ride)
        progress = DriverChallengeProgress.objects.get(
            driver=self.profile, challenge=challenge
        )
        self.assertEqual(progress.current_value, 1)


@patch("notifications.push.send_push_to_user")
class RewardsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver_user = _user("drv-api@test.local")
        self.profile = _profile(self.driver_user, reward_points=2500)
        self.admin = _user("admin-rewards@test.local", superuser=True)
        self.client.force_authenticate(self.driver_user)

    def test_dashboard_returns_200(self, _mock_push):
        response = self.client.get(DASHBOARD_URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("current_level", data)
        self.assertIn("total_points", data)
        self.assertIn("progress_percent", data)
        self.assertIn("lifetime_trips", data)
        self.assertIn("challenges", data)

    def test_history_returns_transactions(self, _mock_push):
        DriverPointTransaction.objects.create(
            driver=self.profile,
            amount=10,
            category="ride_complete",
            description="Test",
        )
        response = self.client.get(HISTORY_URL)
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()["transactions"]), 1)

    def test_challenges_endpoint(self, _mock_push):
        response = self.client.get(CHALLENGES_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("challenges", response.json())

    def test_admin_leaderboard(self, _mock_push):
        self.client.force_authenticate(self.admin)
        response = self.client.get(ADMIN_URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("top_drivers", data)
        self.assertIn("top_earners", data)
        self.assertIn("highest_rated", data)
        self.assertIn("most_improved", data)
        self.assertIn("reward_history", data)


@patch("notifications.push.send_push_to_user")
@patch("taxi.rides.views.capture_ride_payment", return_value=True)
@patch("taxi.rides.views.broadcast_ride_update")
class RideFlowRewardsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver_user = _user("drv-flow@test.local")
        self.profile = _profile(self.driver_user)
        self.rider = _user("rider-flow@test.local", user_type="rider")
        self.ride = _ride(self.rider, self.driver_user, status="in_progress")
        self.client.force_authenticate(self.driver_user)

    def test_complete_ride_via_api_awards_points(self, _mock_bc, _mock_pay, _mock_push):
        response = self.client.post(COMPLETE_URL.format(ride_id=self.ride.id))
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertGreaterEqual(self.profile.reward_points, 10)

    def test_rate_ride_awards_five_star_points(self, _mock_bc, _mock_pay, _mock_push):
        self.ride.status = "completed"
        self.ride.completed_at = timezone.now()
        self.ride.save()
        self.client.force_authenticate(self.rider)
        response = self.client.post(
            RATE_URL.format(ride_id=self.ride.id),
            {"rating": 5, "review": "Great"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            DriverPointTransaction.objects.filter(
                driver=self.profile, category="five_star_rating"
            ).exists()
        )
