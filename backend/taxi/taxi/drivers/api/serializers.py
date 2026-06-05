from rest_framework import serializers

from taxi.drivers.models import (
    DriverProfile,
    DriverDocument,
    Achievement,
    DriverAchievement,
    DriverFavoriteArea,
    DriverSettings,
    DriverCompliment,
    SupportTicket,
    HeatmapZone,
)


class DriverProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "user",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "status",
            "is_available",
            "car_type",
            "driver_category",
            "driver_level",
            "total_rides_completed",
            "total_rides_accepted",
            "total_rides_received",
            "total_rides_cancelled",
            "average_rating",
            "reward_points",
            "vehicle_make",
            "vehicle_model",
            "vehicle_color",
            "vehicle_plate",
            "plate_number",
            "driver_photo",
            "current_lat",
            "current_lng",
        ]
        read_only_fields = ["id", "user", "username", "email", "first_name", "last_name"]


class DriverDocumentSerializer(serializers.ModelSerializer):
    days_until_expiry = serializers.SerializerMethodField()

    class Meta:
        model = DriverDocument
        fields = [
            "id",
            "driver",
            "document_type",
            "file",
            "status",
            "rejection_reason",
            "issued_at",
            "expires_at",
            "uploaded_at",
            "reviewed_at",
            "reviewed_by",
            "days_until_expiry",
        ]
        read_only_fields = [
            "id",
            "status",
            "rejection_reason",
            "uploaded_at",
            "reviewed_at",
            "reviewed_by",
            "days_until_expiry",
        ]

    def get_days_until_expiry(self, obj):
        """Return days until expiration, or None if no expiry date set."""
        if not obj.expires_at:
            return None
        from django.utils import timezone

        today = timezone.localdate()
        delta = (obj.expires_at - today).days
        return delta


class DriverDocumentUploadSerializer(serializers.ModelSerializer):
    """Serializer for document upload - accepts only type and file."""

    class Meta:
        model = DriverDocument
        fields = ["id", "document_type", "file", "issued_at", "expires_at"]

    def validate_file(self, value):
        # Validate file format
        allowed_types = [
            "image/jpeg",
            "image/png",
            "application/pdf",
        ]
        if hasattr(value, "content_type") and value.content_type not in allowed_types:
            raise serializers.ValidationError(
                "Accepted formats: JPEG, PNG, PDF. Max size: 10MB"
            )
        # Validate file size (10 MB max)
        max_size = 10 * 1024 * 1024  # 10 MB
        if value.size > max_size:
            raise serializers.ValidationError(
                "File size exceeds 10MB limit."
            )
        return value


class AchievementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = ["id", "code", "name", "description", "icon"]
        read_only_fields = ["id"]


class DriverAchievementSerializer(serializers.ModelSerializer):
    achievement = AchievementSerializer(read_only=True)

    class Meta:
        model = DriverAchievement
        fields = ["id", "driver", "achievement", "earned_at"]
        read_only_fields = ["id", "earned_at"]


class DriverFavoriteAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverFavoriteArea
        fields = [
            "id",
            "driver",
            "label",
            "center_lat",
            "center_lng",
            "radius_km",
            "created_at",
        ]
        read_only_fields = ["id", "driver", "created_at"]

    def validate(self, attrs):
        """Enforce maximum 5 favorite areas per driver."""
        request = self.context.get("request")
        if request and self.instance is None:
            driver_profile = request.user.driver_profile
            current_count = DriverFavoriteArea.objects.filter(
                driver=driver_profile
            ).count()
            if current_count >= 5:
                raise serializers.ValidationError(
                    "Maximum 5 favorite areas. Remove one first."
                )
        return attrs


class DriverSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverSettings
        fields = [
            "id",
            "driver",
            "language",
            "notifications_rides",
            "notifications_promotions",
            "notifications_system",
            "gps_accuracy",
            "dark_mode",
            "pin_lock",
            "biometric_enabled",
            "privacy_show_name",
            "privacy_show_photo",
            "privacy_show_vehicle",
        ]
        read_only_fields = ["id", "driver"]
        extra_kwargs = {
            "pin_lock": {"write_only": True},
        }

    def validate_pin_lock(self, value):
        """PIN must be 4-6 numeric digits or empty (to clear)."""
        if value == "":
            return value
        if not value.isdigit() or not (4 <= len(value) <= 6):
            raise serializers.ValidationError(
                "PIN must be 4 to 6 numeric digits."
            )
        return value


class DriverComplimentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverCompliment
        fields = ["id", "driver", "ride", "category", "created_at"]
        read_only_fields = ["id", "created_at"]


class SupportTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = [
            "id",
            "driver",
            "ticket_type",
            "status",
            "subject",
            "message",
            "location_lat",
            "location_lng",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "driver", "status", "created_at", "resolved_at"]


class SupportTicketCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating support tickets (emergency, live chat, contact form)."""

    class Meta:
        model = SupportTicket
        fields = [
            "ticket_type",
            "subject",
            "message",
            "location_lat",
            "location_lng",
        ]


class HeatmapZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeatmapZone
        fields = [
            "id",
            "center_lat",
            "center_lng",
            "radius_km",
            "intensity",
            "active",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
