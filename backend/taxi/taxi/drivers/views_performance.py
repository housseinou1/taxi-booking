from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .performance import driver_performance_summary


class AdminDriverPerformanceView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        profiles = DriverProfile.objects.select_related("user").order_by("user__first_name")

        # Filter by approval status
        status_filter = request.query_params.get("status")
        if status_filter:
            profiles = profiles.filter(status=status_filter)

        # Filter: drivers under review / account risk
        if request.query_params.get("under_review") == "1":
            profiles = profiles.filter(account_under_review=True)

        if request.query_params.get("risk") == "1":
            profiles = profiles.filter(account_risk_flag=True)

        # Filter: drivers with no-show rides
        if request.query_params.get("has_no_show") == "1":
            profiles = profiles.filter(total_rides_no_show__gt=0)

        # Filter: top performers (score band computed dynamically — filter by performance_points proxy)
        if request.query_params.get("top") == "1":
            profiles = profiles.filter(performance_points__gte=90)

        # Filter: fraud alerts
        if request.query_params.get("fraud") == "1":
            try:
                from security.models import FraudFlag
                flagged_ids = FraudFlag.objects.filter(
                    status="open"
                ).values_list("user_id", flat=True)
                profiles = profiles.filter(user_id__in=flagged_ids)
            except Exception:
                pass

        summary = driver_performance_summary(profiles)

        # Inject admin-only extended stats per driver
        for driver in summary.get("drivers", []):
            driver_id = driver.get("driver_id")
            profile = next((p for p in profiles if p.id == driver_id), None)
            if profile:
                driver["total_rides_no_show"] = profile.total_rides_no_show or 0
                driver["account_risk_reason"] = profile.account_risk_reason or ""
                driver["cancellations_today"] = profile.cancellations_today_count or 0
                driver["driver_level"] = profile.driver_level

        return Response(summary)
