from django.contrib import admin
from .models import DriverProfile


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "user",
        "phone_number",
        "car_type",
        "status",
        "is_available",
        "vehicle_make",
        "vehicle_model",
        "vehicle_plate",
        "created_at",
    )

    list_filter = (
        "status",
        "is_available",
        "car_type",
    )

    search_fields = (
        "user__email",
        "phone_number",
        "vehicle_plate",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "Driver Information",
            {
                "fields": (
                    "user",
                    "phone_number",
                    "car_type",
                    "status",
                    "is_available",
                )
            },
        ),

        (
            "Vehicle Information",
            {
                "fields": (
                    "vehicle_make",
                    "vehicle_model",
                    "vehicle_color",
                    "vehicle_plate",
                )
            },
        ),

        (
            "Driver Location",
            {
                "fields": (
                    "driver_lat",
                    "driver_lng",
                    "lat",
                    "lng",
                )
            },
        ),

        (
            "Driver Documents",
            {
                "fields": (
                    "profile_picture",
                    "license_file",
                    "insurance_file",
                )
            },
        ),

        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )