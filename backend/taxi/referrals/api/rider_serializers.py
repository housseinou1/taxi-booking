from rest_framework import serializers


class RiderReferralInfoSerializer(serializers.Serializer):
    """Serializer for rider referral code and statistics."""

    code = serializers.CharField()
    successful_referrals = serializers.IntegerField()
    total_credits_earned = serializers.DecimalField(
        max_digits=10, decimal_places=2
    )


class RiderShareContentSerializer(serializers.Serializer):
    """Serializer for shareable referral message."""

    code = serializers.CharField()
    message = serializers.CharField()


class RiderReferralValidateRequestSerializer(serializers.Serializer):
    """Serializer for referral code validation request."""

    code = serializers.CharField(required=True)


class RiderReferralValidateResponseSerializer(serializers.Serializer):
    """Serializer for successful referral code validation response."""

    is_valid = serializers.BooleanField()
    code = serializers.CharField()


class RiderReferralValidateErrorSerializer(serializers.Serializer):
    """Serializer for failed referral code validation response."""

    is_valid = serializers.BooleanField()
    error_code = serializers.CharField()
    error_message = serializers.CharField()
