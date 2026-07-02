import re

from django.utils import timezone
from rest_framework import serializers

from .categories import normalize_service_category
from .cities import (
    MAURITANIA_DELIVERY_CITIES,
    DEFAULT_DELIVERY_CITY,
    normalize_delivery_cities,
)
from .courier_routing import get_courier_type_label, normalize_courier_type_required
from .tracking_status import (
    CUSTOMER_STATUS_LABELS,
    get_customer_display_status,
    get_delivery_duration_minutes,
    get_merchant_progress,
)
from .instruction_utils import instructions_summary, normalize_instructions
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


class DeliveryInstructionsSerializer(serializers.Serializer):
    building_description = serializers.CharField(required=False, allow_blank=True, default="")
    apartment_floor = serializers.CharField(required=False, allow_blank=True, default="")
    landmark = serializers.CharField(required=False, allow_blank=True, default="")
    gate_color = serializers.CharField(required=False, allow_blank=True, default="")
    extra_instructions = serializers.CharField(required=False, allow_blank=True, default="")

    def to_internal_value(self, data):
        if data in (None, ""):
            data = {}
        return normalize_instructions(super().to_internal_value(data))


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
    courier_vehicle_type = serializers.SerializerMethodField()
    courier_vehicle_label = serializers.SerializerMethodField()
    courier_type_required = serializers.CharField(read_only=True)
    courier_type_label = serializers.SerializerMethodField()
    app_fee = serializers.DecimalField(
        source="platform_commission", max_digits=10, decimal_places=2, read_only=True
    )
    driver_lat = serializers.SerializerMethodField()
    driver_lng = serializers.SerializerMethodField()
    driver_rating = serializers.SerializerMethodField()
    stops = DeliveryStopSerializer(many=True, read_only=True)
    requires_recipient_pin = serializers.SerializerMethodField()
    requires_proof_photo = serializers.SerializerMethodField()
    requires_pickup_verification = serializers.SerializerMethodField()
    pickup_pin = serializers.SerializerMethodField()
    pickup_pin_verified = serializers.SerializerMethodField()
    dropoff_pin = serializers.SerializerMethodField()
    dropoff_pin_verified = serializers.SerializerMethodField()
    eta_minutes = serializers.SerializerMethodField()
    offer_expires_in = serializers.SerializerMethodField()
    is_offered_to_me = serializers.SerializerMethodField()
    customer_display_status = serializers.SerializerMethodField()
    customer_display_label = serializers.SerializerMethodField()
    arriving_soon = serializers.SerializerMethodField()
    merchant_order = serializers.SerializerMethodField()
    merchant_name = serializers.SerializerMethodField()
    delivery_duration_minutes = serializers.SerializerMethodField()
    driver_photo = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    pickup_instruction_rows = serializers.SerializerMethodField()
    dropoff_instruction_rows = serializers.SerializerMethodField()

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
        if not obj.driver:
            return ""
        settings = getattr(obj.driver, "delivery_settings", None)
        if settings and settings.delivery_vehicle_type in {"bicycle", "motorcycle"}:
            from .vehicle_types import get_delivery_vehicle_label

            return get_delivery_vehicle_label(settings.delivery_vehicle_type)
        profile = getattr(obj.driver, "driver_profile", None)
        if not profile:
            return ""
        return " ".join(
            filter(None, [profile.vehicle_color, profile.vehicle_make, profile.vehicle_model])
        )

    def get_plate_number(self, obj):
        profile = getattr(obj.driver, "driver_profile", None)
        return (profile.plate_number or profile.vehicle_plate or "") if profile else ""

    def get_courier_vehicle_type(self, obj):
        if not obj.driver:
            return ""
        settings = getattr(obj.driver, "delivery_settings", None)
        return settings.delivery_vehicle_type if settings else ""

    def get_courier_vehicle_label(self, obj):
        from .vehicle_types import get_delivery_vehicle_label

        vehicle_type = self.get_courier_vehicle_type(obj)
        return get_delivery_vehicle_label(vehicle_type) if vehicle_type else ""

    def get_courier_type_label(self, obj):
        return get_courier_type_label(obj.courier_type_required or "motorcycle")

    def get_driver_lat(self, obj):
        if not obj.driver:
            return None
        profile = getattr(obj.driver, "driver_profile", None)
        return profile.current_lat if profile else None

    def get_driver_lng(self, obj):
        if not obj.driver:
            return None
        profile = getattr(obj.driver, "driver_profile", None)
        return profile.current_lng if profile else None

    def get_driver_rating(self, obj):
        if not obj.driver:
            return None
        settings = getattr(obj.driver, "delivery_settings", None)
        return str(settings.delivery_rating) if settings else "5.0"

    def get_requires_proof_photo(self, obj):
        from .services.delivery_service import delivery_service as svc

        return svc.requires_proof_photo(obj)

    def get_requires_pickup_verification(self, obj):
        from .services.delivery_service import delivery_service as svc

        return svc.requires_pickup_verification(obj)

    def get_pickup_pin(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return ""
        if obj.customer_id != request.user.id and not request.user.is_staff:
            return ""
        if obj.status in {"delivered", "cancelled"}:
            return ""
        return obj.pickup_pin or ""

    def get_pickup_pin_verified(self, obj):
        return bool(obj.pickup_pin_verified_at)

    def get_dropoff_pin(self, obj):
        """Return dropoff PIN to the customer (sender) so they can share with recipient."""
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return ""
        # Only show to customer (sender) or admin — courier should not see it
        if obj.customer_id != request.user.id and not request.user.is_staff:
            return ""
        if obj.status in {"delivered", "cancelled"}:
            return ""
        return obj.dropoff_pin or ""

    def get_dropoff_pin_verified(self, obj):
        return bool(getattr(obj, "dropoff_pin_verified_at", None))

    def get_eta_minutes(self, obj):
        from .geo import eta_minutes_to_target

        if not obj.driver:
            return obj.estimated_duration_minutes
        profile = getattr(obj.driver, "driver_profile", None)
        if not profile or profile.current_lat is None or profile.current_lng is None:
            return obj.estimated_duration_minutes

        if obj.status in {"accepted", "courier_arriving"}:
            return eta_minutes_to_target(
                profile.current_lat,
                profile.current_lng,
                obj.pickup_lat,
                obj.pickup_lng,
            )
        if obj.status in {"picked_up", "in_transit", "delivering"}:
            return eta_minutes_to_target(
                profile.current_lat,
                profile.current_lng,
                obj.destination_lat,
                obj.destination_lng,
            )
        return obj.estimated_duration_minutes

    def get_offer_expires_in(self, obj):
        if obj.status != "requested" or not obj.offer_sent_at:
            return None
        from .services.assignment_service import assignment_service

        timeout = assignment_service.get_offer_timeout_seconds(obj)
        elapsed = (timezone.now() - obj.offer_sent_at).total_seconds()
        remaining = max(0, int(timeout - elapsed))
        return remaining

    def get_is_offered_to_me(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if getattr(request.user, "user_type", "") != "driver":
            return False
        if not obj.offered_driver_id:
            return True
        return obj.offered_driver_id == request.user.id

    def _get_linked_merchant_order(self, obj):
        return obj.merchant_orders.select_related("merchant").first()

    def get_merchant_order(self, obj):
        order = self._get_linked_merchant_order(obj)
        if not order:
            return None
        return {
            "id": order.id,
            "status": order.status,
            "status_label": order.get_status_display(),
            "merchant_name": order.merchant.business_name if order.merchant else "",
            "progress": get_merchant_progress(order),
        }

    def get_merchant_name(self, obj):
        order = self._get_linked_merchant_order(obj)
        return order.merchant.business_name if order and order.merchant else ""

    def get_customer_display_status(self, obj):
        order = self._get_linked_merchant_order(obj)
        return get_customer_display_status(obj, order, self.get_eta_minutes(obj))

    def get_customer_display_label(self, obj):
        status = self.get_customer_display_status(obj)
        return CUSTOMER_STATUS_LABELS.get(status, "In progress")

    def get_arriving_soon(self, obj):
        return self.get_customer_display_status(obj) == "arriving_soon"

    def get_delivery_duration_minutes(self, obj):
        return get_delivery_duration_minutes(obj)

    def get_driver_photo(self, obj):
        request = self.context.get("request")
        if not obj.driver:
            return ""
        profile = getattr(obj.driver, "driver_profile", None)
        photo = None
        if profile and profile.driver_photo:
            photo = profile.driver_photo
        elif obj.driver.profile_picture:
            photo = obj.driver.profile_picture
        if not photo or not request:
            return ""
        return request.build_absolute_uri(photo.url)

    def get_customer_phone(self, obj):
        return getattr(obj.customer, "phone_number", "") or ""

    def get_pickup_instruction_rows(self, obj):
        return instructions_summary(obj.pickup_instructions)

    def get_dropoff_instruction_rows(self, obj):
        return instructions_summary(obj.dropoff_instructions)

    def get_requires_recipient_pin(self, obj):
        return obj.status in {"picked_up", "in_transit", "delivering"}

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")


class DeliveryCreateSerializer(serializers.Serializer):
    """Input serializer for creating a new delivery with all options."""

    # Required fields
    service_city = serializers.ChoiceField(
        choices=[(city, city) for city in MAURITANIA_DELIVERY_CITIES],
        default=DEFAULT_DELIVERY_CITY,
    )
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
    courier_type_required = serializers.ChoiceField(
        choices=[("bicycle", "Bicycle"), ("motorcycle", "Motorcycle"), ("car", "Regular")],
        required=False,
    )

    # Location coords
    pickup_lat = serializers.FloatField(default=18.0735)
    pickup_lng = serializers.FloatField(default=-15.9582)
    destination_lat = serializers.FloatField(default=18.0896)
    destination_lng = serializers.FloatField(default=-15.9754)

    # Optional fields
    package_description = serializers.CharField(required=False, allow_blank=True, default="")
    customer_notes = serializers.CharField(required=False, allow_blank=True, default="")
    pickup_instructions = serializers.JSONField(required=False, default=dict)
    dropoff_instructions = serializers.JSONField(required=False, default=dict)
    recipient_alt_phone = serializers.CharField(required=False, allow_blank=True, default="")
    save_address = serializers.BooleanField(required=False, default=False)
    save_instructions = serializers.BooleanField(required=False, default=False)
    address_label = serializers.CharField(required=False, allow_blank=True, default="")
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
    food_items = serializers.CharField(required=False, allow_blank=True, default="")
    preparation_time_minutes = serializers.IntegerField(required=False, allow_null=True)
    pharmacy_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    prescription_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    prescription_photo = serializers.ImageField(required=False, allow_null=True)
    is_urgent = serializers.BooleanField(default=False)
    is_temperature_sensitive = serializers.BooleanField(default=False)
    store_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    shopping_list = serializers.CharField(required=False, allow_blank=True, default="")
    item_quantity = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    substitution_notes = serializers.CharField(required=False, allow_blank=True, default="")
    is_secure_delivery = serializers.BooleanField(default=False)
    max_budget_mru = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    promo_code = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")

    # Multi-stop
    stops = DeliveryStopInputSerializer(many=True, required=False, default=list)

    def validate_recipient_phone(self, value):
        return normalize_mauritania_phone(value)

    def validate_recipient_name(self, value):
        return validate_person_name(value, "Recipient name")

    def validate_pickup_instructions(self, value):
        return normalize_instructions(value)

    def validate_dropoff_instructions(self, value):
        return normalize_instructions(value)

    def validate_stops(self, value):
        if len(value) > 4:
            raise serializers.ValidationError("Maximum 4 delivery stops allowed.")
        return value

    def validate(self, data):
        if data.get("is_scheduled") and not data.get("scheduled_pickup_at"):
            raise serializers.ValidationError(
                {"scheduled_pickup_at": "Pickup time is required for scheduled deliveries."}
            )
        package_type = data.get("package_type", "small")
        data["courier_type_required"] = normalize_courier_type_required(
            data.get("courier_type_required"),
            package_type,
        )

        category = normalize_service_category(data.get("service_category", "package"))
        if category in ("food", "restaurant"):
            if not (data.get("restaurant_name") or "").strip():
                raise serializers.ValidationError(
                    {"restaurant_name": "Restaurant name is required."}
                )
            if not (data.get("food_items") or "").strip():
                raise serializers.ValidationError(
                    {"food_items": "Food items are required."}
                )
        elif category == "pharmacy":
            if not (data.get("pharmacy_name") or "").strip():
                raise serializers.ValidationError(
                    {"pharmacy_name": "Pharmacy name is required."}
                )
            if not (data.get("shopping_list") or "").strip():
                raise serializers.ValidationError(
                    {"shopping_list": "Medicine list is required."}
                )
        elif category in ("grocery", "market"):
            if not (data.get("store_name") or "").strip():
                raise serializers.ValidationError(
                    {"store_name": "Store or market name is required."}
                )
            if not (data.get("shopping_list") or "").strip():
                raise serializers.ValidationError(
                    {"shopping_list": "Item list is required."}
                )
        elif category == "shopping" and not (data.get("shopping_list") or "").strip():
            raise serializers.ValidationError(
                {"shopping_list": "Shopping list is required."}
            )
        elif category == "documents" and not (data.get("package_description") or "").strip():
            raise serializers.ValidationError(
                {"package_description": "Describe the envelope or papers to deliver."}
            )
        elif category == "household" and not (data.get("shopping_list") or "").strip():
            raise serializers.ValidationError(
                {"shopping_list": "List household items to deliver."}
            )
        elif category == "business":
            has_details = (data.get("package_description") or "").strip() or (
                data.get("shopping_list") or ""
            ).strip()
            if not has_details:
                raise serializers.ValidationError(
                    {
                        "package_description": "Describe the business delivery items or parcel."
                    }
                )

        return data


class DeliveryEstimateSerializer(serializers.Serializer):
    """Input for fare estimate preview."""

    service_category = serializers.ChoiceField(choices=Delivery.SERVICE_CATEGORY_CHOICES, default="package")
    package_type = serializers.ChoiceField(choices=Delivery.PACKAGE_TYPES, default="small")
    distance_km = serializers.DecimalField(max_digits=7, decimal_places=2, default=5)
    courier_type = serializers.ChoiceField(
        choices=[("bicycle", "Bicycle"), ("motorcycle", "Motorcycle"), ("car", "Regular")],
        default="motorcycle",
    )
    is_fragile = serializers.BooleanField(default=False)
    is_urgent = serializers.BooleanField(default=False)
    weight_kg = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    promo_code = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    weather_surge_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )
    demand_surge_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )


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
    delivery_vehicle_label = serializers.SerializerMethodField()
    delivery_cities = serializers.ListField(
        child=serializers.ChoiceField(choices=[(city, city) for city in MAURITANIA_DELIVERY_CITIES]),
        allow_empty=False,
        required=False,
    )

    class Meta:
        model = DriverDeliverySettings
        fields = (
            "delivery_mode_enabled",
            "delivery_cities",
            "delivery_vehicle_type",
            "delivery_vehicle_label",
            "max_package_size",
            "accepts_food",
            "accepts_pharmacy",
            "accepts_fragile",
            "total_deliveries_completed",
            "average_delivery_time_minutes",
            "delivery_rating",
        )
        read_only_fields = (
            "delivery_vehicle_label",
            "total_deliveries_completed",
            "average_delivery_time_minutes",
            "delivery_rating",
        )

    def get_delivery_vehicle_label(self, obj):
        from .vehicle_types import get_delivery_vehicle_label

        return get_delivery_vehicle_label(obj.delivery_vehicle_type)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["delivery_cities"] = normalize_delivery_cities(instance.delivery_cities)
        return data

    def validate(self, attrs):
        from .vehicle_types import VEHICLE_DEFAULT_MAX_PACKAGE_SIZE

        if "delivery_cities" in attrs:
            attrs["delivery_cities"] = normalize_delivery_cities(attrs["delivery_cities"])

        vehicle_type = attrs.get(
            "delivery_vehicle_type",
            getattr(self.instance, "delivery_vehicle_type", "motorcycle"),
        )
        if vehicle_type in VEHICLE_DEFAULT_MAX_PACKAGE_SIZE and "max_package_size" not in attrs:
            attrs["max_package_size"] = VEHICLE_DEFAULT_MAX_PACKAGE_SIZE[vehicle_type]
        return attrs


# ─── Categories listing ───────────────────────────────────────────────────────


class ServiceCategorySerializer(serializers.Serializer):
    """Read-only serializer for listing service categories."""

    key = serializers.CharField()
    label = serializers.CharField()
    icon = serializers.CharField()
    base_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    description = serializers.CharField()
