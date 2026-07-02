from django.contrib import admin

from .models import (
    DriverBonus,
    DriverReferral,
    DriverReferralCode,
    FlaggedReferral,
    RewardConfiguration,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)


# ---------- Inlines ----------


class RideCreditInline(admin.TabularInline):
    model = RideCredit
    extra = 0
    readonly_fields = (
        "rider",
        "original_amount",
        "remaining_amount",
        "status",
        "credit_type",
        "expires_at",
        "issued_at",
        "used_at",
        "revoked_at",
    )
    can_delete = False


class RiderReferralInline(admin.TabularInline):
    model = RiderReferral
    fk_name = "referral_code"
    extra = 0
    readonly_fields = ("referee", "status", "device_id", "created_at", "completed_at")
    can_delete = False


class DriverReferralInline(admin.TabularInline):
    model = DriverReferral
    fk_name = "referral_code"
    extra = 0
    readonly_fields = (
        "referee",
        "status",
        "ride_threshold",
        "completed_rides",
        "last_ride_at",
        "created_at",
        "completed_at",
        "expired_at",
    )
    can_delete = False


class DriverBonusInline(admin.StackedInline):
    model = DriverBonus
    extra = 0
    readonly_fields = (
        "referrer",
        "amount",
        "status",
        "issued_at",
        "released_at",
        "revoked_at",
    )
    can_delete = False


class FlaggedReferralInlineForRider(admin.TabularInline):
    model = FlaggedReferral
    fk_name = "rider_referral"
    extra = 0
    readonly_fields = (
        "referrer",
        "referee",
        "reason",
        "status",
        "flagged_at",
        "resolved_at",
        "resolved_by",
        "escalated_at",
    )
    can_delete = False
    verbose_name = "Fraud Flag"
    verbose_name_plural = "Fraud Flags"


class FlaggedReferralInlineForDriver(admin.TabularInline):
    model = FlaggedReferral
    fk_name = "driver_referral"
    extra = 0
    readonly_fields = (
        "referrer",
        "referee",
        "reason",
        "status",
        "flagged_at",
        "resolved_at",
        "resolved_by",
        "escalated_at",
    )
    can_delete = False
    verbose_name = "Fraud Flag"
    verbose_name_plural = "Fraud Flags"


# ---------- Model Admins ----------


@admin.register(RiderReferralCode)
class RiderReferralCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "rider", "created_at")
    search_fields = ("code", "rider__email", "rider__phone_number")
    readonly_fields = ("created_at",)
    inlines = [RiderReferralInline]


@admin.register(DriverReferralCode)
class DriverReferralCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "driver", "created_at")
    search_fields = ("code", "driver__email", "driver__phone_number")
    readonly_fields = ("created_at",)
    inlines = [DriverReferralInline]


@admin.register(RiderReferral)
class RiderReferralAdmin(admin.ModelAdmin):
    list_display = (
        "referral_code",
        "referee",
        "status",
        "device_id",
        "created_at",
        "completed_at",
    )
    list_filter = ("status", "created_at")
    search_fields = (
        "referral_code__code",
        "referee__email",
        "referee__phone_number",
        "device_id",
    )
    readonly_fields = ("created_at",)
    inlines = [RideCreditInline, FlaggedReferralInlineForRider]


@admin.register(DriverReferral)
class DriverReferralAdmin(admin.ModelAdmin):
    list_display = (
        "referral_code",
        "referee",
        "status",
        "ride_threshold",
        "completed_rides",
        "last_ride_at",
        "created_at",
        "completed_at",
        "expired_at",
    )
    list_filter = ("status", "created_at")
    search_fields = (
        "referral_code__code",
        "referee__email",
        "referee__phone_number",
    )
    readonly_fields = ("created_at",)
    inlines = [DriverBonusInline, FlaggedReferralInlineForDriver]


@admin.register(RideCredit)
class RideCreditAdmin(admin.ModelAdmin):
    list_display = (
        "rider",
        "referral",
        "original_amount",
        "remaining_amount",
        "status",
        "credit_type",
        "expires_at",
        "reminder_sent",
        "issued_at",
    )
    list_filter = ("status", "credit_type", "reminder_sent", "expires_at")
    search_fields = (
        "rider__email",
        "rider__phone_number",
        "referral__referral_code__code",
    )
    readonly_fields = ("issued_at",)


@admin.register(DriverBonus)
class DriverBonusAdmin(admin.ModelAdmin):
    list_display = (
        "referrer",
        "referral",
        "amount",
        "status",
        "issued_at",
        "released_at",
        "revoked_at",
    )
    list_filter = ("status", "issued_at")
    search_fields = (
        "referrer__email",
        "referrer__phone_number",
        "referral__referral_code__code",
    )
    readonly_fields = ("issued_at",)


@admin.register(RewardConfiguration)
class RewardConfigurationAdmin(admin.ModelAdmin):
    list_display = (
        "is_active",
        "rider_referrer_credit",
        "rider_referee_credit",
        "driver_bonus_amount",
        "driver_ride_threshold",
        "credit_expiration_days",
        "updated_by",
        "updated_at",
    )
    list_filter = ("is_active",)
    readonly_fields = ("updated_at", "created_at")
    fieldsets = (
        (
            "Rider Referral Rewards",
            {
                "fields": (
                    "rider_referrer_credit",
                    "rider_referee_credit",
                    "rider_credit_cap_count",
                    "rider_credit_cap_days",
                    "credit_expiration_days",
                ),
            },
        ),
        (
            "Driver Referral Rewards",
            {
                "fields": (
                    "driver_bonus_amount",
                    "driver_ride_threshold",
                    "driver_bonus_cap_count",
                    "driver_bonus_cap_days",
                ),
            },
        ),
        (
            "Status",
            {
                "fields": ("is_active", "updated_by", "updated_at", "created_at"),
            },
        ),
    )


@admin.register(FlaggedReferral)
class FlaggedReferralAdmin(admin.ModelAdmin):
    list_display = (
        "reason",
        "status",
        "referrer",
        "referee",
        "rider_referral",
        "driver_referral",
        "flagged_at",
        "resolved_at",
        "resolved_by",
        "escalated_at",
    )
    list_filter = ("status", "reason", "flagged_at")
    search_fields = (
        "referrer__email",
        "referrer__phone_number",
        "referee__email",
        "referee__phone_number",
    )
    readonly_fields = ("flagged_at",)
