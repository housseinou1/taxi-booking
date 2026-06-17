from django.contrib import admin
from .models import Payment, WalletAccount, WalletTransaction


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "rider",
        "ride_id",
        "amount",
        "app_fee",
        "driver_earning",
        "method",
        "status",
        "created_at",
    )

    list_filter = (
        "status",
        "method",
        "created_at",
    )

    search_fields = (
        "rider__email",
        "transaction_id",
        "ride_id",
    )


admin.site.register([WalletAccount, WalletTransaction])
