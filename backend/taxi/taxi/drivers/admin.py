from django.contrib import admin
from .models import DriverProfile


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "status",
        "is_available",
        "current_lat",
        "current_lng",
        "created_at",
    )

    list_filter = (
        "status",
        "is_available",
    )

    search_fields = (
        "user__username",
        "user__email",
    )