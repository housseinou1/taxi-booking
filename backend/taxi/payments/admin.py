from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "rider",
        "ride_id",
        "amount",
        "currency",
        "method",
        "status",
        "created_at",
    )

    list_filter = (
        "status",
        "method",
        "currency",
        "created_at",
    )

    search_fields = (
        "transaction_id",
        "ride_id",
        "rider__email",
    )