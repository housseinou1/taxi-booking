from django.contrib import admin

from .models import (
    SiteSettings,
    GlobalFareConfig,
    WaitingFeeConfig,
    CancellationFeeConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
)


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    pass


class BaseConfigAdmin(admin.ModelAdmin):
    """Shared admin for all pricing config models."""
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")
    list_filter = ("is_active",)
    ordering = ("-effective_from", "-created_at")

    def save_model(self, request, obj, form, change):
        if not obj.pk:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(GlobalFareConfig)
class GlobalFareConfigAdmin(BaseConfigAdmin):
    list_display = ("ride_type", "base_fare", "per_km", "minimum_fare", "is_active", "effective_from", "created_at")
    list_filter = ("is_active", "ride_type")
    search_fields = ("ride_type",)


@admin.register(WaitingFeeConfig)
class WaitingFeeConfigAdmin(BaseConfigAdmin):
    list_display = ("free_minutes", "per_minute_fee", "max_wait_minutes", "is_active", "effective_from", "created_at")


@admin.register(CancellationFeeConfig)
class CancellationFeeConfigAdmin(BaseConfigAdmin):
    list_display = ("free_window_minutes", "en_route_fee", "arrived_fee", "driver_penalty", "is_active", "effective_from")


@admin.register(NoShowFeeConfig)
class NoShowFeeConfigAdmin(BaseConfigAdmin):
    list_display = ("rider_fee", "driver_compensation", "wait_minutes_threshold", "max_distance_m", "is_active", "effective_from")


@admin.register(RideCommissionConfig)
class RideCommissionConfigAdmin(BaseConfigAdmin):
    list_display = ("platform_percent", "driver_percent", "is_active", "effective_from", "created_at")
