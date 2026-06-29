from django.contrib import admin

from .models import (
    Cart,
    CartItem,
    Merchant,
    MerchantOrder,
    MerchantOrderItem,
    MerchantPayout,
    MerchantPromotion,
    Product,
)


class ProductInline(admin.TabularInline):
    model = Product
    extra = 0


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ("business_name", "merchant_type", "city", "status", "owner", "created_at")
    list_filter = ("status", "merchant_type", "business_type", "city")
    search_fields = ("business_name", "owner_name", "email", "phone_number")
    inlines = [ProductInline]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("product_name", "merchant", "category", "price", "stock_status", "is_available")
    list_filter = ("stock_status", "category", "is_available")


@admin.register(MerchantPromotion)
class MerchantPromotionAdmin(admin.ModelAdmin):
    list_display = ("title", "merchant", "discount_type", "promo_code", "expiry_date", "is_active")


class MerchantOrderItemInline(admin.TabularInline):
    model = MerchantOrderItem
    extra = 0


@admin.register(MerchantOrder)
class MerchantOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "merchant", "customer", "status", "total", "created_at")
    list_filter = ("status", "payment_status")
    inlines = [MerchantOrderItemInline]


@admin.register(MerchantPayout)
class MerchantPayoutAdmin(admin.ModelAdmin):
    list_display = ("merchant", "amount", "status", "period_start", "period_end", "paid_at")


admin.site.register(Cart)
admin.site.register(CartItem)
