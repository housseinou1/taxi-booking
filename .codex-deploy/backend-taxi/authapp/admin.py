from django.contrib import admin
from .models import PhoneVerificationCode, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "user_type",
        "rider_status",
        "is_phone_verified",
        "is_active",
        "is_staff",
    )
    list_filter = ("user_type", "rider_status", "is_active", "is_staff")
    search_fields = ("email", "first_name", "last_name", "phone_number")
    readonly_fields = ("phone_verified_at",)


@admin.register(PhoneVerificationCode)
class PhoneVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "attempts", "consumed_at")
    list_filter = ("created_at", "consumed_at")
    search_fields = ("user__email", "user__phone_number")
    readonly_fields = ("code_hash", "created_at", "expires_at", "attempts", "consumed_at")
