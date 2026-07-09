"""
QA test suite — Step 2: Driver Cancellation & Performance System.

Tests:
  ✓ Driver cancel (accepted ride) → penalty applied
  ✓ Driver cancel (before accepting) → no penalty
  ✓ Rider cancel → no driver penalty
  ✓ Rider no-show → no driver penalty, no_show counter incremented
  ✓ Excessive daily cancellations → FraudFlag + risk flag
  ✓ Excessive weekly cancellations → risk flag + weekly message
  ✓ Acceptance rate decrements on cancel
  ✓ Driver score (performance_points) decrements on cancel
  ✓ Driver level evaluation (bronze → silver thresholds)
  ✓ Admin performance endpoint returns no_show, risk, level data
  ✓ record_ride_completed increments total_rides_completed
  ✓ milestone notification fires at 100 trips
  ✓ level-up notification fires when level changes
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile
from taxi.drivers.services.level_service import DriverLevelService
from taxi.drivers.services.ride_performance_service import (
    DAILY_DRIVER_CANCEL_RISK_THRESHOLD,
    WEEKLY_DRIVER_CANCEL_RISK_THRESHOLD,
    RISK_WARNING_MESSAGE,
    WEEKLY_RISK_WARNING_MESSAGE,
    apply_driver_cancellation_penalty,
    get_driver_performance_snapshot,
    notify_driver_milestone,
    notify_driver_level_up,
    record_driver_no_show,
    record_ride_completed,
)
from taxi.rides.models import Ride

User = get_user_model()

CANCEL_URL = "/rides/cancel/{ride_id}/"
STATS_URL = "/drivers/me/stats/"
PERFORMANCE_URL = "/drivers/performance/"


def _make_user(email, user_type="driver", superuser=False):
    if superuser:
        return User.objects.create_superuser(email=email, password="Pass123!")
    return User.objects.create_user(
        email=email, password="Pass123!", user_type=user_type
    )


def _make_driver_profile(user, **kwargs):
    defaults = dict(
        status="approved",
        is_available=True,
        performance_points=100,
        acceptance_rate_points=100,
        total_rides_cancelled=0,
        cancellations_today_count=0,
        total_rides_no_show=0,
        total_rides_completed=0,
        total_rides_accepted=0,
        total_rides_received=0,
    )
    defaults.update(kwargs)
    return DriverProfile.objects.create(user=user, **defaults)


def _make_ride(rider, driver, status="driver_arrived", arrived_minutes_ago=6):
    arrived_at = timezone.now() - timedelta(minutes=arrived_minutes_ago)
    return Ride.objects.create(
        rider=rider,
        driver=driver,
        pickup="Pickup A",
        destination="Destination B",
        pickup_lat=18.07,
        pickup_lng=-15.96,
        destination_lat=18.09,
        destination_lng=-15.98,
        status=status,
        fare=Decimal("100.00"),
        driver_earning=Decimal("80.00"),
        driver_arrived_at=arrived_at if status == "driver_arrived" else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Service-layer unit tests (no HTTP)
# ─────────────────────────────────────────────────────────────────────────────

@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class DriverCancellationPenaltyTests(TestCase):

    def setUp(self):
        self.driver_user = _make_user("perf-driver@test.com")
        self.profile = _make_driver_profile(self.driver_user)

    # ── Driver cancel after accepting ──────────────────────────────────────

    def test_cancel_deducts_performance_points(self):
        result = apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 97)
        self.assertEqual(result["performance_points"], 97)

    def test_cancel_deducts_acceptance_rate(self):
        apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.acceptance_rate_points, 99)

    def test_cancel_increments_total_cancelled(self):
        apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_cancelled, 1)

    def test_cancel_increments_today_count(self):
        apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.cancellations_today_count, 1)

    def test_points_floored_at_zero(self):
        self.profile.performance_points = 2
        self.profile.acceptance_rate_points = 0
        self.profile.save()
        apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 0)
        self.assertEqual(self.profile.acceptance_rate_points, 0)

    # ── Daily abuse threshold ──────────────────────────────────────────────

    @patch("taxi.drivers.services.ride_performance_service._notify_risk_warning")
    def test_daily_threshold_triggers_risk_flag(self, mock_notify):
        for _ in range(DAILY_DRIVER_CANCEL_RISK_THRESHOLD):
            apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.account_risk_flag)
        self.assertTrue(self.profile.account_under_review)
        self.assertEqual(self.profile.account_risk_reason, RISK_WARNING_MESSAGE)
        mock_notify.assert_called()

    @patch("taxi.drivers.services.ride_performance_service._notify_risk_warning")
    @patch("taxi.drivers.services.ride_performance_service._flag_driver_cancellation_abuse")
    def test_daily_threshold_creates_fraud_flag(self, mock_flag, mock_notify):
        for _ in range(DAILY_DRIVER_CANCEL_RISK_THRESHOLD):
            apply_driver_cancellation_penalty(self.profile)
        mock_flag.assert_called()

    @patch("taxi.drivers.services.ride_performance_service._notify_risk_warning")
    def test_below_daily_threshold_no_risk(self, mock_notify):
        for _ in range(DAILY_DRIVER_CANCEL_RISK_THRESHOLD - 1):
            apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.account_risk_flag)

    # ── Weekly abuse threshold ─────────────────────────────────────────────

    @patch("taxi.drivers.services.ride_performance_service._count_weekly_driver_cancellations")
    @patch("taxi.drivers.services.ride_performance_service._notify_risk_warning")
    def test_weekly_threshold_triggers_risk_flag(self, mock_notify, mock_weekly):
        mock_weekly.return_value = WEEKLY_DRIVER_CANCEL_RISK_THRESHOLD
        result = apply_driver_cancellation_penalty(self.profile)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.account_risk_flag)
        self.assertTrue(result["risk_triggered"])
        mock_notify.assert_called_with(self.profile, WEEKLY_RISK_WARNING_MESSAGE)

    # ── No-show: no penalty ────────────────────────────────────────────────

    def test_no_show_increments_counter_only(self):
        record_driver_no_show(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_no_show, 1)
        self.assertEqual(self.profile.performance_points, 100)
        self.assertEqual(self.profile.acceptance_rate_points, 100)
        self.assertEqual(self.profile.total_rides_cancelled, 0)

    def test_no_show_does_not_trigger_risk_flag(self):
        for _ in range(10):
            record_driver_no_show(self.profile)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.account_risk_flag)

    # ── Performance snapshot ───────────────────────────────────────────────

    def test_snapshot_includes_no_show_count(self):
        self.profile.total_rides_no_show = 3
        self.profile.save()
        snap = get_driver_performance_snapshot(self.profile)
        self.assertEqual(snap["total_rides_no_show"], 3)

    def test_snapshot_cancellation_warning_empty_when_clean(self):
        snap = get_driver_performance_snapshot(self.profile)
        self.assertEqual(snap["cancellation_warning"], "")

    def test_snapshot_cancellation_warning_set_when_at_risk(self):
        self.profile.account_risk_flag = True
        self.profile.account_risk_reason = RISK_WARNING_MESSAGE
        self.profile.save()
        snap = get_driver_performance_snapshot(self.profile)
        self.assertIn("cancellation", snap["cancellation_warning"].lower())

    def test_score_tier_diamond(self):
        from taxi.drivers.services.ride_performance_service import get_driver_score_tier

        tier = get_driver_score_tier(97)
        self.assertEqual(tier["label"], "Diamond")

    def test_score_tier_needs_improvement(self):
        from taxi.drivers.services.ride_performance_service import get_driver_score_tier

        tier = get_driver_score_tier(65)
        self.assertEqual(tier["label"], "Needs Improvement")


# ─────────────────────────────────────────────────────────────────────────────
# Milestone & level-up notifications
# ─────────────────────────────────────────────────────────────────────────────

class MilestoneNotificationTests(TestCase):

    def setUp(self):
        self.driver_user = _make_user("milestone-driver@test.com")
        self.profile = _make_driver_profile(self.driver_user)

    @patch("taxi.drivers.services.ride_performance_service._notify_risk_warning")
    def test_milestone_fires_at_100(self, _):
        with patch("taxi.drivers.services.ride_performance_service.notify_driver_milestone") as mock_m:
            self.profile.total_rides_completed = 99
            self.profile.save()
            record_ride_completed(self.profile)
            mock_m.assert_called_once_with(self.profile, 100)

    def test_milestone_no_fire_at_non_milestone(self):
        with patch("notifications.push.send_push_to_user") as mock_push:
            notify_driver_milestone(self.profile, 42)
            mock_push.assert_not_called()

    @patch("notifications.push.send_push_to_user")
    def test_level_up_notification_sends_push(self, mock_push):
        notify_driver_level_up(self.profile, "gold")
        mock_push.assert_called_once()
        call_args = mock_push.call_args
        self.assertIn("gold", call_args[1]["data"]["level"] if "data" in call_args[1] else str(call_args))

    def test_record_ride_completed_increments_count(self):
        self.profile.total_rides_completed = 5
        self.profile.save()
        with patch("taxi.drivers.services.ride_performance_service.notify_driver_milestone"):
            record_ride_completed(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.total_rides_completed, 6)


# ─────────────────────────────────────────────────────────────────────────────
# Driver Level evaluation
# ─────────────────────────────────────────────────────────────────────────────

class DriverLevelEvaluationTests(TestCase):

    def setUp(self):
        self.driver_user = _make_user("level-driver@test.com")
        self.profile = _make_driver_profile(self.driver_user)
        self.svc = DriverLevelService()

    def test_new_driver_is_bronze(self):
        level = self.svc.evaluate_level(self.profile)
        self.assertEqual(level, "bronze")

    def test_silver_threshold_met(self):
        self.profile.total_rides_completed = 85
        self.profile.total_rides_accepted = 100
        self.profile.total_rides_received = 120
        self.profile.average_rating = Decimal("4.6")
        self.profile.save()
        level = self.svc.evaluate_level(self.profile)
        self.assertEqual(level, "silver")

    def test_silver_threshold_not_met_low_rating(self):
        self.profile.total_rides_completed = 85
        self.profile.total_rides_accepted = 100
        self.profile.total_rides_received = 120
        self.profile.average_rating = Decimal("4.2")
        self.profile.save()
        level = self.svc.evaluate_level(self.profile)
        self.assertEqual(level, "bronze")

    def test_gold_threshold_met(self):
        self.profile.total_rides_completed = 225
        self.profile.total_rides_accepted = 250
        self.profile.total_rides_received = 280
        self.profile.average_rating = Decimal("4.8")
        self.profile.save()
        level = self.svc.evaluate_level(self.profile)
        self.assertIn(level, ["gold", "platinum", "elite"])

    def test_level_badge_in_profile_response(self):
        self.profile.driver_level = "gold"
        self.profile.save()
        progress = self.svc.get_progress(self.profile)
        self.assertEqual(progress["current_level"], "gold")
        self.assertIsNotNone(progress["next_level"])


# ─────────────────────────────────────────────────────────────────────────────
# HTTP-level cancellation tests
# ─────────────────────────────────────────────────────────────────────────────

@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class CancelRideHTTPTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.rider = _make_user("http-rider@test.com", user_type="rider")
        self.driver = _make_user("http-driver@test.com", user_type="driver")
        self.admin = _make_user("http-admin@test.com", superuser=True)
        self.profile = _make_driver_profile(self.driver)

    def _ride(self, status="driver_arrived", arrived_minutes_ago=6):
        return _make_ride(self.rider, self.driver, status, arrived_minutes_ago)

    def _cancel(self, ride, reason="I need to cancel", as_user=None, extra=None):
        user = as_user or self.driver
        self.client.force_authenticate(user=user)
        body = {"reason": reason}
        if extra:
            body.update(extra)
        return self.client.post(
            CANCEL_URL.format(ride_id=ride.id),
            body,
            format="json",
        )

    # ── Driver cancel (accepted ride) ──────────────────────────────────────

    def test_driver_cancel_accepted_ride_returns_200(self):
        ride = self._ride(status="driver_arriving")
        resp = self._cancel(ride)
        self.assertIn(resp.status_code, [200, 201])

    def test_driver_cancel_accepted_ride_applies_penalty(self):
        ride = self._ride(status="driver_arriving")
        self._cancel(ride)
        self.profile.refresh_from_db()
        self.assertLess(self.profile.performance_points, 100)
        self.assertLess(self.profile.acceptance_rate_points, 100)

    def test_driver_cancel_returns_driver_performance_in_response(self):
        ride = self._ride(status="driver_arriving")
        resp = self._cancel(ride)
        self.assertIn("driver_performance", resp.data)

    def test_driver_cancel_before_accept_no_penalty(self):
        ride = _make_ride(self.rider, self.driver, status="requested")
        ride.driver = None
        ride.save(update_fields=["driver"])
        self.client.force_authenticate(user=self.driver)
        resp = self.client.post(
            CANCEL_URL.format(ride_id=ride.id),
            {"reason": "cleanup"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 100)

    # ── Rider cancel → no driver penalty ──────────────────────────────────

    def test_rider_cancel_no_driver_penalty(self):
        ride = self._ride(status="driver_arriving")
        self._cancel(ride, as_user=self.rider, reason="Changed my mind")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 100)
        self.assertEqual(self.profile.acceptance_rate_points, 100)

    # ── Rider no-show → no penalty, no_show counter incremented ───────────

    @patch("taxi.rides.services.no_show_service.evaluate_no_show_eligibility")
    def test_no_show_cancel_no_penalty_and_no_show_counter(self, mock_eval):
        mock_eval.return_value = {
            "eligible": True,
            "penalty_waived": True,
            "waited_seconds": 360,
            "distance_to_pickup_m": 50,
            "max_wait_seconds": 300,
            "free_wait_seconds": 180,
            "call_attempts": 0,
            "reason": "max_wait_exceeded",
        }
        ride = self._ride(status="driver_arrived", arrived_minutes_ago=6)
        self._cancel(
            ride,
            reason="Rider no-show",
            extra={"lat": 18.07, "lng": -15.96, "device_id": "qa-step2"},
        )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.performance_points, 100)
        self.assertEqual(self.profile.acceptance_rate_points, 100)
        self.assertEqual(self.profile.total_rides_no_show, 1)


# ─────────────────────────────────────────────────────────────────────────────
# Admin performance endpoint
# ─────────────────────────────────────────────────────────────────────────────

@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class AdminPerformanceEndpointTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-perf@test.com", superuser=True)
        self.driver = _make_user("admin-driver@test.com", user_type="driver")
        self.profile = _make_driver_profile(
            self.driver,
            total_rides_no_show=3,
            account_risk_flag=True,
            account_under_review=True,
            account_risk_reason=RISK_WARNING_MESSAGE,
            driver_level="silver",
        )
        self.client.force_authenticate(user=self.admin)

    def test_performance_endpoint_returns_200(self):
        resp = self.client.get(PERFORMANCE_URL)
        self.assertEqual(resp.status_code, 200)

    def test_performance_response_has_drivers_list(self):
        resp = self.client.get(PERFORMANCE_URL)
        self.assertIn("drivers", resp.data)

    def test_under_review_filter(self):
        resp = self.client.get(f"{PERFORMANCE_URL}?under_review=1")
        self.assertEqual(resp.status_code, 200)
        for driver in resp.data.get("drivers", []):
            self.assertTrue(driver.get("account_under_review", False))

    def test_risk_filter(self):
        resp = self.client.get(f"{PERFORMANCE_URL}?risk=1")
        self.assertEqual(resp.status_code, 200)

    def test_no_show_filter(self):
        resp = self.client.get(f"{PERFORMANCE_URL}?has_no_show=1")
        self.assertEqual(resp.status_code, 200)
        for driver in resp.data.get("drivers", []):
            self.assertGreater(driver.get("total_rides_no_show", 0), 0)

    def test_driver_level_in_response(self):
        resp = self.client.get(PERFORMANCE_URL)
        drivers = resp.data.get("drivers", [])
        target = next((d for d in drivers if d["user_id"] == self.driver.id), None)
        self.assertIsNotNone(target)
        self.assertEqual(target.get("driver_level"), "silver")

    def test_no_show_count_in_response(self):
        resp = self.client.get(PERFORMANCE_URL)
        drivers = resp.data.get("drivers", [])
        target = next((d for d in drivers if d["user_id"] == self.driver.id), None)
        self.assertIsNotNone(target)
        self.assertEqual(target.get("total_rides_no_show"), 3)

    def test_non_admin_cannot_access(self):
        rider = _make_user("unauth-rider@test.com", user_type="rider")
        self.client.force_authenticate(user=rider)
        resp = self.client.get(PERFORMANCE_URL)
        self.assertEqual(resp.status_code, 403)


# ─────────────────────────────────────────────────────────────────────────────
# DriverStatsView endpoint
# ─────────────────────────────────────────────────────────────────────────────

@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class DriverStatsViewTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.driver = _make_user("stats-driver@test.com", user_type="driver")
        self.profile = _make_driver_profile(
            self.driver,
            total_rides_no_show=2,
            account_risk_flag=True,
            account_risk_reason=RISK_WARNING_MESSAGE,
            total_rides_accepted=10,
            total_rides_cancelled=2,
            total_rides_completed=8,
        )
        self.client.force_authenticate(user=self.driver)

    def test_stats_returns_200(self):
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.status_code, 200)

    def test_stats_includes_no_show_count(self):
        resp = self.client.get(STATS_URL)
        self.assertEqual(resp.data["total_rides_no_show"], 2)

    def test_stats_includes_driver_level(self):
        resp = self.client.get(STATS_URL)
        self.assertIn("driver_level", resp.data)

    def test_stats_includes_driver_score_label(self):
        resp = self.client.get(STATS_URL)
        self.assertIn("driver_score_label", resp.data)

    def test_stats_includes_earnings(self):
        resp = self.client.get(STATS_URL)
        self.assertIn("earnings", resp.data)
        self.assertIn("today", resp.data["earnings"])
        self.assertIn("week", resp.data["earnings"])
        self.assertIn("month", resp.data["earnings"])

    def test_stats_includes_cancellation_warning(self):
        resp = self.client.get(STATS_URL)
        self.assertNotEqual(resp.data.get("cancellation_warning"), None)
        self.assertIn("cancellation", resp.data["cancellation_warning"].lower())
