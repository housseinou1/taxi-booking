from django.contrib import admin

from .models import Delivery


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "driver",
        "package_type",
        "status",
        "fare",
        "created_at",
    )
    list_filter = ("status", "package_type")
    search_fields = (
        "customer__email",
        "driver__email",
        "recipient_name",
        "recipient_phone",
        "pickup",
        "destination",
    )
