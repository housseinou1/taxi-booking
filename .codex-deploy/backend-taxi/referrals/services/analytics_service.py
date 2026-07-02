from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from django.utils import timezone

from referrals.models import (
    DriverBonus,
    DriverReferral,
    RideCredit,
    RiderReferral,
)


class AnalyticsService:
    """Service for calculating referral program analytics.

    Provides methods to compute signups, credits/bonuses issued,
    conversion rates, top referrers, and activity trends within
    a configurable date range (default: last 30 days).
    """

    DEFAULT_RANGE_DAYS = 30

    def get_date_range(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[date, date]:
        """Resolve start/end dates, defaulting to last 30 days."""
        if end_date is None:
            end_date = timezone.now().date()
        if start_date is None:
            start_date = end_date - timedelta(days=self.DEFAULT_RANGE_DAYS)
        return start_date, end_date

    def get_rider_signups(self, start_date: date, end_date: date) -> int:
        """Count rider referral signups within the date range."""
        return RiderReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        ).count()

    def get_driver_signups(self, start_date: date, end_date: date) -> int:
        """Count driver referral signups within the date range."""
        return DriverReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        ).count()

    def get_total_credits_issued(
        self, start_date: date, end_date: date
    ) -> Decimal:
        """Sum of all ride credits issued within the date range."""
        result = RideCredit.objects.filter(
            issued_at__date__gte=start_date,
            issued_at__date__lte=end_date,
        ).aggregate(total=Sum("original_amount"))
        return result["total"] or Decimal("0.00")

    def get_total_bonuses_issued(
        self, start_date: date, end_date: date
    ) -> Decimal:
        """Sum of all driver bonuses issued within the date range."""
        result = DriverBonus.objects.filter(
            issued_at__date__gte=start_date,
            issued_at__date__lte=end_date,
        ).aggregate(total=Sum("amount"))
        return result["total"] or Decimal("0.00")

    def get_conversion_rate(self, start_date: date, end_date: date) -> float:
        """Calculate conversion rate to one decimal place.

        Conversion rate = (completed referrals / total signups) * 100
        Returns 0.0 when there are no signups.
        """
        rider_total = RiderReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        ).count()
        driver_total = DriverReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        ).count()
        total_signups = rider_total + driver_total

        if total_signups == 0:
            return 0.0

        rider_completed = RiderReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            status="completed",
        ).count()
        driver_completed = DriverReferral.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            status="completed",
        ).count()
        total_completed = rider_completed + driver_completed

        return round(total_completed / total_signups * 100, 1)

    def get_top_referrers(
        self, start_date: date, end_date: date, limit: int = 10
    ) -> list[dict]:
        """Rank top referrers by successful referrals (completed status).

        Returns at most `limit` entries sorted descending by count.
        Combines both rider and driver referrers.
        """
        # Top rider referrers
        rider_top = (
            RiderReferral.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                status="completed",
            )
            .values("referral_code__rider__email")
            .annotate(successful_referrals=Count("id"))
            .order_by("-successful_referrals")
        )

        # Top driver referrers
        driver_top = (
            DriverReferral.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                status="completed",
            )
            .values("referral_code__driver__email")
            .annotate(successful_referrals=Count("id"))
            .order_by("-successful_referrals")
        )

        # Merge and sort
        combined = {}
        for entry in rider_top:
            email = entry["referral_code__rider__email"]
            combined[email] = combined.get(email, 0) + entry[
                "successful_referrals"
            ]
        for entry in driver_top:
            email = entry["referral_code__driver__email"]
            combined[email] = combined.get(email, 0) + entry[
                "successful_referrals"
            ]

        sorted_referrers = sorted(
            combined.items(), key=lambda x: x[1], reverse=True
        )[:limit]

        return [
            {"email": email, "successful_referrals": count}
            for email, count in sorted_referrers
        ]

    def get_trends(
        self, start_date: date, end_date: date
    ) -> dict[str, list[dict]]:
        """Aggregate referral activity trends (daily, weekly, monthly).

        Returns counts of new signups and completed first rides per period.
        """
        return {
            "daily": self._aggregate_trends(
                start_date, end_date, TruncDay
            ),
            "weekly": self._aggregate_trends(
                start_date, end_date, TruncWeek
            ),
            "monthly": self._aggregate_trends(
                start_date, end_date, TruncMonth
            ),
        }

    def _aggregate_trends(
        self, start_date: date, end_date: date, trunc_func
    ) -> list[dict]:
        """Helper to aggregate signups and completions by time period."""
        # Rider signups by period
        rider_signups = (
            RiderReferral.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
            )
            .annotate(period=trunc_func("created_at"))
            .values("period")
            .annotate(
                signups=Count("id"),
                completions=Count(
                    "id", filter=Q(status="completed")
                ),
            )
            .order_by("period")
        )

        # Driver signups by period
        driver_signups = (
            DriverReferral.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
            )
            .annotate(period=trunc_func("created_at"))
            .values("period")
            .annotate(
                signups=Count("id"),
                completions=Count(
                    "id", filter=Q(status="completed")
                ),
            )
            .order_by("period")
        )

        # Merge periods
        periods: dict[str, dict] = {}
        for entry in rider_signups:
            key = entry["period"].date().isoformat()
            if key not in periods:
                periods[key] = {"period": key, "signups": 0, "completions": 0}
            periods[key]["signups"] += entry["signups"]
            periods[key]["completions"] += entry["completions"]

        for entry in driver_signups:
            key = entry["period"].date().isoformat()
            if key not in periods:
                periods[key] = {"period": key, "signups": 0, "completions": 0}
            periods[key]["signups"] += entry["signups"]
            periods[key]["completions"] += entry["completions"]

        return sorted(periods.values(), key=lambda x: x["period"])

    def get_analytics(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict:
        """Get all analytics data for the given date range.

        This is the main entry point that assembles all metrics.
        Returns zero values with an appropriate message when no data exists.
        """
        start, end = self.get_date_range(start_date, end_date)

        rider_signups = self.get_rider_signups(start, end)
        driver_signups = self.get_driver_signups(start, end)
        total_credits = self.get_total_credits_issued(start, end)
        total_bonuses = self.get_total_bonuses_issued(start, end)
        conversion_rate = self.get_conversion_rate(start, end)
        top_referrers = self.get_top_referrers(start, end)
        trends = self.get_trends(start, end)

        result = {
            "total_rider_referral_signups": rider_signups,
            "total_driver_referral_signups": driver_signups,
            "total_credits_issued": str(total_credits),
            "total_bonuses_issued": str(total_bonuses),
            "conversion_rate": conversion_rate,
            "top_referrers": top_referrers,
            "trends": trends,
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
        }

        # Add message when no data exists
        has_data = (
            rider_signups > 0
            or driver_signups > 0
            or total_credits > 0
            or total_bonuses > 0
        )
        if not has_data:
            result["message"] = (
                "No referral activity exists for the selected period."
            )

        return result
