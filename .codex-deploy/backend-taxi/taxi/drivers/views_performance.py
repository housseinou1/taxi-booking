from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .performance import driver_performance_summary


class AdminDriverPerformanceView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        profiles = DriverProfile.objects.select_related("user").order_by("user__first_name")
        status_filter = request.query_params.get("status")

        if status_filter:
            profiles = profiles.filter(status=status_filter)

        return Response(driver_performance_summary(profiles))
