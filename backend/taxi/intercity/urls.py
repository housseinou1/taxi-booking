from django.urls import path
from .views import (
    list_routes, route_detail, book_intercity, my_intercity_trips,
    driver_intercity_mode, available_intercity_trips,
    accept_intercity_trip, start_intercity_trip, complete_intercity_trip,
    admin_create_route, admin_update_route, admin_intercity_analytics,
)

urlpatterns = [
    # Public
    path("routes/", list_routes),
    path("routes/<int:route_id>/", route_detail),

    # Rider
    path("book/", book_intercity),
    path("my-trips/", my_intercity_trips),

    # Driver
    path("driver/mode/", driver_intercity_mode),
    path("driver/available/", available_intercity_trips),
    path("driver/accept/<int:trip_id>/", accept_intercity_trip),
    path("driver/start/<int:trip_id>/", start_intercity_trip),
    path("driver/complete/<int:trip_id>/", complete_intercity_trip),

    # Admin
    path("admin/routes/create/", admin_create_route),
    path("admin/routes/<int:route_id>/update/", admin_update_route),
    path("admin/analytics/", admin_intercity_analytics),
]
