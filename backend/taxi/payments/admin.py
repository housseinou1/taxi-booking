from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "ride",
        "rider",
        "driver",
        "amount",
        "platform_fee",
        "driver_amount",
        "payment_method",
        "payment_status",
        "created_at",
    )

    list_filter = (
        "payment_status",
        "payment_method",
        "created_at",
    )

    search_fields = (
        "rider__username",
        "driver__username",
        "ride__id",
    )