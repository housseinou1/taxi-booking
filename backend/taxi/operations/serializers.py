from rest_framework import serializers

from .models import VehicleMaintenanceReminder


class VehicleMaintenanceReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleMaintenanceReminder
        fields = "__all__"
        read_only_fields = ["driver", "completed_at", "created_at"]

