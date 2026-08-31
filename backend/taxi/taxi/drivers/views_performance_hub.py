"""
Driver Performance & Rewards Hub API.

GET  /drivers/me/performance-hub/ — aggregated scorecard, achievements, incentives,
                                    level, insights, leaderboard, rewards history
PATCH /drivers/me/performance-hub/leaderboard-opt-out/ — opt in/out of leaderboard
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .driver_access import resolve_driver_profile
from .models import DriverSettings
from .services.driver_performance_hub_service import build_performance_hub, get_hub_config


class DriverPerformanceHubView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])
        return Response(build_performance_hub(profile))


class DriverLeaderboardOptOutView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

        config = get_hub_config()
        if not config.get("allow_leaderboard_opt_out", True):
            return Response(
                {"error": "Leaderboard opt-out is disabled by Operations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        opted_out = request.data.get("opted_out")
        if not isinstance(opted_out, bool):
            return Response(
                {"error": "opted_out must be a boolean."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _ = DriverSettings.objects.get_or_create(driver=profile)
        settings_obj.privacy_leaderboard_opt_out = opted_out
        settings_obj.save(update_fields=["privacy_leaderboard_opt_out"])
        return Response({"opted_out": opted_out})
