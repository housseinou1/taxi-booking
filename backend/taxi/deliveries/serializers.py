import re

from rest_framework import serializers

from .models import Delivery


FAKE_VALUES = {
    "fake",
    "test",
    "testing",
    "unknown",
    "none",
    "null",
    "n/a",
    "na",
    "asdf",
    "qwerty",
}


def normalize_mauritania_phone(value):
    digits = re.sub(r"\D", "", str(value or "").strip())

    if digits.startswith("00222"):
        digits = digits[5:]
    elif digits.startswith("222") and len(digits) == 11:
        digits = digits[3:]

    if len(digits) != 8:
        raise serializers.ValidationError(
            "Enter a valid Mauritania phone number with 8 digits."
        )

    if len(set(digits)) == 1 or digits in {"12345678", "87654321", "00000000"}:
        raise serializers.ValidationError("Enter a real phone number.")

    return f"+222{digits}"


def validate_person_name(value, label):
    value = re.sub(r"\s+", " ", str(value or "").strip())
    name_characters = value.replace(" ", "").replace("-", "").replace("'", "")

    if len(value) < 2 or value.casefold() in FAKE_VALUES:
        raise serializers.ValidationError(f"Enter a real {label.lower()}.")

    if len(value) > 50 or not name_characters.isalpha():
        raise serializers.ValidationError(
            f"{label} may contain only letters, spaces, apostrophes, and hyphens."
        )

    return value


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
