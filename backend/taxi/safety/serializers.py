from rest_framework import serializers

from .models import EmergencyContact, SafetyIncident


class EmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = [
            "id",
            "name",
            "phone_number",
            "relationship",
            "is_primary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SafetyIncidentSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    reporter_role = serializers.CharField(source="reporter.user_type", read_only=True)
    reported_user_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    emergency_contacts = serializers.SerializerMethodField()
    emergency_dispatch = serializers.SerializerMethodField()

    class Meta:
        model = SafetyIncident
        fields = [
            "id",
            "reference",
            "reporter",
            "reporter_name",
            "reporter_role",
            "reported_user",
            "reported_user_name",
            "ride",
            "incident_type",
            "severity",
            "status",
            "description",
            "latitude",
            "longitude",
            "location_accuracy_meters",
            "trip_snapshot",
            "resolution_notes",
            "assigned_to",
            "assigned_to_name",
            "emergency_contacts",
            "emergency_dispatch",
            "acknowledged_at",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "reporter",
            "reported_user",
            "trip_snapshot",
            "assigned_to",
            "acknowledged_at",
            "resolved_at",
            "created_at",
            "updated_at",
        ]

    def _name(self, user):
        if not user:
            return ""
        return user.get_full_name().strip() or user.email

    def get_reporter_name(self, obj):
        return self._name(obj.reporter)

    def get_reported_user_name(self, obj):
        return self._name(obj.reported_user)

    def get_assigned_to_name(self, obj):
        return self._name(obj.assigned_to)

    def get_emergency_contacts(self, obj):
        return list(
            obj.reporter.emergency_contacts.values(
                "name",
                "phone_number",
                "relationship",
                "is_primary",
            )
        )

    def get_emergency_dispatch(self, obj):
        try:
            alert = obj.emergency_alert
        except Exception:
            return None
        return {
            "dispatched_at": alert.dispatched_at,
            "admin_notifications_sent": alert.admin_notifications_sent,
            "counterpart_notified": alert.counterpart_notified,
            "delivery_log": alert.delivery_log,
        }
