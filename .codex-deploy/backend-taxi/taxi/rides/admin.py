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
        "created_at",
    )
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