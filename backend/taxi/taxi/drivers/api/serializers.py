from rest_framework import serializers
from backend.taxi.taxi.drivers.models import DriverProfile


class DriverProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "user",
            "username",
            "email",
            "is_available",
            "lat",
            "lng",
            "vehicle_make",
            "vehicle_model",
            "vehicle_plate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]