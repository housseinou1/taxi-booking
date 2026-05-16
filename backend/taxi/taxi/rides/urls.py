from django.urls import path

from .views import (
    request_ride,
    available_rides,
    rides_history,
    rides_list,
    accept_ride,
    driver_arriving,
    start_ride,
    complete_ride,
    cancel_ride,
)

urlpatterns = [
    path("create/", request_ride),
    path("request/", request_ride),

    path("available/", available_rides),
    path("history/", rides_history),
    path("list/", rides_list),

    path("<int:ride_id>/accept/", accept_ride),
    path("<int:ride_id>/driver-arriving/", driver_arriving),
    path("<int:ride_id>/start/", start_ride),
    path("<int:ride_id>/complete/", complete_ride),
    path("<int:ride_id>/cancel/", cancel_ride),
]