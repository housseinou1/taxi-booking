from rest_framework import serializers

from .models import (
    AuditLog,
    CustomerSavedAddress,
    DeliveryVerificationEvent,
    FraudFlag,
    MerchantDocumentReview,
)


class CustomerSavedAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerSavedAddress
        fields = [
            "id",
            "label",
            "address",
            "latitude",
            "longitude",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CustomerVerificationSerializer(serializers.Serializer):
    phone_verified = serializers.BooleanField()
    email_verified = serializers.BooleanField()
    profile_photo_uploaded = serializers.BooleanField()
    rider_status = serializers.CharField()
    verification_complete = serializers.BooleanField()
    missing_steps = serializers.ListField(child=serializers.CharField())


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor_email",
            "action",
            "entity_type",
            "entity_id",
            "summary",
            "details",
            "created_at",
        ]

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else "system"


class FraudFlagSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)

    class Meta:
        model = FraudFlag
        fields = [
            "id",
            "user",
            "user_email",
            "reason",
            "reason_display",
            "status",
            "severity",
            "description",
            "related_delivery_id",
            "metadata",
            "review_notes",
            "reviewed_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "reviewed_at"]


class DeliveryVerificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryVerificationEvent
        fields = ["id", "event_type", "success", "metadata", "created_at"]


class MerchantDocumentReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantDocumentReview
        fields = [
            "business_license_status",
            "owner_id_status",
            "logo_status",
            "store_photo_status",
            "business_license_notes",
            "owner_id_notes",
            "logo_notes",
            "store_photo_notes",
            "updated_at",
        ]
