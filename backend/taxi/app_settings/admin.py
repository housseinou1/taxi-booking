from django.contrib import admin

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    RideCommissionConfig,
    SiteSettings,
    WaitingFeeConfig,
)


class UserTrackingAdminMixin:
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class BasePricingConfigAdmin(UserTrackingAdminMixin, admin.ModelAdmin):
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")
    list_filter = ("is_active", "effective_from")
    date_hierarchy = "effective_from"


@admin.register(GlobalFareConfig)
class GlobalFareConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "ride_type",
        "base_fare",
        "per_km",
        "minimum_fare",
        "is_active",
        "effective_from",
    )
    list_filter = BasePricingConfigAdmin.list_filter + ("ride_type",)
    search_fields = ("ride_type",)
    fieldsets = (
        (None, {
            "fields": ("ride_type", "base_fare", "per_km", "minimum_fare", "is_active"),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(WaitingFeeConfig)
class WaitingFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "free_minutes",
        "per_minute_fee",
        "max_wait_minutes",
        "arrive_max_distance_m",
        "no_show_max_distance_m",
        "is_active",
    )
    fieldsets = (
        (None, {
            "fields": (
                "free_minutes",
                "per_minute_fee",
                "max_wait_minutes",
                "arrive_max_distance_m",
                "no_show_max_distance_m",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(CancellationFeeConfig)
class CancellationFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "free_window_minutes",
        "en_route_fee",
        "arrived_fee",
        "driver_penalty",
        "is_active",
    )
    fieldsets = (
        (None, {
            "fields": (
                "free_window_minutes",
                "en_route_fee",
                "arrived_fee",
                "driver_penalty",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(NoShowFeeConfig)
class NoShowFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "rider_fee",
        "driver_compensation",
        "wait_minutes_threshold",
        "max_distance_m",
        "is_active",
    )
    fieldsets = (
        (None, {
            "fields": (
                "rider_fee",
                "driver_compensation",
                "wait_minutes_threshold",
                "max_distance_m",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(RideCommissionConfig)
class RideCommissionConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "platform_percent",
        "driver_percent",
        "is_active",
        "effective_from",
    )
    fieldsets = (
        (None, {
            "fields": ("platform_percent", "driver_percent", "is_active"),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


admin.site.register(SiteSettings)