from django.contrib import admin

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
    list_display = ("city", "ride_type", "base_fare", "per_km", "is_active")
    list_filter = ("ride_type", "is_active", "city__region")
    search_fields = ("city__name",)
