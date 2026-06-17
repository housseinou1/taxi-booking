from django.contrib import admin

from .models import (
    BusinessAccount,
    Delivery,
    DeliveryDispute,
    DeliveryStop,
    DriverDeliverySettings,
)


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "driver",
        "service_category",
        "package_type",
        "status",
        "fare",
        "is_scheduled",
        "created_at",
    )
    list_filter = ("status", "service_category", "package_type", "is_scheduled", "is_fragile")
    search_fields = (
        "customer__email",
        "driver__email",
        "recipient_name",
        "recipient_phone",
        "pickup",
        "destination",
    )
    readonly_fields = ("created_at", "accepted_at", "picked_up_at", "delivered_at")
    fieldsets = (
        (None, {
            "fields": (
                "customer", "driver", "status", "service_category", "package_type",
            ),
        }),
        ("Locations", {
            "fields": (
                "pickup", "pickup_lat", "pickup_lng",
                "destination", "destination_lat", "destination_lng",
            ),
        }),
        ("Recipient", {
            "fields": ("recipient_name", "recipient_phone", "recipient_code_hash"),
        }),
        ("Package Details", {
            "fields": (
                "package_description", "package_photo", "is_fragile", "weight_kg",
            ),
        }),
        ("Category-Specific", {
            "fields": (
                "restaurant_name", "preparation_time_minutes",
                "prescription_reference", "is_temperature_sensitive",
                "shopping_list", "max_budget_mru",
            ),
            "classes": ("collapse",),
        }),
        ("Scheduling", {
            "fields": ("is_scheduled", "scheduled_pickup_at"),
        }),
        ("Business Account", {
            "fields": ("business_account",),
        }),
        ("Pricing", {
            "fields": (
                "fare", "base_fee", "distance_fee", "category_surcharge",
                "extra_stop_fee", "express_surcharge", "fragile_surcharge",
                "discount_amount", "driver_earning", "platform_commission",
            ),
        }),
        ("Proof of Delivery", {
            "fields": ("proof_of_delivery", "recipient_signature"),
        }),
        ("Notes", {
            "fields": ("customer_notes", "driver_notes"),
        }),
        ("Timestamps", {
            "fields": ("created_at", "accepted_at", "picked_up_at", "delivered_at"),
        }),
    )


@admin.register(DeliveryStop)
class DeliveryStopAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "delivery",
        "stop_order",
        "recipient_name",
        "status",
        "delivered_at",
    )
    list_filter = ("status",)
    search_fields = ("recipient_name", "recipient_phone", "address")
    raw_id_fields = ("delivery",)


@admin.register(DeliveryDispute)
class DeliveryDisputeAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "delivery",
        "rider",
        "reason",
        "status",
        "resolution",
        "created_at",
        "resolved_at",
    )
    list_filter = ("status", "reason", "resolution")
    search_fields = (
        "rider__email",
        "description",
        "delivery__pickup",
        "delivery__destination",
    )
    raw_id_fields = ("delivery", "rider", "resolved_by")
    readonly_fields = ("created_at",)


@admin.register(BusinessAccount)
class BusinessAccountAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "company_name",
        "contact_person",
        "payment_terms",
        "discount_percentage",
        "daily_limit",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "payment_terms")
    search_fields = ("company_name", "contact_person", "contact_email", "tax_id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(DriverDeliverySettings)
class DriverDeliverySettingsAdmin(admin.ModelAdmin):
    list_display = (
        "driver",
        "delivery_mode_enabled",
        "max_package_size",
        "total_deliveries_completed",
        "delivery_rating",
    )
    list_filter = ("delivery_mode_enabled", "max_package_size", "accepts_food", "accepts_pharmacy")
    search_fields = ("driver__email", "driver__first_name", "driver__last_name")
    raw_id_fields = ("driver",)
