from rest_framework import serializers
from django.db.models import Avg, Count

from .models import DriverProfile
from taxi.rides.models import Ride


class DriverProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    average_rating = serializers.SerializerMethodField()
    completed_trips = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "user",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "status",
            "is_available",
            "car_type",
            "driver_category",
            "vehicle_make",
            "vehicle_model",
            "vehicle_color",
            "vehicle_plate",
            "plate_number",
            "driver_photo",
            "vehicle_photo",
            "license_file",
            "license_issued_at",
            "license_expires_at",
            "vehicle_registration",
            "vehicle_registration_expires_at",
            "insurance_document",
            "insurance_expires_at",
            "vignette_document",
            "vignette_expires_at",
            "terms_accepted",
            "terms_accepted_at",
            "terms_version",
            "current_lat",
            "current_lng",
            "driver_lat",
            "driver_lng",
            "average_rating",
            "completed_trips",
            "terms_accepted_at",
        ]

        read_only_fields = [
            "id",
            "user",
            "email",
            "first_name",
            "last_name",
            "average_rating",
            "completed_trips",
            "qr_code_uuid",
            "qr_code_image",
            "qr_code_generated_at",
        ]

    def get_average_rating(self, obj):
        result = Ride.objects.filter(
            driver=obj.user,
            status="completed",
            rating__isnull=False,
        ).aggregate(avg=Avg("rating"))

        avg = result["avg"]

        if avg is None:
            return 0

        return round(avg, 1)

    def get_completed_trips(self, obj):
        return Ride.objects.filter(
            driver=obj.user,
            status="completed",
        ).count()
