from rest_framework import serializers
from .models import Ride


class RideSerializer(serializers.ModelSerializer):
    rider_name = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = [
            "id",
            "rider",
            "rider_name",
            "driver",
            "driver_name",

            "pickup_lat",
            "pickup_lng",
            "destination_lat",
            "destination_lng",

            "ride_type",
            "estimated_price",

            "status",
            "created_at",
        ]

        read_only_fields = [
            "rider",
            "driver",
            "status",
            "created_at",
        ]

    def get_rider_name(self, obj):
        return obj.rider.username if obj.rider else None

    def get_driver_name(self, obj):
        return obj.driver.username if obj.driver else None