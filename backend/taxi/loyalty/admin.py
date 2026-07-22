from django.contrib import admin

from .models import LoyaltyPointTransaction, LoyaltyReward, LoyaltyTier, RiderLoyaltyAccount


@admin.register(LoyaltyTier)
class LoyaltyTierAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "min_points", "ride_discount_percent", "priority_support", "is_active")


@admin.register(RiderLoyaltyAccount)
class RiderLoyaltyAccountAdmin(admin.ModelAdmin):
    list_display = ("rider", "points_balance", "lifetime_points", "tier", "enrolled_at")
    search_fields = ("rider__email",)


@admin.register(LoyaltyPointTransaction)
class LoyaltyPointTransactionAdmin(admin.ModelAdmin):
    list_display = ("account", "points", "source", "reference", "created_at")
    list_filter = ("source",)


@admin.register(LoyaltyReward)
class LoyaltyRewardAdmin(admin.ModelAdmin):
    list_display = ("name", "reward_type", "points_cost", "value", "is_active")
