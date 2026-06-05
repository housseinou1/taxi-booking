from django.contrib import admin

from .models import (
    Achievement,
    DriverAchievement,
    DriverCompliment,
    DriverDocument,
    DriverFavoriteArea,
    DriverProfile,
    DriverSettings,
    HeatmapZone,
    SupportTicket,
)


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "user",
        "phone_number",
        "status",
        "application_rejection_reason",
        "is_available",
        "car_type",
        "driver_category",
        "driver_level",
        "total_rides_completed",
        "average_rating",
        "reward_points",
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
        "driver_level",
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


@admin.register(DriverDocument)
class DriverDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "document_type",
        "status",
        "issued_at",
        "expires_at",
        "uploaded_at",
        "reviewed_at",
        "reviewed_by",
    )
    list_filter = ("document_type", "status")
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver", "reviewed_by")


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "icon")
    search_fields = ("code", "name")


@admin.register(DriverAchievement)
class DriverAchievementAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "achievement", "earned_at")
    list_filter = ("achievement",)
    search_fields = ("driver__user__email", "achievement__name")
    raw_id_fields = ("driver", "achievement")


@admin.register(DriverFavoriteArea)
class DriverFavoriteAreaAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "label", "center_lat", "center_lng", "radius_km", "created_at")
    search_fields = ("driver__user__email", "label")
    raw_id_fields = ("driver",)


@admin.register(DriverSettings)
class DriverSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "language",
        "notifications_rides",
        "notifications_promotions",
        "notifications_system",
        "gps_accuracy",
        "dark_mode",
        "biometric_enabled",
    )
    list_filter = ("language", "gps_accuracy", "dark_mode")
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver",)


@admin.register(DriverCompliment)
class DriverComplimentAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "ride", "category", "created_at")
    list_filter = ("category",)
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver", "ride")


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "ticket_type",
        "status",
        "subject",
        "created_at",
        "resolved_at",
    )
    list_filter = ("ticket_type", "status")
    search_fields = ("driver__user__email", "subject", "message")
    raw_id_fields = ("driver",)


@admin.register(HeatmapZone)
class HeatmapZoneAdmin(admin.ModelAdmin):
    list_display = ("id", "center_lat", "center_lng", "radius_km", "intensity", "active", "updated_at")
    list_filter = ("active",)
