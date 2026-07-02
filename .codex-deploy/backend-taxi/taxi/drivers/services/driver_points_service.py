"""
Driver category points derived from lifetime MRU earnings.

Rule: every 10 MRU earned = 3 points.

Category thresholds (points):
- Bronze: 0 – 2,999 (progress shown toward Gold at 3,000)
- Gold: 3,000+
- Platinum: 4,000+
- Elite: 5,000+
"""

from decimal import Decimal

from django.db.models import Sum

from taxi.rides.models import Ride

POINTS_PER_10_MRU = 3

LEVEL_ORDER = ["bronze", "gold", "platinum", "elite"]

LEVEL_POINT_THRESHOLDS = {
    "bronze": 0,
    "gold": 3000,
    "platinum": 4000,
    "elite": 5000,
}

NEXT_LEVEL = {
    "bronze": "gold",
    "gold": "platinum",
    "platinum": "elite",
    "elite": None,
}

NEXT_LEVEL_POINTS = {
    "bronze": 3000,
    "gold": 4000,
    "platinum": 5000,
    "elite": None,
}


class DriverPointsService:
    """Points-based driver category (Bronze / Gold / Platinum / Elite)."""

    def get_lifetime_earnings(self, driver_profile):
        total = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
        ).aggregate(total=Sum("driver_earning"))["total"]
        return total or Decimal("0")

    def calculate_points_from_earnings(self, earnings_mru):
        earnings = Decimal(str(earnings_mru or 0))
        if earnings <= 0:
            return 0
        return int((earnings // Decimal("10")) * POINTS_PER_10_MRU)

    def get_driver_points(self, driver_profile):
        return self.calculate_points_from_earnings(
            self.get_lifetime_earnings(driver_profile)
        )

    def get_level_from_points(self, points):
        points = int(points or 0)
        if points >= LEVEL_POINT_THRESHOLDS["elite"]:
            return "elite"
        if points >= LEVEL_POINT_THRESHOLDS["platinum"]:
            return "platinum"
        if points >= LEVEL_POINT_THRESHOLDS["gold"]:
            return "gold"
        return "bronze"

    def get_progress(self, driver_profile):
        points = self.get_driver_points(driver_profile)
        current_level = self.get_level_from_points(points)
        next_level = NEXT_LEVEL[current_level]
        next_level_points = NEXT_LEVEL_POINTS[current_level]

        if next_level_points is None:
            progress_percentage = 100.0
        else:
            floor = LEVEL_POINT_THRESHOLDS[current_level]
            span = max(next_level_points - floor, 1)
            progress_percentage = min(
                100.0,
                round(((points - floor) / span) * 100, 1),
            )

        return {
            "points": points,
            "current_level": current_level,
            "next_level": next_level,
            "next_level_points": next_level_points if next_level_points else points,
            "progress_percentage": progress_percentage,
            "points_rule": "3 points per 10 MRU earned",
            "level_thresholds": LEVEL_POINT_THRESHOLDS,
        }

    def sync_driver_level(self, driver_profile):
        """Persist driver_level from lifetime earnings points."""
        level = self.get_level_from_points(self.get_driver_points(driver_profile))
        if driver_profile.driver_level != level:
            driver_profile.driver_level = level
            driver_profile.save(update_fields=["driver_level"])
        return level
