import re

from rest_framework import serializers

from .models import (
    BusinessAccount,
    Delivery,
    DeliveryDispute,
    DeliveryStop,
    DriverDeliverySettings,
)


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


# ─── Delivery Stop ────────────────────────────────────────────────────────────


class DeliveryStopSerializer(serializers.ModelSerializer):
    recipient_code = serializers.CharField(read_only=True, required=False)

    class Meta:
        model = DeliveryStop
        fields = (
            "id",
            "stop_order",
            "address",
            "latitude",
            "longitude",
            "recipient_name",
            "recipient_phone",
            "package_description",
            "status",
            "arrived_at",
            "delivered_at",
            "proof_photo",
            "recipient_code",
        )
        read_only_fields = (
            "id",
            "status",
            "arrived_at",
            "delivered_at",
            "proof_photo",
            "recipient_code",
        )

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")


class DeliveryStopInputSerializer(serializers.Serializer):
    """Input serializer for creating stops within a delivery request."""

    address = serializers.CharField(max_length=255)
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    recipient_name = serializers.CharField(max_length=120)
    recipient_phone = serializers.CharField(max_length=30)
    package_description = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")


# ─── Delivery ─────────────────────────────────────────────────────────────────


class DeliverySerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    driver_phone = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()
    plate_number = serializers.SerializerMethodField()
    stops = DeliveryStopSerializer(many=True, read_only=True)

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
            "fare",
            "base_fee",
            "distance_fee",
            "category_surcharge",
            "extra_stop_fee",
            "express_surcharge",
            "fragile_surcharge",
            "discount_amount",
            "driver_earning",
            "platform_commission",
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


class DeliveryCreateSerializer(serializers.Serializer):
    """Input serializer for creating a new delivery with all options."""

    # Required fields
    pickup = serializers.CharField(max_length=255)
    destination = serializers.CharField(max_length=255)
    recipient_name = serializers.CharField(max_length=120)
    recipient_phone = serializers.CharField(max_length=30)

    # Category
    service_category = serializers.ChoiceField(
        choices=Delivery.SERVICE_CATEGORY_CHOICES,
        default="package",
    )
    package_type = serializers.ChoiceField(
        choices=Delivery.PACKAGE_TYPES,
        default="small",
    )

    # Location coords
    pickup_lat = serializers.FloatField(default=18.0735)
    pickup_lng = serializers.FloatField(default=-15.9582)
    destination_lat = serializers.FloatField(default=18.0896)
    destination_lng = serializers.FloatField(default=-15.9754)

    # Optional fields
    package_description = serializers.CharField(required=False, allow_blank=True, default="")
    customer_notes = serializers.CharField(required=False, allow_blank=True, default="")
    distance_km = serializers.DecimalField(max_digits=7, decimal_places=2, default=5)
    is_fragile = serializers.BooleanField(default=False)
    weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )

    # Scheduling
    is_scheduled = serializers.BooleanField(default=False)
    scheduled_pickup_at = serializers.DateTimeField(required=False, allow_null=True)

    # Business account
    business_account_id = serializers.IntegerField(required=False, allow_null=True)

    # Category-specific fields
    restaurant_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    preparation_time_minutes = serializers.IntegerField(required=False, allow_null=True)
    prescription_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    is_temperature_sensitive = serializers.BooleanField(default=False)
    shopping_list = serializers.CharField(required=False, allow_blank=True, default="")
    max_budget_mru = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )

    # Multi-stop
    stops = DeliveryStopInputSerializer(many=True, required=False, default=list)

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")

    def validate_stops(self, value):
        if len(value) > 4:
            raise serializers.ValidationError("Maximum 4 delivery stops allowed.")
        return value

    def validate(self, data):
        # Scheduled delivery requires pickup time
        if data.get("is_scheduled") and not data.get("scheduled_pickup_at"):
            raise serializers.ValidationError(
                {"scheduled_pickup_at": "Pickup time is required for scheduled deliveries."}
            )
        return data


# ─── Dispute ──────────────────────────────────────────────────────────────────


class DeliveryDisputeSerializer(serializers.ModelSerializer):
    delivery_id = serializers.IntegerField(source="delivery.id", read_only=True)
    rider_email = serializers.CharField(source="rider.email", read_only=True)

    class Meta:
        model = DeliveryDispute
        fields = (
            "id",
            "delivery_id",
            "rider_email",
            "reason",
            "description",
            "photo_evidence",
            "status",
            "resolution",
            "resolution_notes",
            "refund_amount",
            "created_at",
            "resolved_at",
        )
        read_only_fields = (
            "id",
            "delivery_id",
            "rider_email",
            "status",
            "resolution",
            "resolution_notes",
            "refund_amount",
            "created_at",
            "resolved_at",
        )


class DisputeCreateSerializer(serializers.Serializer):
    """Input for raising a dispute."""

    reason = serializers.ChoiceField(choices=DeliveryDispute.REASON_CHOICES)
    description = serializers.CharField(max_length=500)
    photo_evidence = serializers.ImageField(required=False, allow_null=True)


class DisputeResolveSerializer(serializers.Serializer):
    """Input for resolving a dispute."""

    action = serializers.ChoiceField(choices=DeliveryDispute.RESOLUTION_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    refund_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )


# ─── Business Account ─────────────────────────────────────────────────────────


class BusinessAccountSerializer(serializers.ModelSerializer):
    delivery_count = serializers.SerializerMethodField()

    class Meta:
        model = BusinessAccount
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")

    def get_delivery_count(self, obj):
        return obj.deliveries.count()

    def validate_contact_phone(self, value):
        return normalize_mauritania_phone(value)


# ─── Driver Delivery Settings ─────────────────────────────────────────────────


class DriverDeliverySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverDeliverySettings
        fields = (
            "delivery_mode_enabled",
            "max_package_size",
            "accepts_food",
            "accepts_pharmacy",
            "accepts_fragile",
            "total_deliveries_completed",
            "average_delivery_time_minutes",
            "delivery_rating",
        )
        read_only_fields = (
            "total_deliveries_completed",
            "average_delivery_time_minutes",
            "delivery_rating",
        )


# ─── Categories listing ───────────────────────────────────────────────────────


class ServiceCategorySerializer(serializers.Serializer):
    """Read-only serializer for listing service categories."""

    key = serializers.CharField()
    label = serializers.CharField()
    icon = serializers.CharField()
    base_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    description = serializers.CharField()
