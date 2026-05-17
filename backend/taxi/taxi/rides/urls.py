from django.urls import path

from .views import (
    request_ride,
    rides_list,
    available_rides,
    rides_history,
    ride_detail,
    accept_ride,
    driver_arriving,
    start_ride,
    complete_ride,
    cancel_ride,
)

urlpatterns = [
    path("", rides_list),
    path("request/", request_ride),
    path("available/", available_rides),
    path("history/", rides_history),

    path("<int:ride_id>/", ride_detail),
    path("<int:ride_id>/accept/", accept_ride),
    path("<int:ride_id>/arriving/", driver_arriving),
    path("<int:ride_id>/start/", start_ride),
    path("<int:ride_id>/complete/", complete_ride),
    path("<int:ride_id>/cancel/", cancel_ride),
]