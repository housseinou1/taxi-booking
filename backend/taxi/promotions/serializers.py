import re

from decimal import Decimal

from rest_framework import serializers

from promotions.models import PromoCode, ReferralCode


# --- Admin serializers ---


class PromoCodeAdminSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for admin promo code management."""

    class Meta:
        model = PromoCode
        fields = [
            "id",
            "code",
            "discount_type",
            "discount_value",
            "start_date",
            "end_date",
            "max_total_uses",
            "max_per_rider_uses",
            "min_fare",
            "city",
            "first_ride_only",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_code(self, value):
        """Validate code format: alphanumeric, hyphens, underscores, 3-30 chars."""
        pattern = r"^[A-Za-z0-9_-]{3,30}$"
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                detail="Code must be 3-30 characters, alphanumeric, hyphens, or underscores only.",
                code="invalid_code_format",
            )

        # Check case-insensitive uniqueness
        queryset = PromoCode.objects.filter(code=value.upper())
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                detail="A promo code with this code already exists.",
                code="code_exists",
            )

        return value

    def validate(self, attrs):
        """Cross-field validation for dates and discount values."""
        # Determine effective values (use instance values for partial updates)
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        discount_type = attrs.get("discount_type")
        discount_value = attrs.get("discount_value")

        if self.instance:
            if start_date is None:
                start_date = self.instance.start_date
            if end_date is None:
                end_date = self.instance.end_date
            if discount_type is None:
                discount_type = self.instance.discount_type
            if discount_value is None:
                discount_value = self.instance.discount_value

        # Validate end_date > start_date
        if start_date and end_date and end_date <= start_date:
            raise serializers.ValidationError(
                detail={"end_date": "End date must be after start date."},
                code="invalid_date_range",
            )

        # Validate discount value based on type
        if discount_type == "percentage" and discount_value is not None:
            if discount_value < 1 or discount_value > 100:
                raise serializers.ValidationError(
                    detail={
                        "discount_value": "Percentage must be between 1 and 100."
                    },
                    code="invalid_percentage",
                )

        if discount_type == "fixed" and discount_value is not None:
            if discount_value <= 0:
                raise serializers.ValidationError(
                    detail={
                        "discount_value": "Fixed discount amount must be greater than zero."
                    },
                    code="invalid_amount",
                )

        return attrs


class PromoCodeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views with usage stats."""

    total_uses = serializers.IntegerField(read_only=True)

    class Meta:
        model = PromoCode
        fields = [
            "id",
            "code",
            "discount_type",
            "discount_value",
            "status",
            "start_date",
            "end_date",
            "first_ride_only",
            "city",
            "total_uses",
            "max_total_uses",
        ]


# --- Rider-facing serializers ---


class PromoCodeValidateSerializer(serializers.Serializer):
    """Input serializer for promo code validation (preview discount)."""

    code = serializers.CharField(required=True)
    estimated_fare = serializers.DecimalField(
        required=True, max_digits=10, decimal_places=2, min_value=Decimal("0.01")
    )


class PromoCodeValidateResponseSerializer(serializers.Serializer):
    """Output serializer for promo code validation response."""

    valid = serializers.BooleanField()
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    final_fare = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_type = serializers.CharField(allow_null=True)
    error_code = serializers.CharField(allow_null=True)
    message = serializers.CharField(allow_null=True)


class PromoCodeApplySerializer(serializers.Serializer):
    """Input serializer for applying a promo code to a ride."""

    code = serializers.CharField(required=True)
    ride_id = serializers.IntegerField(required=True)


class PromoCodeApplyResponseSerializer(serializers.Serializer):
    """Output serializer for promo code application response."""

    success = serializers.BooleanField()
    original_fare = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    final_fare = serializers.DecimalField(max_digits=10, decimal_places=2)
    error_code = serializers.CharField(allow_null=True)
    message = serializers.CharField(allow_null=True)


class ReferralCodeSerializer(serializers.ModelSerializer):
    """Output serializer for a rider's referral code."""

    share_url = serializers.SerializerMethodField()

    class Meta:
        model = ReferralCode
        fields = ("code", "share_url")

    def get_share_url(self, obj):
        """Return a shareable URL for the referral code (placeholder)."""
        return f"https://yala.app/referral/{obj.code}"


# --- Analytics serializers ---


class PromoCodeAnalyticsSerializer(serializers.Serializer):
    """Analytics response for a specific promo code."""

    total_redemptions = serializers.IntegerField()
    total_discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    unique_riders = serializers.IntegerField()


class OverallAnalyticsSerializer(serializers.Serializer):
    """Overall promo analytics response with date range filtering."""

    total_promotional_spend = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_redemptions = serializers.IntegerField()
    unique_codes_used = serializers.IntegerField()
    date_range_start = serializers.DateTimeField(allow_null=True)
    date_range_end = serializers.DateTimeField(allow_null=True)
