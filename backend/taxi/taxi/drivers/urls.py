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
    path("list/", driver_list),
    path("approve/<int:id>/", approve_driver),
    path("reject/<int:id>/", reject_driver),

    path("status/", driver_status),
    path("status/update/", update_driver_status),

    path("location/", get_driver_location),
    path("location/update/", update_driver_location),
]