from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .hall_of_fame import (
    driver_snapshot,
    serialize_recognition,
    sync_lifetime_milestones,
    sync_monthly_rankings,
)
from .models import DriverProfile, HallOfFameRecognition


class DriverHallOfFameView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        try:
            profile = DriverProfile.objects.select_related("user", "user__city").get(user=request.user)
        except DriverProfile.DoesNotExist:
            return Response(
                {"detail": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        sync_lifetime_milestones()
        sync_monthly_rankings(today.year, today.month)
        recognitions = HallOfFameRecognition.objects.select_related(
            "driver", "driver__user", "city"
        )
        my_recognitions = recognitions.filter(driver__user=request.user)
        return Response(
            {
                "my_recognitions": [serialize_recognition(item) for item in my_recognitions],
                "my_stats": driver_snapshot(profile),
                "achievement_badges": [
                    {
                        "id": earned.id,
                        "name": earned.achievement.name,
                        "description": earned.achievement.description,
                        "icon": earned.achievement.icon,
                        "earned_at": earned.earned_at,
                    }
                    for earned in profile.achievements.select_related("achievement")
                ],
                "driver_of_month": [
                    serialize_recognition(item)
                    for item in recognitions.filter(category="driver_of_month")[:12]
                ],
                "top_city": [
                    serialize_recognition(item)
                    for item in recognitions.filter(category="top_city", year=today.year, month=today.month)[:30]
                ],
                "top_mauritania": [
                    serialize_recognition(item)
                    for item in recognitions.filter(category="top_national", year=today.year, month=today.month)[:3]
                ],
            }
        )


class AdminHallOfFameView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        year = int(request.query_params.get("year") or timezone.localdate().year)
        month = request.query_params.get("month")
        sync_lifetime_milestones()
        sync_monthly_rankings(year, month)
        queryset = HallOfFameRecognition.objects.select_related(
            "driver", "driver__user", "city"
        ).filter(year=year)
        city_id = request.query_params.get("city")
        if city_id:
            queryset = queryset.filter(city_id=city_id)
        if month:
            queryset = queryset.filter(month=int(month))
        return Response(
            {
                "year": year,
                "city": city_id or "",
                "members": [serialize_recognition(item) for item in queryset[:500]],
            }
        )
