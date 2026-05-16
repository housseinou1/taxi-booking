from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    rider_email = serializers.SerializerMethodField()
    driver_email = serializers.SerializerMethodField()

    class Meta:
        model = Payment

        fields = [
            "id",
            "rider",
            "rider_email",
            "driver",
            "driver_email",
            "ride_id",
            "amount",
            "platform_fee",
            "driver_amount",
            "currency",
            "method",
            "status",
            "transaction_id",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "rider",
            "rider_email",
            "driver",
            "driver_email",
            "platform_fee",
            "driver_amount",
            "status",
            "transaction_id",
            "created_at",
            "updated_at",
        ]

    def get_rider_email(self, obj):
        if obj.rider:
            return obj.rider.email
        return None

    def get_driver_email(self, obj):
        if obj.driver:
            return obj.driver.email
        return None