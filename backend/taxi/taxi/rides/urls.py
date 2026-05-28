from django.urls import path

from .views import (
    request_ride,
    available_rides,
    ride_history,
    driver_rides,
    accept_ride,
    start_ride,
    complete_ride,
    cancel_ride,
    rate_ride,
    rate_rider,
    driver_earnings_summary,
    rider_spending_summary,
    admin_revenue_analytics,
)

urlpatterns = [
    path("request/", request_ride),
    path("available/", available_rides),
    path("history/", ride_history),
    path("driver-rides/", driver_rides),

    path("accept/<int:ride_id>/", accept_ride),
    path("start/<int:ride_id>/", start_ride),
    path("complete/<int:ride_id>/", complete_ride),
    path("cancel/<int:ride_id>/", cancel_ride),
    path("rate/<int:ride_id>/", rate_ride),
    path("rate-rider/<int:ride_id>/", rate_rider),

    path("driver/earnings/", driver_earnings_summary),
    path("rider/spending/", rider_spending_summary),
    path("admin/analytics/", admin_revenue_analytics),
]
