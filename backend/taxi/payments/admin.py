from django.contrib import admin
from .models import (
    CommissionConfig,
    MerchantWithdrawalRequest,
    Payment,
    PaymentRecord,
    PlatformWithdrawalAccounts,
    RefundRequest,
    WalletAccount,
    WalletTransaction,
)


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
    list_filter = ("status", "method", "created_at")
    search_fields = ("rider__email", "transaction_id", "ride_id")


@admin.register(PaymentRecord)
class PaymentRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source",
        "amount",
        "method",
        "status",
        "app_fee",
        "courier_earning",
        "merchant_earning",
        "created_at",
    )
    list_filter = ("source", "status", "method")


@admin.register(RefundRequest)
class RefundRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "amount", "reason", "status", "fraud_flag", "created_at")
    list_filter = ("status", "reason", "fraud_flag")


@admin.register(CommissionConfig)
class CommissionConfigAdmin(admin.ModelAdmin):
    list_display = ("vertical", "courier_rate", "platform_rate", "merchant_rate", "updated_at")


@admin.register(MerchantWithdrawalRequest)
class MerchantWithdrawalRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "merchant", "amount", "status", "created_at", "paid_at")
    list_filter = ("status",)


@admin.register(PlatformWithdrawalAccounts)
class PlatformWithdrawalAccountsAdmin(admin.ModelAdmin):
    list_display = ("key", "bank_account", "bankily_number", "seddad_number", "updated_at", "updated_by")


admin.site.register([WalletAccount, WalletTransaction])
