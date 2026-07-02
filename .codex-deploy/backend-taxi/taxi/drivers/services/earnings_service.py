"""
Earnings Service

Calculates, aggregates, and presents driver earnings across daily, weekly,
monthly, and lifetime periods. Provides chart data and bonus breakdowns.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
"""

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum, Q
from django.utils import timezone

from taxi.rides.models import Ride


class EarningsService:
    """
    Service responsible for calculating driver earnings across time periods,
    generating chart data for visualizations, and breaking down bonus/incentive
    earnings.
    """

    CURRENCY = "MRU"

    def _format_mru(self, value):
        """
        Format a numeric value as MRU with exactly 2 decimal places.

        Args:
            value: Decimal, float, int, or None

        Returns:
            str: Formatted value with 2 decimal places (e.g., "1234.56")
        """
        if value is None:
            value = Decimal("0")
        if not isinstance(value, Decimal):
            value = Decimal(str(value))
        return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    def _get_driver_timezone_now(self, driver_profile):
        """
        Get the current time in the driver's local timezone.
        Uses the project timezone (Africa/Nouakchott) as default.
        """
        return timezone.localtime(timezone.now())

    def _get_period_boundaries(self, driver_profile, period):
        """
        Calculate the start and end datetime boundaries for a given period,
        based on the driver's local timezone.

        Args:
            driver_profile: DriverProfile instance
            period: str - one of 'today', 'week', 'month', 'lifetime'

        Returns:
            tuple: (start_datetime, end_datetime) in UTC, or (None, None) for lifetime
        """
        now = self._get_driver_timezone_now(driver_profile)

        if period == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
        elif period == "week":
            # Start of the current week (Monday)
            days_since_monday = now.weekday()
            start = (now - timedelta(days=days_since_monday)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            end = start + timedelta(days=7)
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            # End of month: go to next month
            if now.month == 12:
                end = now.replace(
                    year=now.year + 1, month=1, day=1,
                    hour=0, minute=0, second=0, microsecond=0
                )
            else:
                end = now.replace(
                    month=now.month + 1, day=1,
                    hour=0, minute=0, second=0, microsecond=0
                )
        elif period == "year":
            start = now.replace(
                month=1, day=1, hour=0, minute=0, second=0, microsecond=0
            )
            end = start.replace(year=start.year + 1)
        elif period == "lifetime":
            return None, None
        else:
            raise ValueError(
                f"Invalid period: {period}. Must be one of: today, week, month, year, lifetime"
            )

        return start, end

    def _get_completed_rides_queryset(self, driver_profile, start=None, end=None):
        """
        Get a queryset of completed rides for the driver within the given time range.

        Args:
            driver_profile: DriverProfile instance
            start: datetime or None (no lower bound if None)
            end: datetime or None (no upper bound if None)

        Returns:
            QuerySet of Ride objects
        """
        qs = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
        )

        if start is not None:
            qs = qs.filter(completed_at__gte=start)
        if end is not None:
            qs = qs.filter(completed_at__lt=end)

        return qs

    def get_period_earnings(self, driver_profile, period):
        """
        Get earnings for a specific time period.

        Args:
            driver_profile: DriverProfile instance
            period: str - one of 'today', 'week', 'month', 'lifetime'

        Returns:
            dict with:
            - period: str
            - total_earnings: str (MRU formatted, 2 decimal places)
            - ride_count: int
            - currency: str ("MRU")
        """
        start, end = self._get_period_boundaries(driver_profile, period)
        rides = self._get_completed_rides_queryset(driver_profile, start, end)

        aggregation = rides.aggregate(
            total_earnings=Sum("driver_earning")
        )

        total = aggregation["total_earnings"] or Decimal("0")

        return {
            "period": period,
            "total_earnings": self._format_mru(total),
            "ride_count": rides.count(),
            "currency": self.CURRENCY,
        }

    def get_all_period_earnings(self, driver_profile):
        """
        Get earnings for all time periods (today, week, month, lifetime).

        Args:
            driver_profile: DriverProfile instance

        Returns:
            dict with keys: today, week, month, lifetime
            Each value is a dict from get_period_earnings()
        """
        periods = ["today", "week", "month", "year", "lifetime"]
        return {
            period: self.get_period_earnings(driver_profile, period)
            for period in periods
        }

    def get_chart_data(self, driver_profile, period):
        """
        Get chart data for earnings visualization.

        Args:
            driver_profile: DriverProfile instance
            period: str - one of 'daily', 'weekly', 'monthly'
                - daily: 7 bars for current week (Mon-Sun)
                - weekly: bars for each week of the current month
                - monthly: 12 bars for current year (Jan-Dec)

        Returns:
            list of dicts, each with:
            - label: str (day name, week label, or month name)
            - value: str (MRU formatted, 2 decimal places)
            - ride_count: int
        """
        now = self._get_driver_timezone_now(driver_profile)

        if period == "daily":
            return self._get_daily_chart_data(driver_profile, now)
        elif period == "weekly":
            return self._get_weekly_chart_data(driver_profile, now)
        elif period == "monthly":
            return self._get_monthly_chart_data(driver_profile, now)
        else:
            raise ValueError(
                f"Invalid chart period: {period}. Must be one of: daily, weekly, monthly"
            )

    def _get_daily_chart_data(self, driver_profile, now):
        """
        Generate 7 bars for the current week (Monday to Sunday).
        Each bar shows the total earnings for that day.
        """
        # Find Monday of the current week
        days_since_monday = now.weekday()
        monday = (now - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        chart_data = []

        for i in range(7):
            day_start = monday + timedelta(days=i)
            day_end = day_start + timedelta(days=1)

            rides = self._get_completed_rides_queryset(
                driver_profile, day_start, day_end
            )
            aggregation = rides.aggregate(total=Sum("driver_earning"))
            total = aggregation["total"] or Decimal("0")

            chart_data.append({
                "label": day_names[i],
                "value": self._format_mru(total),
                "ride_count": rides.count(),
            })

        return chart_data

    def _get_weekly_chart_data(self, driver_profile, now):
        """
        Generate bars for each week of the current month.
        Weeks start on Monday. A partial week at the start/end of the month
        is still counted as a bar.
        """
        # Start of the current month
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # End of the current month
        if now.month == 12:
            month_end = now.replace(
                year=now.year + 1, month=1, day=1,
                hour=0, minute=0, second=0, microsecond=0
            )
        else:
            month_end = now.replace(
                month=now.month + 1, day=1,
                hour=0, minute=0, second=0, microsecond=0
            )

        chart_data = []
        week_num = 1

        # Find the first Monday on or before the month start
        # We want weeks aligned to Monday
        current = month_start
        while current < month_end:
            # Week ends at the next Monday or end of month, whichever comes first
            days_until_next_monday = (7 - current.weekday()) % 7
            if days_until_next_monday == 0:
                days_until_next_monday = 7
            week_end = min(current + timedelta(days=days_until_next_monday), month_end)

            rides = self._get_completed_rides_queryset(
                driver_profile, current, week_end
            )
            aggregation = rides.aggregate(total=Sum("driver_earning"))
            total = aggregation["total"] or Decimal("0")

            chart_data.append({
                "label": f"Week {week_num}",
                "value": self._format_mru(total),
                "ride_count": rides.count(),
            })

            current = week_end
            week_num += 1

        return chart_data

    def _get_monthly_chart_data(self, driver_profile, now):
        """
        Generate 12 bars for the current year (January to December).
        Each bar shows the total earnings for that month.
        """
        year = now.year
        month_names = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        chart_data = []

        for month_idx in range(12):
            month = month_idx + 1
            month_start = now.replace(
                month=month, day=1,
                hour=0, minute=0, second=0, microsecond=0
            )

            if month == 12:
                month_end = now.replace(
                    year=year + 1, month=1, day=1,
                    hour=0, minute=0, second=0, microsecond=0
                )
            else:
                month_end = now.replace(
                    month=month + 1, day=1,
                    hour=0, minute=0, second=0, microsecond=0
                )

            rides = self._get_completed_rides_queryset(
                driver_profile, month_start, month_end
            )
            aggregation = rides.aggregate(total=Sum("driver_earning"))
            total = aggregation["total"] or Decimal("0")

            chart_data.append({
                "label": month_names[month_idx],
                "value": self._format_mru(total),
                "ride_count": rides.count(),
            })

        return chart_data

    def get_bonus_breakdown(self, driver_profile, period):
        """
        Get bonus, incentive, and referral earnings breakdown for a period.

        Since the current Ride model doesn't have separate bonus/incentive/referral
        fields, we derive these from available data:
        - Bonus earnings: rides where driver_earning exceeds the base fare calculation
          (approximated as rides with higher-than-average earnings for the period)
        - Incentive earnings: placeholder for future incentive tracking
        - Referral earnings: rides that have a referral_code applied

        For now, we provide the structure with referral earnings calculated from
        rides with referral codes, and bonus/incentive as zero until dedicated
        tracking models are added.

        Args:
            driver_profile: DriverProfile instance
            period: str - one of 'today', 'week', 'month', 'lifetime'

        Returns:
            dict with:
            - bonus_earnings: str (MRU formatted)
            - incentive_earnings: str (MRU formatted)
            - referral_earnings: str (MRU formatted)
            - total_bonus: str (MRU formatted, sum of all three)
            - currency: str ("MRU")
        """
        start, end = self._get_period_boundaries(driver_profile, period)
        rides = self._get_completed_rides_queryset(driver_profile, start, end)

        # Referral earnings: sum of driver_earning for rides with a referral code
        referral_rides = rides.filter(
            referral_code__isnull=False,
        ).exclude(referral_code="")

        referral_aggregation = referral_rides.aggregate(
            total=Sum("driver_earning")
        )
        referral_earnings = referral_aggregation["total"] or Decimal("0")

        # Bonus and incentive earnings are placeholders until dedicated models exist
        bonus_earnings = Decimal("0")
        incentive_earnings = Decimal("0")

        total_bonus = bonus_earnings + incentive_earnings + referral_earnings

        return {
            "bonus_earnings": self._format_mru(bonus_earnings),
            "incentive_earnings": self._format_mru(incentive_earnings),
            "referral_earnings": self._format_mru(referral_earnings),
            "total_bonus": self._format_mru(total_bonus),
            "currency": self.CURRENCY,
        }

    def update_earnings_on_completion(self, ride):
        """
        Called when a ride is completed to ensure earnings are up-to-date.
        Since earnings are calculated dynamically from completed rides,
        this method can be used for any post-completion processing
        (e.g., cache invalidation, notification triggers).

        Args:
            ride: Ride instance that was just completed

        Returns:
            dict with updated period earnings for the driver
        """
        if ride.driver is None:
            return None

        try:
            driver_profile = ride.driver.driver_profile
        except AttributeError:
            return None

        # Return current earnings for all periods (freshly calculated)
        return self.get_all_period_earnings(driver_profile)
