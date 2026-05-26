from django.contrib import admin

from .models import DriverProfile


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "user",
        "phone_number",
        "status",
        "is_available",
        "car_type",
        "driver_category",
        "vehicle_make",
        "vehicle_model",
        "vehicle_color",
        "vehicle_plate",
        "current_lat",
        "current_lng",
    )

    list_filter = (
        "status",
        "is_available",
        "car_type",
        "driver_category",
    )

    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "phone_number",
        "vehicle_make",
        "vehicle_model",
        "vehicle_plate",
    )
