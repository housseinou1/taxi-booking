from rest_framework import serializers

from authapp.validators import normalize_mauritania_phone, validate_person_name

from .models import Delivery


class DeliverySerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    driver_phone = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()
    plate_number = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        exclude = ("recipient_code_hash",)
        read_only_fields = (
            "customer",
            "driver",
            "status",
            "accepted_at",
            "picked_up_at",
            "delivered_at",
        )

    def get_customer_name(self, obj):
        return f"{obj.customer.first_name} {obj.customer.last_name}".strip()

    def get_driver_name(self, obj):
        if not obj.driver:
            return ""
        return f"{obj.driver.first_name} {obj.driver.last_name}".strip()

    def get_driver_phone(self, obj):
        return obj.driver.phone_number if obj.driver else ""

    def get_vehicle(self, obj):
        profile = getattr(obj.driver, "driver_profile", None)
        if not profile:
            return ""
        return " ".join(
            filter(None, [profile.vehicle_color, profile.vehicle_make, profile.vehicle_model])
        )

    def get_plate_number(self, obj):
        profile = getattr(obj.driver, "driver_profile", None)
        return (profile.plate_number or profile.vehicle_plate or "") if profile else ""

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")
