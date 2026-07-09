"""
Achievement Service

Manages driver achievement milestone evaluation, reward points accumulation,
and achievement unlocking for the Premium Driver App.

Requirements: 14.1, 14.3, 14.4
"""

from datetime import timedelta

import logging

from django.db import IntegrityError
from django.utils import timezone

from taxi.drivers.models import Achievement, DriverAchievement, DriverProfile
from taxi.rides.models import Ride

logger = logging.getLogger(__name__)


# Milestone definitions: code → (name, description, icon, check function name)
MILESTONE_DEFINITIONS = {
    "first_ride": {
        "name": "First Ride",
        "description": "Completed your very first ride!",
        "icon": "trophy_first",
        "rides_threshold": 1,
    },
    "100_rides": {
        "name": "100 Trips",
        "description": "Completed 100 rides on the platform.",
        "icon": "trophy_100",
        "rides_threshold": 100,
    },
    "500_rides": {
        "name": "500 Trips",
        "description": "Completed 500 rides on the platform.",
        "icon": "trophy_500",
        "rides_threshold": 500,
    },
    "1000_rides": {
        "name": "1000 Trips",
        "description": "Completed 1,000 rides on the platform.",
        "icon": "trophy_1000",
        "rides_threshold": 1000,
    },
    "excellent_rating": {
        "name": "Excellent Rating",
        "description": "Maintained a 4.8+ average rating with 50+ trips.",
        "icon": "star_excellent",
        "rides_threshold": None,
    },
    "safe_driver": {
        "name": "Safe Driver",
        "description": "Zero unsafe-driving complaints with 100+ completed trips.",
        "icon": "shield_safe",
        "rides_threshold": None,
    },
    "top_driver": {
        "name": "Top Driver",
        "description": "Reached Diamond reward tier.",
        "icon": "crown_top",
        "rides_threshold": None,
    },
    "airport_specialist": {
        "name": "Airport Specialist",
        "description": "Completed 25 airport rides.",
        "icon": "plane_airport",
        "rides_threshold": None,
    },
    "weekend_champion": {
        "name": "Weekend Champion",
        "description": "Completed 50 weekend rides.",
        "icon": "weekend_star",
        "rides_threshold": None,
    },
    "five_star_streak_10": {
        "name": "Perfect 10",
        "description": "Received 5-star ratings on 10 consecutive rides.",
        "icon": "star_streak",
        "rides_threshold": None,
    },
    "zero_cancellations_30_days": {
        "name": "Reliability Champion",
        "description": "Zero cancellations for 30 consecutive days.",
        "icon": "shield_reliable",
        "rides_threshold": None,
    },
}

# Reward points are managed by RewardsService; kept for backward-compatible tests.
POINTS_PER_COMPLETED_RIDE = 10
POINTS_PER_HIGH_RATING = 5
POINTS_PER_CONSECUTIVE_ONLINE_HOUR = 3


class AchievementService:
    """
    Service responsible for evaluating achievement milestones,
    accumulating reward points, and triggering achievement checks
    after ride completion.
    """

    def ensure_achievements_exist(self):
        """
        Ensure all milestone Achievement records exist in the database.
        Creates them if they don't exist.
        """
        for code, definition in MILESTONE_DEFINITIONS.items():
            Achievement.objects.get_or_create(
                code=code,
                defaults={
                    "name": definition["name"],
                    "description": definition["description"],
                    "icon": definition["icon"],
                },
            )

    def check_ride_count_milestones(self, driver_profile):
        """
        Check if the driver has reached any ride count milestones
        (first ride, 100 rides, 500 rides).

        Args:
            driver_profile: DriverProfile instance

        Returns:
            List of newly awarded Achievement instances.
        """
        newly_awarded = []
        total_completed = driver_profile.total_rides_completed

        ride_milestones = [
            (code, defn)
            for code, defn in MILESTONE_DEFINITIONS.items()
            if defn["rides_threshold"] is not None
        ]

        for code, defn in ride_milestones:
            if total_completed >= defn["rides_threshold"]:
                achievement = self._award_achievement(driver_profile, code)
                if achievement is not None:
                    newly_awarded.append(achievement)

        return newly_awarded

    def check_five_star_streak(self, driver_profile):
        """
        Check if the driver has a 5-star rating streak of 10 consecutive rides.

        Looks at the most recent completed rides with ratings and checks
        if the last 10 all have a rating of 5.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            The newly awarded Achievement instance, or None.
        """
        # Already earned? Skip the query.
        if self._has_achievement(driver_profile, "five_star_streak_10"):
            return None

        # Get the last 10 rated completed rides for this driver
        recent_rides = (
            Ride.objects.filter(
                driver=driver_profile.user,
                status="completed",
                rating__isnull=False,
            )
            .order_by("-completed_at")[:10]
        )

        ratings = list(recent_rides.values_list("rating", flat=True))

        # Need at least 10 rated rides
        if len(ratings) < 10:
            return None

        # All 10 must be 5-star
        if all(r == 5 for r in ratings):
            return self._award_achievement(driver_profile, "five_star_streak_10")

        return None

    def check_zero_cancellations_30_days(self, driver_profile):
        """
        Check if the driver has zero cancellations for the last 30 days.

        The driver must have at least one completed ride in the period
        and zero driver-initiated cancellations.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            The newly awarded Achievement instance, or None.
        """
        # Already earned? Skip the query.
        if self._has_achievement(driver_profile, "zero_cancellations_30_days"):
            return None

        thirty_days_ago = timezone.now() - timedelta(days=30)

        # Check for any cancellations in the last 30 days
        cancellations = Ride.objects.filter(
            driver=driver_profile.user,
            status="cancelled",
            created_at__gte=thirty_days_ago,
        ).count()

        if cancellations > 0:
            return None

        # Must have at least one completed ride in the period
        completed_in_period = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
            completed_at__gte=thirty_days_ago,
        ).count()

        if completed_in_period == 0:
            return None

        return self._award_achievement(
            driver_profile, "zero_cancellations_30_days"
        )

    def check_excellent_rating(self, driver_profile):
        if self._has_achievement(driver_profile, "excellent_rating"):
            return None
        if (driver_profile.total_rides_completed or 0) < 50:
            return None
        if float(driver_profile.average_rating or 0) >= 4.8:
            return self._award_achievement(driver_profile, "excellent_rating")
        return None

    def check_top_driver_tier(self, driver_profile):
        if self._has_achievement(driver_profile, "top_driver"):
            return None
        if driver_profile.reward_tier == "diamond":
            return self._award_achievement(driver_profile, "top_driver")
        return None

    def check_airport_specialist(self, driver_profile):
        if self._has_achievement(driver_profile, "airport_specialist"):
            return None
        from taxi.drivers.services.rewards_service import AIRPORT_KEYWORDS

        airport_count = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
        ).extra(
            where=["(LOWER(pickup) LIKE %s OR LOWER(destination) LIKE %s)"],
            params=[f"%{AIRPORT_KEYWORDS[0]}%", f"%{AIRPORT_KEYWORDS[0]}%"],
        ).count()
        if airport_count >= 25:
            return self._award_achievement(driver_profile, "airport_specialist")
        return None

    def check_weekend_champion(self, driver_profile):
        if self._has_achievement(driver_profile, "weekend_champion"):
            return None
        completed = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
            completed_at__isnull=False,
        )
        weekend_count = sum(
            1
            for r in completed.only("completed_at")[:200]
            if timezone.localtime(r.completed_at).weekday() >= 5
        )
        if weekend_count >= 50:
            return self._award_achievement(driver_profile, "weekend_champion")
        return None

    def evaluate_all_milestones(self, driver_profile):
        """
        Evaluate all achievement milestones for a driver.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            List of newly awarded Achievement instances.
        """
        self.ensure_achievements_exist()

        newly_awarded = []

        # Ride count milestones
        newly_awarded.extend(self.check_ride_count_milestones(driver_profile))

        # 5-star streak
        streak_achievement = self.check_five_star_streak(driver_profile)
        if streak_achievement is not None:
            newly_awarded.append(streak_achievement)

        # Zero cancellations for 30 days
        cancel_achievement = self.check_zero_cancellations_30_days(
            driver_profile
        )
        if cancel_achievement is not None:
            newly_awarded.append(cancel_achievement)

        for checker in (
            self.check_excellent_rating,
            self.check_top_driver_tier,
            self.check_airport_specialist,
            self.check_weekend_champion,
        ):
            badge = checker(driver_profile)
            if badge is not None:
                newly_awarded.append(badge)

        return newly_awarded

    def award_ride_completion_points(self, driver_profile):
        """
        Award reward points for completing a ride.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            Number of points awarded.
        """
        driver_profile.reward_points += POINTS_PER_COMPLETED_RIDE
        driver_profile.save(update_fields=["reward_points"])
        return POINTS_PER_COMPLETED_RIDE

    def award_high_rating_points(self, driver_profile, rating):
        """
        Award reward points for receiving a rating of 4 stars or above.

        Args:
            driver_profile: DriverProfile instance
            rating: The rating value (integer 1-5)

        Returns:
            Number of points awarded (0 if rating < 4).
        """
        if rating is not None and rating >= 4:
            driver_profile.reward_points += POINTS_PER_HIGH_RATING
            driver_profile.save(update_fields=["reward_points"])
            return POINTS_PER_HIGH_RATING
        return 0

    def award_consecutive_online_hours_points(
        self, driver_profile, consecutive_hours
    ):
        """
        Award reward points for consecutive online hours.

        Points are awarded per full hour of consecutive online time.

        Args:
            driver_profile: DriverProfile instance
            consecutive_hours: Number of consecutive hours online (integer)

        Returns:
            Number of points awarded.
        """
        if consecutive_hours <= 0:
            return 0

        points = consecutive_hours * POINTS_PER_CONSECUTIVE_ONLINE_HOUR
        driver_profile.reward_points += points
        driver_profile.save(update_fields=["reward_points"])
        return points

    def on_ride_completed(self, driver_profile):
        """
        Evaluate achievement milestones after ride completion.
        Point awards are handled by RewardsService.
        """
        driver_profile.refresh_from_db()
        new_achievements = self.evaluate_all_milestones(driver_profile)
        self._notify_achievements(driver_profile, new_achievements)
        return {
            "points_awarded": 0,
            "new_achievements": new_achievements,
            "total_points": driver_profile.reward_points,
        }

    def on_ride_rated(self, driver_profile, rating):
        """
        Evaluate rating-based achievements. Five-star points via RewardsService.
        """
        self.ensure_achievements_exist()
        new_achievements = []

        if rating == 5:
            streak_achievement = self.check_five_star_streak(driver_profile)
            if streak_achievement is not None:
                new_achievements.append(streak_achievement)

        excellent = self.check_excellent_rating(driver_profile)
        if excellent is not None:
            new_achievements.append(excellent)

        self._notify_achievements(driver_profile, new_achievements)
        return {
            "points_awarded": 0,
            "new_achievements": new_achievements,
            "total_points": driver_profile.reward_points,
        }

    def get_driver_achievements(self, driver_profile):
        """
        Get all achievements earned by a driver.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            QuerySet of DriverAchievement instances with related Achievement.
        """
        return (
            DriverAchievement.objects.filter(driver=driver_profile)
            .select_related("achievement")
            .order_by("-earned_at")
        )

    def get_reward_points_balance(self, driver_profile):
        """
        Get the driver's current reward points balance.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            Integer reward points balance.
        """
        return driver_profile.reward_points

    # --- Private helper methods ---

    def _has_achievement(self, driver_profile, achievement_code):
        """Check if a driver already has a specific achievement."""
        return DriverAchievement.objects.filter(
            driver=driver_profile,
            achievement__code=achievement_code,
        ).exists()

    def _notify_achievements(self, driver_profile, achievements):
        if not achievements:
            return
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            from notifications.push import send_push_to_user
            from taxi.rides.consumers import send_achievement_unlocked

            channel_layer = get_channel_layer()
            for achievement in achievements:
                send_push_to_user(
                    driver_profile.user,
                    "Achievement unlocked!",
                    achievement.name,
                    data={"type": "achievement_unlocked", "code": achievement.code},
                )
                if channel_layer:
                    async_to_sync(send_achievement_unlocked)(
                        channel_layer,
                        driver_profile.user_id,
                        achievement.id,
                        achievement.name,
                        achievement.icon,
                    )
        except Exception:
            logger.exception(
                "Failed to notify achievements for driver=%s", driver_profile.user_id
            )

    def _award_achievement(self, driver_profile, achievement_code):
        """
        Award an achievement to a driver if not already earned.

        Args:
            driver_profile: DriverProfile instance
            achievement_code: The achievement code string

        Returns:
            The Achievement instance if newly awarded, None if already earned.
        """
        try:
            achievement = Achievement.objects.get(code=achievement_code)
        except Achievement.DoesNotExist:
            return None

        try:
            DriverAchievement.objects.create(
                driver=driver_profile,
                achievement=achievement,
            )
            return achievement
        except IntegrityError:
            # Already earned (unique_together constraint)
            return None
