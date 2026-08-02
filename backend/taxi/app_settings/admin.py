from django import forms
from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    PricingAuditLog,
    RideCommissionConfig,
    SiteSettings,
    WaitingFeeConfig,
)


def _can_modify_pricing(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(
        name__in=["CEO", "Super Admin", "Pricing Administrator"]
    ).exists()


class UserTrackingAdminMixin:
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


class BasePricingConfigAdmin(UserTrackingAdminMixin, admin.ModelAdmin):
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")
    list_filter = ("is_active", "effective_from")
    date_hierarchy = "effective_from"
    actions = ("activate_selected", "deactivate_selected")

    @admin.display(description="Status")
    def status_chip(self, obj):
        color = "green" if obj.is_active else "red"
        label = "Active" if obj.is_active else "Inactive"
        return mark_safe(f'<span style="color:{color};font-weight:bold;">{label}</span>')

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj=obj, change=change, **kwargs)

        class FormWithReason(form):
            change_reason = forms.CharField(
                required=False,
                label="Change reason",
                widget=forms.TextInput(
                    attrs={"placeholder": "Reason for this change", "style": "width: 100%;"}
                ),
            )

        return FormWithReason

    def get_fieldsets(self, request, obj=None):
        fieldsets = list(super().get_fieldsets(request, obj))
        fieldsets.insert(0, ("Reason", {"fields": ("change_reason",)}))
        return fieldsets

    def _log_field_change(self, user, obj, action, field_name, old_value, new_value, reason):
        PricingAuditLog.objects.create(
            user=user,
            action=action,
            model_name=obj._meta.label,
            object_id=str(obj.pk) if obj.pk else "",
            object_repr=str(obj)[:255],
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
        )

    def save_model(self, request, obj, form, change):
        reason = form.cleaned_data.get("change_reason", "") if hasattr(form, "cleaned_data") else ""
        if change:
            try:
                old = self.model.objects.get(pk=obj.pk)
            except self.model.DoesNotExist:
                old = None
            if old and old.is_active != obj.is_active:
                action = "activate" if obj.is_active else "deactivate"
            else:
                action = "update"

            for field_name in form.changed_data:
                if field_name == "change_reason":
                    continue
                old_value = form.initial.get(field_name, "")
                new_value = form.cleaned_data.get(field_name, "")
                if old_value != new_value:
                    self._log_field_change(
                        request.user,
                        obj,
                        action,
                        field_name,
                        str(old_value),
                        str(new_value),
                        reason,
                    )
        else:
            self._log_field_change(
                request.user,
                obj,
                "create",
                "",
                "",
                "",
                reason,
            )

        super().save_model(request, obj, form, change)

    def _set_active(self, request, queryset, is_active):
        action = "activate" if is_active else "deactivate"
        for obj in queryset:
            old = str(obj.is_active)
            obj.is_active = is_active
            obj.save()
            self._log_field_change(
                request.user,
                obj,
                action,
                "is_active",
                old,
                str(is_active),
                "",
            )

    @admin.action(description="Activate selected configurations")
    def activate_selected(self, request, queryset):
        self._set_active(request, queryset, True)

    @admin.action(description="Deactivate selected configurations")
    def deactivate_selected(self, request, queryset):
        self._set_active(request, queryset, False)

    def has_view_permission(self, request, obj=None):
        return request.user.is_staff

    def has_add_permission(self, request):
        return _can_modify_pricing(request.user)

    def has_change_permission(self, request, obj=None):
        return _can_modify_pricing(request.user)

    def has_delete_permission(self, request, obj=None):
        return _can_modify_pricing(request.user)


@admin.register(GlobalFareConfig)
class GlobalFareConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "ride_type",
        "base_fare",
        "per_km",
        "minimum_fare",
        "status_chip",
        "effective_from",
        "updated_at",
    )
    list_filter = BasePricingConfigAdmin.list_filter + ("ride_type",)
    search_fields = ("ride_type",)
    fieldsets = (
        (None, {
            "fields": ("ride_type", "base_fare", "per_km", "minimum_fare", "is_active"),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(WaitingFeeConfig)
class WaitingFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "free_minutes",
        "per_minute_fee",
        "max_wait_minutes",
        "arrive_max_distance_m",
        "no_show_max_distance_m",
        "status_chip",
        "effective_from",
        "updated_at",
    )
    fieldsets = (
        (None, {
            "fields": (
                "free_minutes",
                "per_minute_fee",
                "max_wait_minutes",
                "arrive_max_distance_m",
                "no_show_max_distance_m",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(CancellationFeeConfig)
class CancellationFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "free_window_minutes",
        "en_route_fee",
        "arrived_fee",
        "driver_penalty",
        "status_chip",
        "effective_from",
        "updated_at",
    )
    fieldsets = (
        (None, {
            "fields": (
                "free_window_minutes",
                "en_route_fee",
                "arrived_fee",
                "driver_penalty",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(NoShowFeeConfig)
class NoShowFeeConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "rider_fee",
        "driver_compensation",
        "wait_minutes_threshold",
        "max_distance_m",
        "status_chip",
        "effective_from",
        "updated_at",
    )
    fieldsets = (
        (None, {
            "fields": (
                "rider_fee",
                "driver_compensation",
                "wait_minutes_threshold",
                "max_distance_m",
                "is_active",
            ),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(RideCommissionConfig)
class RideCommissionConfigAdmin(BasePricingConfigAdmin):
    list_display = (
        "platform_percent",
        "driver_percent",
        "status_chip",
        "effective_from",
        "updated_at",
    )
    fieldsets = (
        (None, {
            "fields": ("platform_percent", "driver_percent", "is_active"),
        }),
        ("Scheduling", {
            "fields": ("effective_from",),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
            "classes": ("collapse",),
        }),
    )


@admin.register(PricingAuditLog)
class PricingAuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "user",
        "action",
        "model_name",
        "object_repr",
        "field_name",
        "old_value",
        "new_value",
        "reason",
    )
    list_filter = ("action", "model_name", "created_at")
    search_fields = ("model_name", "object_repr", "reason", "user__email")
    readonly_fields = (
        "created_at",
        "user",
        "action",
        "model_name",
        "object_id",
        "object_repr",
        "field_name",
        "old_value",
        "new_value",
        "reason",
    )
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(SiteSettings)