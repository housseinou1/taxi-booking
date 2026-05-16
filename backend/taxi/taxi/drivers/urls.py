from django.urls import path

from .views import (
    driver_list,
    approve_driver,
    reject_driver,
    driver_status,
    update_driver_status,
    update_driver_location,
    get_driver_location,
)

urlpatterns = [
    path("", driver_list),

    path("<int:id>/approve/", approve_driver),
    path("<int:id>/reject/", reject_driver),

    path("status/", driver_status),
    path("status/update/", update_driver_status),

    path("location/", get_driver_location),
    path("location/update/", update_driver_location),
]