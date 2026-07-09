"""
Driver Level and Profile API Views

Provides endpoints for driver level system and enhanced profile:
- GET /drivers/me/level/              - Current level, progress, benefits
- GET /drivers/me/level/requirements/ - All level thresholds and requirements
- GET /drivers/me/stats/              - Driver performance statistics
- GET /drivers/me/profile/            - Enhanced profile with level badge, stats summary

Requirements: 5.1, 5.2, 5.3, 6.2, 6.3, 6.7
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .driver_access import resolve_driver_profile
from .services.level_service import DriverLevelService
from .services.earnings_service import EarningsService


class DriverLevelView(APIView):
    """
    GET /drivers/me/level/

    Returns the driver's current level, progress toward next level,
    level badge info, and current level benefits.

    Requirements: 6.2, 6.3
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        driver_profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

        level_service = DriverLevelService()

        # Get progress data (includes current level, next level, progress %)
        progress = level_service.get_progress(driver_profile)

        # Get benefits for current level
        current_benefits = level_service.get_benefits(driver_profile.driver_level)

        # Demotion warning info
        demotion_warning = {
            "is_below_threshold": driver_profile.below_threshold_since is not None,
            "warning_sent": driver_profile.demotion_warning_sent,
            "below_threshold_since": driver_profile.below_threshold_since,
        }

        return Response(
            {
                "current_level": progress["current_level"],
                "next_level": progress["next_level"],
                "progress_percentage": progress["progress_percentage"],
                "metrics": progress["metrics"],
                "next_thresholds": progress["next_thresholds"],
                "benefits": current_benefits,
                "badge": {
                    "level": progress["current_level"],
                    "label": progress["current_level"].capitalize(),
                },
                "demotion_warning": demotion_warning,
            },
            status=status.HTTP_200_OK,
        )


class DriverLevelRequirementsView(APIView):
    """
    GET /drivers/me/level/requirements/

    Returns all level thresholds and benefits for each level
    (Bronze, Silver, Gold, Platinum, Elite).

    Requirements: 6.7
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        level_service = DriverLevelService()

        levels = []
        for level in level_service.LEVELS:
            level_data = {
                "level": level,
                "label": level.capitalize(),
                "benefits": level_service.get_benefits(level),
            }

            # Add thresholds for levels above Bronze
            if level in level_service.THRESHOLDS:
                threshold = level_service.THRESHOLDS[level]
                level_data["requirements"] = {
                    "rides": threshold["rides"],
                    "rating": float(threshold["rating"]),
                    "acceptance_rate": threshold["acceptance"],
                    "completion_rate": threshold["completion"],
                }
            else:
                # Bronze has no requirements (starting level)
                level_data["requirements"] = None

            levels.append(level_data)

        return Response(
            {"levels": levels},
            status=status.HTTP_200_OK,
        )


class DriverStatsView(APIView):
    """
    GET /drivers/me/stats/

    Returns driver performance statistics including:
    - Total completed rides
    - Average rating
    - Acceptance rate
    - Completion rate
    - Cancellation rate
    - Total rides received, accepted, cancelled

    Requirements: 5.2, 5.4, 5.5, 5.6
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        driver_profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

        total_received = driver_profile.total_rides_received
        total_accepted = driver_profile.total_rides_accepted
        total_completed = driver_profile.total_rides_completed
        total_cancelled = driver_profile.total_rides_cancelled
        total_missed = driver_profile.total_rides_missed
        total_declined = driver_profile.total_rides_declined

        # Calculate rates
        acceptance_rate = driver_profile.acceptance_rate_points or 0
        completion_rate = (
            round((total_completed / total_accepted) * 100, 1)
            if total_accepted > 0
            else 0
        )
        cancellation_rate = (
            round((total_cancelled / total_accepted) * 100, 1)
            if total_accepted > 0
            else 0
        )

        # Years driving on the platform
        years_driving = 0
        if request.user.date_joined:
            from django.utils import timezone

            today = timezone.localdate()
            joined = request.user.date_joined.date()
            years_driving = today.year - joined.year
            if (today.month, today.day) < (joined.month, joined.day):
                years_driving -= 1
            years_driving = max(years_driving, 0)

        earnings_service = EarningsService()
        today_earnings = earnings_service.get_period_earnings(driver_profile, "today")
        week_earnings = earnings_service.get_period_earnings(driver_profile, "week")
        month_earnings = earnings_service.get_period_earnings(driver_profile, "month")

        no_show_count = driver_profile.total_rides_no_show or 0
        no_show_rate = (
            round((no_show_count / total_accepted) * 100, 1) if total_accepted > 0 else 0
        )

        from .services.ride_performance_service import get_driver_score_tier

        score_tier = get_driver_score_tier(driver_profile.performance_points)

        return Response(
            {
                "total_rides_completed": total_completed,
                "total_rides_accepted": total_accepted,
                "total_rides_received": total_received,
                "total_rides_cancelled": total_cancelled,
                "total_rides_missed": total_missed,
                "total_rides_declined": total_declined,
                "total_rides_no_show": no_show_count,
                "no_show_rate": no_show_rate,
                "performance_points": driver_profile.performance_points or 100,
                "driver_score": score_tier["score"],
                "driver_score_tier": score_tier["tier"],
                "driver_score_label": score_tier["label"],
                "driver_level": driver_profile.driver_level,
                "account_risk_flag": driver_profile.account_risk_flag,
                "account_under_review": driver_profile.account_under_review,
                "cancellation_warning": (
                    driver_profile.account_risk_reason
                    if driver_profile.account_risk_flag or driver_profile.account_under_review
                    else ""
                ),
                "average_rating": float(driver_profile.average_rating),
                "acceptance_rate": acceptance_rate,
                "completion_rate": completion_rate,
                "cancellation_rate": cancellation_rate,
                "years_driving": years_driving,
                "earnings": {
                    "today": today_earnings["total_earnings"],
                    "week": week_earnings["total_earnings"],
                    "month": month_earnings["total_earnings"],
                    "currency": EarningsService.CURRENCY,
                },
            },
            status=status.HTTP_200_OK,
        )


class DriverProfileView(APIView):
    """
    GET /drivers/me/profile/

    Returns enhanced driver profile with:
    - Personal info (photo, name, online status)
    - Vehicle details (make, model, color, plate)
    - Level badge and progress
    - Performance stats summary
    - Earnings summaries (lifetime, monthly, weekly) in MRU

    Requirements: 5.1, 5.2, 5.3, 6.2
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        driver_profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

        level_service = DriverLevelService()
        earnings_service = EarningsService()

        # Level info
        progress = level_service.get_progress(driver_profile)
        benefits = level_service.get_benefits(driver_profile.driver_level)

        # Stats
        total_received = driver_profile.total_rides_received
        total_accepted = driver_profile.total_rides_accepted
        total_completed = driver_profile.total_rides_completed
        total_cancelled = driver_profile.total_rides_cancelled

        acceptance_rate = (
            round((total_accepted / total_received) * 100, 1)
            if total_received > 0
            else 0
        )
        completion_rate = (
            round((total_completed / total_accepted) * 100, 1)
            if total_accepted > 0
            else 0
        )
        cancellation_rate = (
            round((total_cancelled / total_accepted) * 100, 1)
            if total_accepted > 0
            else 0
        )

        # Years driving
        years_driving = 0
        if request.user.date_joined:
            from django.utils import timezone

            today = timezone.localdate()
            joined = request.user.date_joined.date()
            years_driving = today.year - joined.year
            if (today.month, today.day) < (joined.month, joined.day):
                years_driving -= 1
            years_driving = max(years_driving, 0)

        # Earnings summaries
        period_earnings = earnings_service.get_all_period_earnings(driver_profile)

        # Build photo URL
        driver_photo_url = None
        if driver_profile.driver_photo:
            driver_photo_url = request.build_absolute_uri(
                driver_profile.driver_photo.url
            )

        driver_name = (
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.email
        )

        return Response(
            {
                "id": driver_profile.id,
                "user_id": request.user.id,
                "driver_name": driver_name,
                "email": request.user.email,
                "first_name": request.user.first_name,
                "last_name": request.user.last_name,
                "phone_number": driver_profile.phone_number,
                "driver_photo": driver_photo_url,
                "is_available": driver_profile.is_available,
                "status": driver_profile.status,
                # Vehicle details
                "vehicle": {
                    "make": driver_profile.vehicle_make,
                    "model": driver_profile.vehicle_model,
                    "color": driver_profile.vehicle_color,
                    "plate_number": (
                        driver_profile.vehicle_plate or driver_profile.plate_number
                    ),
                },
                # Level badge and progress
                "level": {
                    "current_level": progress["current_level"],
                    "label": progress["current_level"].capitalize(),
                    "next_level": progress["next_level"],
                    "progress_percentage": progress["progress_percentage"],
                    "benefits": benefits,
                },
                # Performance stats
                "stats": {
                    "total_rides_completed": total_completed,
                    "average_rating": float(driver_profile.average_rating),
                    "years_driving": years_driving,
                    "acceptance_rate": acceptance_rate,
                    "completion_rate": completion_rate,
                    "cancellation_rate": cancellation_rate,
                },
                # Earnings summaries in MRU
                "earnings": {
                    "lifetime": period_earnings.get("lifetime", "0.00"),
                    "monthly": period_earnings.get("month", "0.00"),
                    "weekly": period_earnings.get("week", "0.00"),
                    "currency": EarningsService.CURRENCY,
                },
                # Reward points
                "reward_points": driver_profile.reward_points,
            },
            status=status.HTTP_200_OK,
        )
