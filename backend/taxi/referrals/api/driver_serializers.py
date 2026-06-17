from rest_framework import serializers


class DriverReferralCodeSerializer(serializers.Serializer):
    """Serializer for driver referral code response."""

    code = serializers.CharField()


class DriverReferralStatusItemSerializer(serializers.Serializer):
    """Serializer for a single referred driver's progress."""

    referee_name = serializers.CharField()
    completed_rides = serializers.IntegerField()
    ride_threshold = serializers.IntegerField()
    status = serializers.CharField()


class DriverReferralStatusResponseSerializer(serializers.Serializer):
    """Serializer for the driver referral status list response."""

    referrals = DriverReferralStatusItemSerializer(many=True)


class DriverReferralValidateRequestSerializer(serializers.Serializer):
    """Serializer for driver referral code validation request."""

    code = serializers.CharField(required=True)


class DriverReferralValidateResponseSerializer(serializers.Serializer):
    """Serializer for successful driver referral code validation response."""

    is_valid = serializers.BooleanField()
    code = serializers.CharField()


class DriverReferralValidateErrorSerializer(serializers.Serializer):
    """Serializer for failed driver referral code validation response."""

    is_valid = serializers.BooleanField()
    error_code = serializers.CharField()
    error_message = serializers.CharField()
