from django.contrib import admin
from .models import DispatchOfferLog, Ride, RideStop


class RideStopInline(admin.TabularInline):
    model = RideStop
    extra = 0
    ordering = ["stop_order"]


class DispatchOfferLogInline(admin.TabularInline):
    model = DispatchOfferLog
    extra = 0
    readonly_fields = (
        "driver",
        "dispatch_round",
        "search_radius_km",
        "distance_km",
        "eta_minutes",
        "score",
        "result",
        "created_at",
    )
    can_delete = False


@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "rider",
        "driver",
        "status",
        "dispatch_status",
        "dispatch_round",
        "is_rider_no_show",
        "no_show_fee",
        "no_show_driver_compensation",
        "no_show_at",
        "cancelled_by",
        "cancellation_fee",
        "created_at",
    )
    list_filter = ("status", "dispatch_status", "is_rider_no_show", "cancelled_by")
    search_fields = ("id", "pickup", "destination", "cancellation_reason")
    readonly_fields = (
        "no_show_evidence",
        "rider_call_attempts",
        "created_at",
        "no_show_at",
        "driver_arrived_at",
        "search_started_at",
    )
    inlines = [RideStopInline, DispatchOfferLogInline]


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


@admin.register(DispatchOfferLog)
class DispatchOfferLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "ride",
        "driver",
        "result",
        "dispatch_round",
        "search_radius_km",
        "distance_km",
        "score",
        "created_at",
    )
    list_filter = ("result", "dispatch_round")
    search_fields = ("ride__id", "driver__email")
    readonly_fields = (
        "ride",
        "driver",
        "dispatch_round",
        "search_radius_km",
        "distance_km",
        "eta_minutes",
        "score",
        "score_breakdown",
        "result",
        "created_at",
    )