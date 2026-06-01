"""
Earnings API Views

Provides endpoints for driver earnings data:
- GET /drivers/me/earnings/ - All period earnings with bonus breakdown
- GET /drivers/me/earnings/chart/?period=daily|weekly|monthly - Chart data

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .services.earnings_service import EarningsService


class DriverEarningsView(APIView):
    """
    GET /drivers/me/earnings/

    Returns earnings for all time periods (today, week, month, lifetime)
    plus bonus, incentive, and referral breakdowns for each period.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            driver_profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        earnings_service = EarningsService()

        # Get all period earnings
        period_earnings = earnings_service.get_all_period_earnings(driver_profile)

        # Get bonus breakdown for each period
        bonus_breakdowns = {}
        for period in ["today", "week", "month", "lifetime"]:
            bonus_breakdowns[period] = earnings_service.get_bonus_breakdown(
                driver_profile, period
            )

        return Response(
            {
                "earnings": period_earnings,
                "bonus_breakdowns": bonus_breakdowns,
                "currency": EarningsService.CURRENCY,
            },
            status=status.HTTP_200_OK,
        )


class DriverEarningsChartView(APIView):
    """
    GET /drivers/me/earnings/chart/?period=daily|weekly|monthly

    Returns chart data for earnings visualization.
    - daily: 7 bars for current week (Mon-Sun)
    - weekly: bars for each week of the current month
    - monthly: 12 bars for current year (Jan-Dec)
    """

    permission_classes = [IsAuthenticated]

    VALID_PERIODS = ["daily", "weekly", "monthly"]

    def get(self, request):
        try:
            driver_profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        period = request.query_params.get("period", "").lower()

        if period not in self.VALID_PERIODS:
            return Response(
                {
                    "error": f"Invalid period '{period}'. Must be one of: {', '.join(self.VALID_PERIODS)}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        earnings_service = EarningsService()
        chart_data = earnings_service.get_chart_data(driver_profile, period)

        return Response(
            {
                "period": period,
                "chart_data": chart_data,
                "currency": EarningsService.CURRENCY,
            },
            status=status.HTTP_200_OK,
        )
