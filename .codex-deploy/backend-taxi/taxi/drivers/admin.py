from django.contrib import admin, messages
from django.utils.html import format_html

from .models import (
    Achievement,
    DriverAchievement,
    DriverCompliment,
    DriverDocument,
    DriverFavoriteArea,
    DriverProfile,
    DriverSettings,
    HeatmapZone,
    HallOfFameRecognition,
    QRCodeAuditLog,
    SupportTicket,
    VerificationRecord,
)
from .services.qr_service import QRCodeService, QRGenerationError


class VerificationRecordInline(admin.TabularInline):
    model = VerificationRecord
    extra = 0
    readonly_fields = ("rider", "scanned_at", "scan_result")
    fields = ("rider", "scanned_at", "scan_result")
    ordering = ("-scanned_at",)
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "user",
        "phone_number",
        "status",
        "application_rejection_reason",
        "is_available",
        "car_type",
        "driver_category",
        "driver_level",
        "total_rides_completed",
        "average_rating",
        "reward_points",
        "vehicle_make",
        "vehicle_model",
        "vehicle_color",
        "vehicle_plate",
        "current_lat",
        "current_lng",
    )

    list_filter = (
        "status",
        "is_available",
        "car_type",
        "driver_category",
        "driver_level",
    )

    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "phone_number",
        "vehicle_make",
        "vehicle_model",
        "vehicle_plate",
    )

    readonly_fields = (
        "qr_code_display",
        "qr_code_generated_at",
        "qr_code_uuid",
    )

    inlines = [VerificationRecordInline]

    actions = ["regenerate_qr_code"]

    def get_fieldsets(self, request, obj=None):
        """Add QR Code section to the default fieldsets."""
        fieldsets = super().get_fieldsets(request, obj)
        # If default fieldsets is just (None, {fields: ...}), append QR section
        qr_fieldset = (
            "QR Code Verification",
            {
                "fields": ("qr_code_display", "qr_code_uuid", "qr_code_generated_at"),
                "description": self._get_qr_section_description(obj),
            },
        )
        # Check if we already appended the QR fieldset
        fieldset_names = [fs[0] for fs in fieldsets]
        if "QR Code Verification" not in fieldset_names:
            fieldsets = list(fieldsets) + [qr_fieldset]
        return fieldsets

    def _get_qr_section_description(self, obj):
        """Return a description message for the QR fieldset."""
        if obj and not obj.qr_code_uuid:
            return "No QR code has been generated for this driver."
        return ""

    def qr_code_display(self, obj):
        """Display the QR code image or a message if not assigned."""
        if not obj or not obj.qr_code_uuid:
            return format_html(
                '<span style="color: #999;">No QR code has been generated for this driver.</span>'
            )
        if obj.qr_code_image:
            return format_html(
                '<img src="{}" alt="QR Code for {}" style="max-width: 200px; max-height: 200px;" />',
                obj.qr_code_image.url,
                obj.user.get_full_name() or obj.user.email,
            )
        return format_html(
            '<span style="color: #999;">QR code image file not available.</span>'
        )

    qr_code_display.short_description = "QR Code Image"

    def get_actions(self, request):
        """Hide regeneration action if viewing drivers without QR codes."""
        actions = super().get_actions(request)
        return actions

    @admin.action(description="Regenerate QR Code for selected drivers")
    def regenerate_qr_code(self, request, queryset):
        """
        Admin action to regenerate QR codes for selected drivers.
        Only processes drivers that already have a QR code assigned.
        """
        service = QRCodeService()
        success_count = 0
        skip_count = 0
        error_count = 0

        for driver_profile in queryset:
            if not driver_profile.qr_code_uuid:
                skip_count += 1
                continue

            try:
                service.regenerate_qr_code(driver_profile, request.user)
                success_count += 1
            except QRGenerationError:
                error_count += 1

        if success_count:
            self.message_user(
                request,
                f"Successfully regenerated QR code for {success_count} driver(s).",
                messages.SUCCESS,
            )
        if skip_count:
            self.message_user(
                request,
                f"Skipped {skip_count} driver(s) with no existing QR code.",
                messages.WARNING,
            )
        if error_count:
            self.message_user(
                request,
                f"Failed to regenerate QR code for {error_count} driver(s). Existing QR codes unchanged.",
                messages.ERROR,
            )


@admin.register(DriverDocument)
class DriverDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "document_type",
        "status",
        "issued_at",
        "expires_at",
        "uploaded_at",
        "reviewed_at",
        "reviewed_by",
    )
    list_filter = ("document_type", "status")
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver", "reviewed_by")


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "icon")
    search_fields = ("code", "name")


@admin.register(DriverAchievement)
class DriverAchievementAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "achievement", "earned_at")
    list_filter = ("achievement",)
    search_fields = ("driver__user__email", "achievement__name")
    raw_id_fields = ("driver", "achievement")


@admin.register(HallOfFameRecognition)
class HallOfFameRecognitionAdmin(admin.ModelAdmin):
    list_display = ("driver", "title", "badge", "category", "city", "year", "month", "rank")
    list_filter = ("badge", "category", "city", "year", "month")
    search_fields = ("driver__user__email", "driver__user__first_name", "driver__user__last_name", "title")
    raw_id_fields = ("driver",)


@admin.register(DriverFavoriteArea)
class DriverFavoriteAreaAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "label", "center_lat", "center_lng", "radius_km", "created_at")
    search_fields = ("driver__user__email", "label")
    raw_id_fields = ("driver",)


@admin.register(DriverSettings)
class DriverSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "language",
        "notifications_rides",
        "notifications_delivery_updates",
        "notifications_promotions",
        "notifications_system",
        "gps_accuracy",
        "dark_mode",
        "biometric_enabled",
    )
    list_filter = ("language", "gps_accuracy", "dark_mode")
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver",)


@admin.register(DriverCompliment)
class DriverComplimentAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "ride", "category", "created_at")
    list_filter = ("category",)
    search_fields = ("driver__user__email",)
    raw_id_fields = ("driver", "ride")


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "driver",
        "ticket_type",
        "status",
        "subject",
        "created_at",
        "resolved_at",
    )
    list_filter = ("ticket_type", "status")
    search_fields = ("driver__user__email", "subject", "message")
    raw_id_fields = ("driver",)


@admin.register(HeatmapZone)
class HeatmapZoneAdmin(admin.ModelAdmin):
    list_display = ("id", "center_lat", "center_lng", "radius_km", "intensity", "active", "updated_at")
    list_filter = ("active",)


@admin.register(VerificationRecord)
class VerificationRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "rider", "driver", "scanned_at", "scan_result")
    list_filter = ("scan_result",)
    search_fields = ("rider__email", "driver__user__email")
    raw_id_fields = ("rider", "driver")
    readonly_fields = ("scanned_at",)


@admin.register(QRCodeAuditLog)
class QRCodeAuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "admin", "driver", "action", "old_qr_uuid", "new_qr_uuid", "performed_at")
    list_filter = ("action",)
    search_fields = ("admin__email", "driver__user__email")
    raw_id_fields = ("admin", "driver")
    readonly_fields = ("performed_at",)
