"""
Achievements and Rewards API Views

Provides endpoints for driver achievements and rewards:
- GET /drivers/me/achievements/ - Earned achievements with name, icon, date
- GET /drivers/me/rewards/      - Reward points balance and redemption options

Requirements: 14.2, 14.4, 14.5
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .services.achievement_service import AchievementService


class DriverAchievementsView(APIView):
    """
    GET /drivers/me/achievements/

    Returns all achievements earned by the authenticated driver,
    including achievement name, icon, and date earned.

    Requirements: 14.2
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

        achievement_service = AchievementService()
        driver_achievements = achievement_service.get_driver_achievements(
            driver_profile
        )

        achievements_data = [
            {
                "id": da.id,
                "achievement_id": da.achievement.id,
                "name": da.achievement.name,
                "description": da.achievement.description,
                "icon": da.achievement.icon,
                "code": da.achievement.code,
                "earned_at": da.earned_at,
            }
            for da in driver_achievements
        ]

        return Response(
            {"achievements": achievements_data},
            status=status.HTTP_200_OK,
        )


class DriverRewardsView(APIView):
    """
    GET /drivers/me/rewards/

    Returns the driver's current reward points balance and
    available redemption options.

    Requirements: 14.4, 14.5
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

        achievement_service = AchievementService()
        points_balance = achievement_service.get_reward_points_balance(
            driver_profile
        )

        from .views_rewards import enrich_rewards_response

        tier_payload = enrich_rewards_response(driver_profile)

        # Redemption options based on points tiers
        redemption_options = self._get_redemption_options(points_balance)

        return Response(
            {
                "points_balance": points_balance,
                **tier_payload,
                "redemption_options": redemption_options,
                "points_info": {
                    "ride_complete": 10,
                    "five_star_rating": 5,
                    "peak_hour_ride": 3,
                    "airport_ride": 5,
                    "long_distance_ride": 5,
                    "referral_completed": 50,
                    "driver_cancellation": -3,
                },
            },
            status=status.HTTP_200_OK,
        )

    def _get_redemption_options(self, points_balance):
        """
        Returns available redemption options based on the driver's
        current points balance.
        """
        all_options = [
            {
                "id": "fuel_voucher_small",
                "name": "Fuel Voucher (500 MRU)",
                "description": "Redeem for a 500 MRU fuel voucher.",
                "points_required": 100,
                "category": "fuel",
            },
            {
                "id": "fuel_voucher_large",
                "name": "Fuel Voucher (1000 MRU)",
                "description": "Redeem for a 1000 MRU fuel voucher.",
                "points_required": 200,
                "category": "fuel",
            },
            {
                "id": "maintenance_discount",
                "name": "Vehicle Maintenance Discount",
                "description": "10% discount on vehicle maintenance services.",
                "points_required": 150,
                "category": "maintenance",
            },
            {
                "id": "bonus_earnings",
                "name": "Earnings Bonus (5%)",
                "description": "5% bonus on earnings for the next 24 hours.",
                "points_required": 250,
                "category": "earnings",
            },
            {
                "id": "priority_matching",
                "name": "Priority Ride Matching (1 hour)",
                "description": "Priority ride matching for 1 hour.",
                "points_required": 50,
                "category": "matching",
            },
        ]

        # Mark which options are redeemable based on current balance
        for option in all_options:
            option["redeemable"] = points_balance >= option["points_required"]

        return all_options
