from django.urls import include, path

from .views import (
    request_ride,
    schedule_ride,
    my_scheduled_rides,
    cancel_scheduled_ride,
    available_rides,
    ride_history,
    driver_rides,
    accept_ride,
    arrived_ride,
    start_ride,
    complete_ride,
    cancel_ride,
    rate_ride,
    rate_rider,
    driver_earnings_summary,
)
from .views_stops import (
    RideStopListCreateView,
    RideStopDeleteView,
    RideStopArrivedView,
    RideStopDepartedView,
)
from .analytics import (
    admin_activity_heatmap,
    admin_analytics,
    driver_analytics,
    rider_analytics,
)

urlpatterns = [
    path("request/", request_ride),
    path("schedule/", schedule_ride),
    path("scheduled/", my_scheduled_rides),
    path("scheduled/cancel/<int:ride_id>/", cancel_scheduled_ride),
    path("available/", available_rides),
    path("history/", ride_history),
    path("driver-rides/", driver_rides),

    path("accept/<int:ride_id>/", accept_ride),
    path("arrived/<int:ride_id>/", arrived_ride),
    path("start/<int:ride_id>/", start_ride),
    path("complete/<int:ride_id>/", complete_ride),
    path("cancel/<int:ride_id>/", cancel_ride),
    path("rate/<int:ride_id>/", rate_ride),
    path("rate-rider/<int:ride_id>/", rate_rider),

    path("driver/earnings/", driver_earnings_summary),

    # Multi-stop ride endpoints
    path("<int:ride_id>/stops/", RideStopListCreateView.as_view(), name="ride-stops-create"),
    path("<int:ride_id>/stops/<int:stop_id>/", RideStopDeleteView.as_view(), name="ride-stops-delete"),
    path("<int:ride_id>/stops/<int:stop_id>/arrived/", RideStopArrivedView.as_view(), name="ride-stops-arrived"),
    path("<int:ride_id>/stops/<int:stop_id>/departed/", RideStopDepartedView.as_view(), name="ride-stops-departed"),

    # Analytics endpoints
    path("analytics/driver/", driver_analytics),
    path("analytics/rider/", rider_analytics),
    path("analytics/admin/", admin_analytics),
    path("analytics/admin/activity-heatmap/", admin_activity_heatmap),

    # Share Ride endpoints
    path("share/", include("taxi.rides.share_urls")),
]
