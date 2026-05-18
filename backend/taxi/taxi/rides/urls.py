from django.urls import path

from .views import (
    request_ride,
    rides_history,
    available_rides,
    ride_detail,
    accept_ride,
    driver_arriving,
    start_ride,
    complete_ride,
)

urlpatterns = [
    path("request/", request_ride),
    path("history/", rides_history),
    path("available/", available_rides),
    path("<int:id>/", ride_detail),
    path("<int:id>/accept/", accept_ride),
    path("<int:id>/arriving/", driver_arriving),
    path("<int:id>/start/", start_ride),
    path("<int:id>/complete/", complete_ride),
]