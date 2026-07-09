from django.contrib import admin
from .models import Ride, RideStop


class RideStopInline(admin.TabularInline):
    model = RideStop
    extra = 0
    ordering = ["stop_order"]


@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "rider",
        "driver",
        "status",
        "is_rider_no_show",
        "no_show_fee",
        "no_show_driver_compensation",
        "no_show_at",
        "cancelled_by",
        "cancellation_fee",
        "created_at",
    )
    list_filter = ("status", "is_rider_no_show", "cancelled_by")
    search_fields = ("id", "pickup", "destination", "cancellation_reason")
    readonly_fields = ("no_show_evidence", "rider_call_attempts", "created_at", "no_show_at", "driver_arrived_at")
    inlines = [RideStopInline]


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
