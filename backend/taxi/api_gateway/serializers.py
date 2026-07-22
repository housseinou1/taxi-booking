"""Phase 38 — API Gateway serializers."""

from rest_framework import serializers

from .models import APIKey, APIGatewayLog, PartnerApplication, PartnerOrganization, WebhookSubscription


class PartnerOrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartnerOrganization
        fields = [
            "id",
            "name",
            "contact_email",
            "contact_phone",
            "website",
            "status",
            "admin_user",
            "tax_id",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "status"]


class PartnerApplicationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = PartnerApplication
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "description",
            "status",
            "allowed_ips",
            "scopes",
            "rate_limit_per_minute",
            "callback_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class APIKeyListSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source="application.name", read_only=True)

    class Meta:
        model = APIKey
        fields = [
            "id",
            "application",
            "application_name",
            "name",
            "prefix",
            "revoked",
            "revoked_at",
            "grace_period_until",
            "expires_at",
            "last_used_at",
            "created_at",
        ]
        read_only_fields = fields


class APIKeySerializer(serializers.ModelSerializer):
    raw_key = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = APIKey
        fields = ["id", "application", "name", "prefix", "revoked", "expires_at", "last_used_at", "created_at", "raw_key"]
        read_only_fields = ["id", "prefix", "last_used_at", "created_at"]


class APIKeyCreateResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    api_key = serializers.CharField()
    secret = serializers.CharField()
    prefix = serializers.CharField()
    expires_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class WebhookSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookSubscription
        fields = [
            "id",
            "application",
            "url",
            "events",
            "active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class APIGatewayLogSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source="application.name", read_only=True)

    class Meta:
        model = APIGatewayLog
        fields = [
            "id",
            "application",
            "application_name",
            "method",
            "path",
            "status_code",
            "response_time_ms",
            "ip_address",
            "created_at",
        ]
        read_only_fields = fields
