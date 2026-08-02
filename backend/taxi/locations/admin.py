from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import City, CityPricing, Commune, Department, Locality, Region


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "service_enabled", "is_active")
    list_filter = ("region", "service_enabled", "is_active")
    search_fields = ("name", "region__name")


@admin.register(Commune)
class CommuneAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "region_name", "service_enabled", "is_active")
    list_filter = ("department__region", "department", "service_enabled", "is_active")
    search_fields = ("name", "department__name", "department__region__name")

    @admin.display(description="Region")
    def region_name(self, obj):
        return obj.department.region.name


@admin.register(Locality)
class LocalityAdmin(admin.ModelAdmin):
    list_display = ("name", "commune", "service_enabled", "is_active")
    list_filter = (
        "commune__department__region",
        "commune__department",
        "service_enabled",
        "is_active",
    )
    search_fields = (
        "name",
        "commune__name",
        "commune__department__name",
        "commune__department__region__name",
    )


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "commune", "is_default", "is_active")
    list_filter = ("region", "is_default", "is_active")
    search_fields = ("name", "region__name", "commune__name")


@admin.register(CityPricing)
class CityPricingAdmin(admin.ModelAdmin):
    list_display = (
        "city",
        "ride_type",
        "base_fare",
        "per_km",
        "minimum_fare",
        "status_chip",
        "created_at",
        "updated_at",
    )
    list_filter = ("ride_type", "is_active", "city__region")
    search_fields = ("city__name", "city__region__name")
    actions = ("activate_selected", "deactivate_selected")

    @admin.display(description="Status")
    def status_chip(self, obj):
        color = "green" if obj.is_active else "red"
        label = "Active" if obj.is_active else "Inactive"
        return mark_safe(f'<span style="color:{color};font-weight:bold;">{label}</span>')

    @admin.display(description="Override")
    def override_indicator(self, obj):
        return "Yes" if obj.is_active else "No"

    @admin.action(description="Activate selected city pricing")
    def activate_selected(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Deactivate selected city pricing")
    def deactivate_selected(self, request, queryset):
        queryset.update(is_active=False)
