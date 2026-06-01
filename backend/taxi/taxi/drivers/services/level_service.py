"""
Driver Level Service

Manages driver level evaluation, progression tracking, demotion logic,
and level-based benefits for the Premium Driver App.

Requirements: 6.1, 6.4, 6.5, 6.6, 6.8
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone


class DriverLevelService:
    """
    Service responsible for evaluating driver levels, tracking progress,
    handling demotions, and providing level-based benefits.
    """

    LEVELS = ["bronze", "silver", "gold", "platinum", "elite"]

    THRESHOLDS = {
        "silver": {
            "rides": 50,
            "rating": Decimal("4.5"),
            "acceptance": 70,
            "completion": 85,
        },
        "gold": {
            "rides": 200,
            "rating": Decimal("4.7"),
            "acceptance": 80,
            "completion": 90,
        },
        "platinum": {
            "rides": 350,
            "rating": Decimal("4.8"),
            "acceptance": 85,
            "completion": 93,
        },
        "elite": {
            "rides": 500,
            "rating": Decimal("4.9"),
            "acceptance": 90,
            "completion": 95,
        },
    }

    BENEFITS = {
        "bronze": {
            "priority_matching": False,
            "bonus_multiplier": 1.0,
            "premium_support": False,
            "exclusive_rewards": False,
            "description": "Starting level for all new drivers.",
        },
        "silver": {
            "priority_matching": False,
            "bonus_multiplier": 1.1,
            "premium_support": False,
            "exclusive_rewards": False,
            "description": "Improved visibility and small bonus multiplier.",
        },
        "gold": {
            "priority_matching": False,
            "bonus_multiplier": 1.2,
            "premium_support": False,
            "exclusive_rewards": False,
            "description": "Better bonus multiplier and recognition.",
        },
        "platinum": {
            "priority_matching": True,
            "bonus_multiplier": 1.5,
            "premium_support": False,
            "exclusive_rewards": False,
            "description": "Enhanced ride matching priority and bonus multipliers.",
        },
        "elite": {
            "priority_matching": True,
            "bonus_multiplier": 2.0,
            "premium_support": True,
            "exclusive_rewards": True,
            "description": (
                "Highest priority ride matching, highest bonus multipliers, "
                "premium support access, and exclusive reward eligibility."
            ),
        },
    }

    # Demotion timing constants (in days)
    WARNING_DAYS = 7
    DEMOTION_DAYS = 14

    def _get_driver_metrics(self, driver_profile):
        """
        Extract the relevant metrics from a driver profile for level evaluation.
        Returns a dict with rides, rating, acceptance rate, and completion rate.
        """
        total_received = driver_profile.total_rides_received
        total_accepted = driver_profile.total_rides_accepted
        total_completed = driver_profile.total_rides_completed

        # Calculate acceptance rate
        if total_received > 0:
            acceptance_rate = (total_accepted / total_received) * 100
        else:
            acceptance_rate = 0

        # Calculate completion rate
        if total_accepted > 0:
            completion_rate = (total_completed / total_accepted) * 100
        else:
            completion_rate = 0

        return {
            "rides": total_completed,
            "rating": driver_profile.average_rating,
            "acceptance": acceptance_rate,
            "completion": completion_rate,
        }

    def _meets_threshold(self, metrics, level):
        """
        Check if the given metrics meet ALL thresholds for a specific level.
        """
        if level not in self.THRESHOLDS:
            return False

        threshold = self.THRESHOLDS[level]

        return (
            metrics["rides"] >= threshold["rides"]
            and Decimal(str(metrics["rating"])) >= threshold["rating"]
            and metrics["acceptance"] >= threshold["acceptance"]
            and metrics["completion"] >= threshold["completion"]
        )

    def evaluate_level(self, driver_profile):
        """
        Evaluate and assign the HIGHEST level whose ALL four thresholds are met.
        If none qualify beyond Bronze, stays Bronze.

        Returns the evaluated level string.
        """
        metrics = self._get_driver_metrics(driver_profile)

        # Check levels from highest to lowest (elite → platinum → gold → silver)
        # Return the highest qualifying level
        for level in reversed(self.LEVELS[1:]):  # elite, platinum, gold, silver
            if self._meets_threshold(metrics, level):
                return level

        return "bronze"

    def get_progress(self, driver_profile):
        """
        Returns progress percentage (0-100) toward the next level.
        Elite always returns 100.

        Returns a dict with:
        - current_level: str
        - next_level: str or None (None if Elite)
        - progress_percentage: float (0-100)
        - metrics: dict with current metric values
        - next_thresholds: dict with next level thresholds or None
        """
        current_level = driver_profile.driver_level
        metrics = self._get_driver_metrics(driver_profile)

        # Elite is the highest level - always 100%
        if current_level == "elite":
            return {
                "current_level": "elite",
                "next_level": None,
                "progress_percentage": 100,
                "metrics": metrics,
                "next_thresholds": None,
            }

        # Determine the next level
        current_index = self.LEVELS.index(current_level)
        next_level = self.LEVELS[current_index + 1]
        next_thresholds = self.THRESHOLDS[next_level]

        # Calculate progress for each metric as a percentage of the threshold
        rides_progress = min(
            (metrics["rides"] / next_thresholds["rides"]) * 100, 100
        ) if next_thresholds["rides"] > 0 else 100

        rating_progress = min(
            (float(metrics["rating"]) / float(next_thresholds["rating"])) * 100,
            100,
        ) if float(next_thresholds["rating"]) > 0 else 100

        acceptance_progress = min(
            (metrics["acceptance"] / next_thresholds["acceptance"]) * 100, 100
        ) if next_thresholds["acceptance"] > 0 else 100

        completion_progress = min(
            (metrics["completion"] / next_thresholds["completion"]) * 100, 100
        ) if next_thresholds["completion"] > 0 else 100

        # Overall progress is the average of all four metric progresses
        overall_progress = (
            rides_progress
            + rating_progress
            + acceptance_progress
            + completion_progress
        ) / 4

        # Clamp to 0-100
        overall_progress = max(0, min(100, overall_progress))

        return {
            "current_level": current_level,
            "next_level": next_level,
            "progress_percentage": round(overall_progress, 1),
            "metrics": metrics,
            "next_thresholds": {
                "rides": next_thresholds["rides"],
                "rating": float(next_thresholds["rating"]),
                "acceptance": next_thresholds["acceptance"],
                "completion": next_thresholds["completion"],
            },
        }

    def check_demotion(self, driver_profile):
        """
        Check if a driver should be warned or demoted based on their metrics
        falling below their current level's thresholds.

        Demotion logic:
        - If metrics below current level for 7 days → issue warning
        - If metrics below current level for 14 days → demote to next lower level

        Returns True if a demotion occurred, False otherwise.
        Also updates the driver_profile's demotion tracking fields.
        """
        current_level = driver_profile.driver_level

        # Bronze cannot be demoted
        if current_level == "bronze":
            # Reset tracking fields if they were set
            if driver_profile.below_threshold_since is not None:
                driver_profile.below_threshold_since = None
                driver_profile.demotion_warning_sent = False
                driver_profile.save(
                    update_fields=[
                        "below_threshold_since",
                        "demotion_warning_sent",
                    ]
                )
            return False

        metrics = self._get_driver_metrics(driver_profile)
        is_below_threshold = not self._meets_threshold(metrics, current_level)
        now = timezone.now()

        if not is_below_threshold:
            # Driver meets their current level thresholds - reset tracking
            if driver_profile.below_threshold_since is not None:
                driver_profile.below_threshold_since = None
                driver_profile.demotion_warning_sent = False
                driver_profile.save(
                    update_fields=[
                        "below_threshold_since",
                        "demotion_warning_sent",
                    ]
                )
            return False

        # Driver is below threshold
        if driver_profile.below_threshold_since is None:
            # Start tracking the below-threshold period
            driver_profile.below_threshold_since = now
            driver_profile.demotion_warning_sent = False
            driver_profile.save(
                update_fields=[
                    "below_threshold_since",
                    "demotion_warning_sent",
                ]
            )
            return False

        # Calculate days below threshold
        days_below = (now - driver_profile.below_threshold_since).days

        if days_below >= self.DEMOTION_DAYS:
            # Demote to next lower level
            current_index = self.LEVELS.index(current_level)
            new_level = self.LEVELS[current_index - 1]
            driver_profile.driver_level = new_level
            driver_profile.below_threshold_since = None
            driver_profile.demotion_warning_sent = False
            driver_profile.save(
                update_fields=[
                    "driver_level",
                    "below_threshold_since",
                    "demotion_warning_sent",
                ]
            )
            return True

        if days_below >= self.WARNING_DAYS and not driver_profile.demotion_warning_sent:
            # Issue warning
            driver_profile.demotion_warning_sent = True
            driver_profile.save(update_fields=["demotion_warning_sent"])
            return False

        return False

    def get_benefits(self, level):
        """
        Returns the benefits dict for a given level.

        Args:
            level: str - one of 'bronze', 'silver', 'gold', 'platinum', 'elite'

        Returns:
            dict with benefit details for the level, or empty dict if invalid level.
        """
        if level not in self.BENEFITS:
            return {}

        return self.BENEFITS[level]
