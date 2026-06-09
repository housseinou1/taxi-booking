from django.contrib import admin

from .models import EmergencyAlert, EmergencyContact, SafetyIncident, TripShare


@admin.register(EmergencyContact)
class EmergencyContactAdmin(admin.ModelAdmin):
    list_display = ("name", "phone_number", "user", "is_primary", "updated_at")
    search_fields = ("name", "phone_number", "user__email")
    list_filter = ("is_primary",)


@admin.register(SafetyIncident)
class SafetyIncidentAdmin(admin.ModelAdmin):
    list_display = ("reference", "incident_type", "severity", "status", "reporter", "ride", "created_at")
    search_fields = ("reference", "reporter__email", "description")
    list_filter = ("incident_type", "severity", "status")


admin.site.register(EmergencyAlert)
admin.site.register(TripShare)

