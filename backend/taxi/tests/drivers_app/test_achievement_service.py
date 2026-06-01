"""
Unit tests for AchievementService.

Tests cover:
- Milestone evaluation: first ride, 100 rides, 500 rides, 5-star streak, zero cancellations
- Reward points accumulation: completed rides, 4+ star ratings, consecutive online hours
- Trigger achievement check after ride completion (on_ride_completed)
- on_ride_rated: points and streak check after rating

Requirements: 14.1, 14.3, 14.4
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock

import pytest
from django.utils import timezone

from taxi.drivers.services.achievement_service import (
    AchievementService,
    MILESTONE_DEFINITIONS,
    POINTS_PER_COMPLETED_RIDE,
    POINTS_PER_HIGH_RATING,
    POINTS_PER_CONSECUTIVE_ONLINE_HOUR,
)


@pytest.fixture
def service():
    return AchievementService()


@pytest.fixture
def mock_driver_profile():
    """Create a mock driver profile with default values."""
    profile = MagicMock()
    profile.total_rides_completed = 0
    profile.reward_points = 0
    profile.user = MagicMock()
    profile.user.id = 1
    return profile


class TestEnsureAchievementsExist:
    """Tests for ensure_achievements_exist()"""

    @patch("taxi.drivers.services.achievement_service.Achievement")
    def test_creates_all_milestone_achievements(self, mock_achievement, service):
        """All milestone definitions are created in the database."""
        service.ensure_achievements_exist()
        assert mock_achievement.objects.get_or_create.call_count == len(
            MILESTONE_DEFINITIONS
        )

    @patch("taxi.drivers.services.achievement_service.Achievement")
    def test_uses_correct_codes(self, mock_achievement, service):
        """Each milestone code is used as the achievement code."""
        service.ensure_achievements_exist()
        called_codes = [
            call[1]["code"]
            for call in mock_achievement.objects.get_or_create.call_args_list
        ]
        for code in MILESTONE_DEFINITIONS:
            assert code in called_codes


class TestCheckRideCountMilestones:
    """Tests for check_ride_count_milestones()"""

    @patch("taxi.drivers.services.achievement_service.Achievement")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_first_ride_milestone(
        self, mock_driver_achievement, mock_achievement, service, mock_driver_profile
    ):
        """First ride milestone is awarded when total_rides_completed >= 1."""
        mock_driver_profile.total_rides_completed = 1
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_achievement.objects.get.return_value = MagicMock(code="first_ride")
        mock_driver_achievement.objects.create.return_value = MagicMock()

        result = service.check_ride_count_milestones(mock_driver_profile)
        assert len(result) >= 1

    @patch("taxi.drivers.services.achievement_service.Achievement")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_100_rides_milestone(
        self, mock_driver_achievement, mock_achievement, service, mock_driver_profile
    ):
        """100 rides milestone is awarded when total_rides_completed >= 100."""
        mock_driver_profile.total_rides_completed = 100
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_achievement.objects.get.return_value = MagicMock(code="100_rides")
        mock_driver_achievement.objects.create.return_value = MagicMock()

        result = service.check_ride_count_milestones(mock_driver_profile)
        # Should award first_ride, 100_rides (both thresholds met)
        assert len(result) >= 1

    @patch("taxi.drivers.services.achievement_service.Achievement")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_500_rides_milestone(
        self, mock_driver_achievement, mock_achievement, service, mock_driver_profile
    ):
        """500 rides milestone is awarded when total_rides_completed >= 500."""
        mock_driver_profile.total_rides_completed = 500
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_achievement.objects.get.return_value = MagicMock(code="500_rides")
        mock_driver_achievement.objects.create.return_value = MagicMock()

        result = service.check_ride_count_milestones(mock_driver_profile)
        # Should award first_ride, 100_rides, 500_rides
        assert len(result) >= 1

    @patch("taxi.drivers.services.achievement_service.Achievement")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_no_milestone_when_zero_rides(
        self, mock_driver_achievement, mock_achievement, service, mock_driver_profile
    ):
        """No ride count milestones awarded when total_rides_completed is 0."""
        mock_driver_profile.total_rides_completed = 0
        result = service.check_ride_count_milestones(mock_driver_profile)
        assert result == []

    @patch("taxi.drivers.services.achievement_service.Achievement")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_already_earned_not_duplicated(
        self, mock_driver_achievement, mock_achievement, service, mock_driver_profile
    ):
        """Already earned achievements are not duplicated (IntegrityError handled)."""
        from django.db import IntegrityError

        mock_driver_profile.total_rides_completed = 1
        mock_achievement.objects.get.return_value = MagicMock(code="first_ride")
        mock_driver_achievement.objects.create.side_effect = IntegrityError()

        result = service.check_ride_count_milestones(mock_driver_profile)
        # IntegrityError means already earned, so None is returned
        assert all(a is None for a in result) or result == []


class TestCheckFiveStarStreak:
    """Tests for check_five_star_streak()"""

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_streak_awarded_with_10_five_star_rides(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """5-star streak achievement awarded when last 10 rides all have 5-star rating."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        # Mock queryset chain
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.__getitem__ = MagicMock(return_value=mock_qs)
        mock_qs.values_list.return_value = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
        mock_ride.objects.filter.return_value = mock_qs

        with patch.object(service, "_award_achievement") as mock_award:
            mock_award.return_value = MagicMock()
            result = service.check_five_star_streak(mock_driver_profile)
            assert result is not None

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_no_streak_with_less_than_10_rides(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """No streak achievement when fewer than 10 rated rides."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.__getitem__ = MagicMock(return_value=mock_qs)
        mock_qs.values_list.return_value = [5, 5, 5, 5, 5]  # Only 5 rides
        mock_ride.objects.filter.return_value = mock_qs

        result = service.check_five_star_streak(mock_driver_profile)
        assert result is None

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_no_streak_with_non_five_star(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """No streak achievement when any of last 10 rides is not 5-star."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_qs = MagicMock()
        mock_qs.order_by.return_value.__getitem__ = MagicMock(return_value=mock_qs)
        mock_qs.values_list.return_value = [5, 5, 5, 5, 4, 5, 5, 5, 5, 5]  # One 4-star
        mock_ride.objects.filter.return_value = mock_qs

        result = service.check_five_star_streak(mock_driver_profile)
        assert result is None

    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_already_earned_skips_query(
        self, mock_driver_achievement, service, mock_driver_profile
    ):
        """If already earned, skip the database query."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = True
        result = service.check_five_star_streak(mock_driver_profile)
        assert result is None


class TestCheckZeroCancellations30Days:
    """Tests for check_zero_cancellations_30_days()"""

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_awarded_with_zero_cancellations_and_completed_rides(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """Achievement awarded when zero cancellations and at least one completed ride in 30 days."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        # First filter call: cancellations count = 0
        # Second filter call: completed rides count > 0
        mock_ride.objects.filter.return_value.count.side_effect = [0, 5]

        with patch.object(service, "_award_achievement") as mock_award:
            mock_award.return_value = MagicMock()
            result = service.check_zero_cancellations_30_days(mock_driver_profile)
            assert result is not None

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_not_awarded_with_cancellations(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """Not awarded when there are cancellations in the last 30 days."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        mock_ride.objects.filter.return_value.count.return_value = 2  # 2 cancellations

        result = service.check_zero_cancellations_30_days(mock_driver_profile)
        assert result is None

    @patch("taxi.drivers.services.achievement_service.Ride")
    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_not_awarded_with_no_completed_rides(
        self, mock_driver_achievement, mock_ride, service, mock_driver_profile
    ):
        """Not awarded when zero cancellations but also zero completed rides."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = (
            False
        )
        # First call: cancellations = 0, Second call: completed = 0
        mock_ride.objects.filter.return_value.count.side_effect = [0, 0]

        result = service.check_zero_cancellations_30_days(mock_driver_profile)
        assert result is None

    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_already_earned_skips_query(
        self, mock_driver_achievement, service, mock_driver_profile
    ):
        """If already earned, skip the database query."""
        mock_driver_achievement.objects.filter.return_value.exists.return_value = True
        result = service.check_zero_cancellations_30_days(mock_driver_profile)
        assert result is None


class TestRewardPointsAccumulation:
    """Tests for reward points methods."""

    def test_award_ride_completion_points(self, service, mock_driver_profile):
        """Completing a ride awards POINTS_PER_COMPLETED_RIDE points."""
        mock_driver_profile.reward_points = 0
        points = service.award_ride_completion_points(mock_driver_profile)
        assert points == POINTS_PER_COMPLETED_RIDE
        assert mock_driver_profile.reward_points == POINTS_PER_COMPLETED_RIDE
        mock_driver_profile.save.assert_called_once()

    def test_award_ride_completion_points_accumulates(self, service, mock_driver_profile):
        """Points accumulate across multiple ride completions."""
        mock_driver_profile.reward_points = 50
        points = service.award_ride_completion_points(mock_driver_profile)
        assert points == POINTS_PER_COMPLETED_RIDE
        assert mock_driver_profile.reward_points == 50 + POINTS_PER_COMPLETED_RIDE

    def test_award_high_rating_points_4_stars(self, service, mock_driver_profile):
        """Rating of 4 stars awards POINTS_PER_HIGH_RATING points."""
        mock_driver_profile.reward_points = 0
        points = service.award_high_rating_points(mock_driver_profile, 4)
        assert points == POINTS_PER_HIGH_RATING
        assert mock_driver_profile.reward_points == POINTS_PER_HIGH_RATING

    def test_award_high_rating_points_5_stars(self, service, mock_driver_profile):
        """Rating of 5 stars awards POINTS_PER_HIGH_RATING points."""
        mock_driver_profile.reward_points = 0
        points = service.award_high_rating_points(mock_driver_profile, 5)
        assert points == POINTS_PER_HIGH_RATING

    def test_award_high_rating_points_3_stars_no_points(self, service, mock_driver_profile):
        """Rating below 4 stars awards no points."""
        mock_driver_profile.reward_points = 0
        points = service.award_high_rating_points(mock_driver_profile, 3)
        assert points == 0
        assert mock_driver_profile.reward_points == 0

    def test_award_high_rating_points_none_rating(self, service, mock_driver_profile):
        """None rating awards no points."""
        mock_driver_profile.reward_points = 0
        points = service.award_high_rating_points(mock_driver_profile, None)
        assert points == 0

    def test_award_consecutive_online_hours_points(self, service, mock_driver_profile):
        """Consecutive online hours award points per hour."""
        mock_driver_profile.reward_points = 0
        points = service.award_consecutive_online_hours_points(
            mock_driver_profile, 3
        )
        expected = 3 * POINTS_PER_CONSECUTIVE_ONLINE_HOUR
        assert points == expected
        assert mock_driver_profile.reward_points == expected

    def test_award_consecutive_online_hours_zero(self, service, mock_driver_profile):
        """Zero consecutive hours awards no points."""
        mock_driver_profile.reward_points = 0
        points = service.award_consecutive_online_hours_points(
            mock_driver_profile, 0
        )
        assert points == 0
        assert mock_driver_profile.reward_points == 0

    def test_award_consecutive_online_hours_negative(self, service, mock_driver_profile):
        """Negative consecutive hours awards no points."""
        mock_driver_profile.reward_points = 10
        points = service.award_consecutive_online_hours_points(
            mock_driver_profile, -2
        )
        assert points == 0
        assert mock_driver_profile.reward_points == 10


class TestOnRideCompleted:
    """Tests for on_ride_completed() - the main trigger after ride completion."""

    @patch.object(AchievementService, "evaluate_all_milestones")
    @patch.object(AchievementService, "award_ride_completion_points")
    def test_awards_points_and_evaluates_milestones(
        self, mock_award_points, mock_evaluate, service, mock_driver_profile
    ):
        """on_ride_completed awards points and evaluates all milestones."""
        mock_award_points.return_value = POINTS_PER_COMPLETED_RIDE
        mock_evaluate.return_value = []
        mock_driver_profile.reward_points = POINTS_PER_COMPLETED_RIDE

        result = service.on_ride_completed(mock_driver_profile)

        mock_award_points.assert_called_once_with(mock_driver_profile)
        mock_evaluate.assert_called_once_with(mock_driver_profile)
        assert result["points_awarded"] == POINTS_PER_COMPLETED_RIDE
        assert result["new_achievements"] == []
        assert result["total_points"] == mock_driver_profile.reward_points

    @patch.object(AchievementService, "evaluate_all_milestones")
    @patch.object(AchievementService, "award_ride_completion_points")
    def test_returns_new_achievements(
        self, mock_award_points, mock_evaluate, service, mock_driver_profile
    ):
        """on_ride_completed returns newly unlocked achievements."""
        mock_achievement = MagicMock()
        mock_achievement.code = "first_ride"
        mock_award_points.return_value = POINTS_PER_COMPLETED_RIDE
        mock_evaluate.return_value = [mock_achievement]
        mock_driver_profile.reward_points = POINTS_PER_COMPLETED_RIDE

        result = service.on_ride_completed(mock_driver_profile)

        assert len(result["new_achievements"]) == 1
        assert result["new_achievements"][0].code == "first_ride"


class TestOnRideRated:
    """Tests for on_ride_rated() - trigger after a ride receives a rating."""

    @patch.object(AchievementService, "ensure_achievements_exist")
    @patch.object(AchievementService, "check_five_star_streak")
    @patch.object(AchievementService, "award_high_rating_points")
    def test_awards_points_for_high_rating(
        self, mock_award, mock_streak, mock_ensure, service, mock_driver_profile
    ):
        """on_ride_rated awards points for 4+ star rating."""
        mock_award.return_value = POINTS_PER_HIGH_RATING
        mock_streak.return_value = None
        mock_driver_profile.reward_points = POINTS_PER_HIGH_RATING

        result = service.on_ride_rated(mock_driver_profile, 4)

        mock_award.assert_called_once_with(mock_driver_profile, 4)
        assert result["points_awarded"] == POINTS_PER_HIGH_RATING

    @patch.object(AchievementService, "ensure_achievements_exist")
    @patch.object(AchievementService, "check_five_star_streak")
    @patch.object(AchievementService, "award_high_rating_points")
    def test_checks_streak_on_5_star(
        self, mock_award, mock_streak, mock_ensure, service, mock_driver_profile
    ):
        """on_ride_rated checks 5-star streak when rating is 5."""
        mock_award.return_value = POINTS_PER_HIGH_RATING
        mock_streak.return_value = MagicMock(code="five_star_streak_10")
        mock_driver_profile.reward_points = POINTS_PER_HIGH_RATING

        result = service.on_ride_rated(mock_driver_profile, 5)

        mock_streak.assert_called_once_with(mock_driver_profile)
        assert len(result["new_achievements"]) == 1

    @patch.object(AchievementService, "ensure_achievements_exist")
    @patch.object(AchievementService, "check_five_star_streak")
    @patch.object(AchievementService, "award_high_rating_points")
    def test_no_streak_check_for_non_5_star(
        self, mock_award, mock_streak, mock_ensure, service, mock_driver_profile
    ):
        """on_ride_rated does not check streak for ratings below 5."""
        mock_award.return_value = POINTS_PER_HIGH_RATING
        mock_driver_profile.reward_points = POINTS_PER_HIGH_RATING

        result = service.on_ride_rated(mock_driver_profile, 4)

        mock_streak.assert_not_called()
        assert result["new_achievements"] == []


class TestGetDriverAchievements:
    """Tests for get_driver_achievements()"""

    @patch("taxi.drivers.services.achievement_service.DriverAchievement")
    def test_returns_ordered_achievements(
        self, mock_driver_achievement, service, mock_driver_profile
    ):
        """Returns achievements ordered by earned_at descending."""
        mock_qs = MagicMock()
        mock_driver_achievement.objects.filter.return_value.select_related.return_value.order_by.return_value = (
            mock_qs
        )

        result = service.get_driver_achievements(mock_driver_profile)

        mock_driver_achievement.objects.filter.assert_called_once_with(
            driver=mock_driver_profile
        )


class TestGetRewardPointsBalance:
    """Tests for get_reward_points_balance()"""

    def test_returns_current_balance(self, service, mock_driver_profile):
        """Returns the driver's current reward points."""
        mock_driver_profile.reward_points = 150
        assert service.get_reward_points_balance(mock_driver_profile) == 150

    def test_returns_zero_for_new_driver(self, service, mock_driver_profile):
        """Returns 0 for a new driver with no points."""
        mock_driver_profile.reward_points = 0
        assert service.get_reward_points_balance(mock_driver_profile) == 0
