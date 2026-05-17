from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    rider_email = serializers.SerializerMethodField()
    driver_email = serializers.SerializerMethodField()
    ride_id = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "ride",
            "ride_id",
            "rider",
            "rider_email",
            "driver",
            "driver_email",
            "amount",
            "platform_fee",
            "driver_amount",
            "payment_method",
            "payment_status",
            "stripe_payment_intent",
            "created_at",
        ]

    def get_rider_email(self, obj):
        return obj.rider.email if obj.rider else None

    def get_driver_email(self, obj):
        return obj.driver.email if obj.driver else None

    def get_ride_id(self, obj):
        return obj.ride.id if obj.ride else None