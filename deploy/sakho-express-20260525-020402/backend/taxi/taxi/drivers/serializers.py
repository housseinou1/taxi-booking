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
            "driver_photo",
            "vehicle_registration",
            "insurance_document",
            "current_lat",
            "current_lng",
            "driver_lat",
            "driver_lng",
            "average_rating",
            "completed_trips",
        ]

        read_only_fields = [
            "id",
            "user",
            "email",
            "first_name",
            "last_name",
            "average_rating",
            "completed_trips",
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
