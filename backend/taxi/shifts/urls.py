from django.urls import path
from .views import (
    my_shifts, delete_shift, my_unavailable_days, my_online_hours, today_shift,
    admin_driver_activity, admin_scheduled_drivers,
)

urlpatterns = [
    # Driver
    path("my-shifts/", my_shifts),
    path("my-shifts/<int:shift_id>/delete/", delete_shift),
    path("unavailable/", my_unavailable_days),
    path("online-hours/", my_online_hours),
    path("today/", today_shift),

    # Admin
    path("admin/activity/", admin_driver_activity),
    path("admin/scheduled/", admin_scheduled_drivers),
]
