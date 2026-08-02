from django.contrib import admin
from django.utils.html import format_html

from .models import Ride, RideStop, RidePricingSnapshot


class RideStopInline(admin.TabularInline):
    model = RideStop
    extra = 0
    ordering = ["stop_order"]
    readonly_fields = ("arrived_at", "departed_at")


class RidePricingSnapshotInline(admin.StackedInline):
    """Read-only inline showing the pricing applied at ride creation.

    Admins must not edit historical snapshots.
    """
    model = RidePricingSnapshot
    extra = 0
    can_delete = False
    readonly_fields = (
        "source",
        "ride_type",
        "city_pricing",
        "global_fare_config",
        "base_fare",
        "per_km",
        "minimum_fare",
        "billable_distance_km",
        "distance_charge",
        "estimated_fare",
        "commission_percent",
        "commission_policy",
        "app_fee",
        "driver_earning",
        "waiting_policy",
        "cancellation_policy",
        "no_show_policy",
        "effective_from",
        "created_at",
    )
    fieldsets = (
        ("Fare Resolution", {
            "fields": (
                "source",
                "ride_type",
                "city_pricing",
                "global_fare_config",
                "effective_from",
            ),
        }),
        ("Applied Fare", {
            "fields": (
                "base_fare",
                "per_km",
                "minimum_fare",
                "billable_distance_km",
                "distance_charge",
                "estimated_fare",
            ),
        }),
        ("Commission", {
            "fields": (
                "commission_percent",
                "commission_policy",
                "app_fee",
                "driver_earning",
            ),
        }),
        ("Policy References", {
            "fields": (
                "waiting_policy",
                "cancellation_policy",
                "no_show_policy",
            ),
        }),
        ("Audit", {
            "fields": ("created_at",),
        }),
    )

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "rider",
        "driver",
        "ride_type",
        "fare",
        "pricing_source_display",
        "status",
        "created_at",
    )
    list_filter = ("status", "ride_type")
    search_fields = ("rider__email", "driver__email", "pickup", "destination")
    inlines = [RidePricingSnapshotInline, RideStopInline]
    readonly_fields = ("created_at", "completed_at", "cancelled_at", "pickup_pin_verified_at")

    @admin.display(description="Pricing Source")
    def pricing_source_display(self, obj):
        try:
            snapshot = obj.pricing_snapshot
            labels = {
                "city": "🏙 City",
                "global_db": "🗄 Global DB",
                "market_fallback": "📋 Market",
            }
            return labels.get(snapshot.source, snapshot.source)
        except RidePricingSnapshot.DoesNotExist:
            return "—"


@admin.register(RideStop)
class RideStopAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "ride",
        "stop_order",
        "location_name",
        "arrived_at",
        "departed_at",
    )
    list_filter = ("ride",)
    ordering = ["ride", "stop_order"]


@admin.register(RidePricingSnapshot)
class RidePricingSnapshotAdmin(admin.ModelAdmin):
    """Standalone read-only admin for pricing snapshots — for audit/support use."""

    list_display = (
        "id",
        "ride_id",
        "ride_type",
        "source",
        "estimated_fare",
        "commission_percent",
        "app_fee",
        "driver_earning",
        "created_at",
    )
    list_filter = ("source", "ride_type")
    search_fields = ("ride__id", "ride__rider__email")
    readonly_fields = (
        "ride",
        "ride_type",
        "source",
        "city_pricing",
        "global_fare_config",
        "base_fare",
        "per_km",
        "minimum_fare",
        "billable_distance_km",
        "distance_charge",
        "estimated_fare",
        "commission_percent",
        "commission_policy",
        "app_fee",
        "driver_earning",
        "waiting_policy",
        "cancellation_policy",
        "no_show_policy",
        "effective_from",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
