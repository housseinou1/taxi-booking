from rest_framework import serializers

from referrals.models import FlaggedReferral, RewardConfiguration


class RewardConfigurationSerializer(serializers.ModelSerializer):
    """Serializer for viewing/updating the active RewardConfiguration.

    Includes all 9 configurable fields plus read-only metadata.
    """

    class Meta:
        model = RewardConfiguration
        fields = [
            "rider_referrer_credit",
            "rider_referee_credit",
            "driver_bonus_amount",
            "driver_ride_threshold",
            "rider_credit_cap_count",
            "rider_credit_cap_days",
            "driver_bonus_cap_count",
            "driver_bonus_cap_days",
            "credit_expiration_days",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["updated_at", "updated_by"]


class FlaggedReferralSerializer(serializers.ModelSerializer):
    """Serializer for the paginated list of flagged referrals."""

    referrer = serializers.EmailField(source="referrer.email", read_only=True)
    referee = serializers.EmailField(source="referee.email", read_only=True)
    resolved_by = serializers.EmailField(
        source="resolved_by.email", read_only=True, allow_null=True
    )

    class Meta:
        model = FlaggedReferral
        fields = [
            "id",
            "referrer",
            "referee",
            "reason",
            "status",
            "flagged_at",
            "resolved_at",
            "resolved_by",
            "escalated_at",
        ]
        read_only_fields = fields
