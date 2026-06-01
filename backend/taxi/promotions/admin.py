from django.contrib import admin

from .models import (
    PromoCode,
    PromoCodeUsage,
    ReferralCode,
    ReferralUsage,
    ReferrerCredit,
)


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "discount_type",
        "discount_value",
        "status",
        "start_date",
        "end_date",
        "first_ride_only",
        "created_at",
    )
    list_filter = ("status", "discount_type", "first_ride_only")
    search_fields = ("code",)


@admin.register(PromoCodeUsage)
class PromoCodeUsageAdmin(admin.ModelAdmin):
    list_display = (
        "promo_code",
        "rider",
        "ride",
        "original_fare",
        "discount_amount",
        "final_fare",
        "is_first_ride",
        "created_at",
    )


@admin.register(ReferralCode)
class ReferralCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "rider", "created_at")


@admin.register(ReferralUsage)
class ReferralUsageAdmin(admin.ModelAdmin):
    list_display = (
        "referral_code",
        "referee",
        "ride",
        "referee_discount",
        "referrer_credit",
        "created_at",
    )


@admin.register(ReferrerCredit)
class ReferrerCreditAdmin(admin.ModelAdmin):
    list_display = ("referrer", "amount", "is_used", "used_on_ride", "created_at")
