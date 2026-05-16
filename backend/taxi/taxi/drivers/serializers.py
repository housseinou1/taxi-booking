from rest_framework import serializers
from .models import DriverProfile


class DriverProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "status",
            "is_available",
            "car_type",
            "vehicle_make",
            "vehicle_model",
            "vehicle_color",
            "vehicle_plate",
            "profile_picture",
            "license_file",
            "insurance_file",
            "driver_lat",
            "driver_lng",
            "current_lat",
            "current_lng",
            "created_at",
            "updated_at",
        ]