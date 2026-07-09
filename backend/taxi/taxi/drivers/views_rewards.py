"""
Driver Rewards API — dashboard, challenges, history, admin leaderboard.
"""

from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from taxi.drivers.models import DriverProfile
from taxi.drivers.services.challenge_service import ChallengeService
from taxi.drivers.services.rewards_service import RewardsService, get_reward_tier
from taxi.drivers.services.achievement_service import AchievementService


class DriverRewardsDashboardView(APIView):
    """GET /drivers/me/rewards/dashboard/ — full rewards dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response({"error": "Driver profile not found."}, status=404)
        data = RewardsService().get_dashboard(profile)
        return Response(data)


class DriverChallengesView(APIView):
    """GET /drivers/me/challenges/ — active weekly challenges."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response({"error": "Driver profile not found."}, status=404)
        challenges = ChallengeService().get_active_challenges(profile)
        return Response({"challenges": challenges})


class DriverRewardHistoryView(APIView):
    """GET /drivers/me/rewards/history/ — point transaction ledger."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response({"error": "Driver profile not found."}, status=404)
        limit = min(int(request.query_params.get("limit", 50)), 200)
        history = RewardsService().get_point_history(profile, limit=limit)
        tier = get_reward_tier(profile.reward_points)
        return Response(
            {
                "total_points": profile.reward_points,
                "tier": tier,
                "transactions": history,
            }
        )


class AdminRewardsLeaderboardView(APIView):
    """GET /drivers/rewards/admin/ — admin rewards leaderboard."""

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        data = RewardsService().get_admin_leaderboard()
        return Response(data)


def enrich_rewards_response(profile: DriverProfile) -> dict:
    """Shared payload for /drivers/me/rewards/ backward compatibility."""
    tier = get_reward_tier(profile.reward_points)
    return {
        "points_balance": profile.reward_points,
        "reward_tier": tier["tier"],
        "reward_tier_label": tier["label"],
        "progress_percent": tier["progress_percent"],
        "points_to_next_level": tier["points_to_next_level"],
        "next_level": tier["next_tier_label"],
        "achievements_count": AchievementService()
        .get_driver_achievements(profile)
        .count(),
    }
