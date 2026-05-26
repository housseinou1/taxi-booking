from django.urls import path

from .views import (
    driver_me,
    driver_list,
    available_drivers,
    toggle_availability,
    update_location,
    register_driver,
    update_driver_profile,
    driver_location,
    approve_driver,
    reject_driver,
    reintegrate_driver,
    update_driver_category,
)

urlpatterns = [
    path("available/", available_drivers),
    path("availability/toggle/", toggle_availability),
    path("location/update/", update_location),
    path("register/", register_driver),
    path("profile/update/", update_driver_profile),
    path("list/", driver_list),
    path("me/", driver_me),
    path("location/<int:driver_id>/", driver_location),
    path("approve/<int:driver_id>/", approve_driver),
    path("reject/<int:driver_id>/", reject_driver),
    path("reintegrate/<int:driver_id>/", reintegrate_driver),
    path("category/<int:driver_id>/", update_driver_category),
]
