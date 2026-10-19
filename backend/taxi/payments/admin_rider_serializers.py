"""Admin-only, read-only serializers for the rider payment-history endpoint.

These are NEW, additive serializers used solely by the admin rider
payment-history view. They deliberately expose a minimal, explicit field set
and NEVER include payment tokens or full card data.

Payment has no provider_token/card fields at all; PaymentRecord DOES carry a
provider_token, so RefundRequest (which relates to PaymentRecord) must never
serialize that relation beyond the single derived `currency` value.
"""

from rest_framework import serializers

from .models import Payment, RefundRequest


class AdminRiderPaymentSerializer(serializers.ModelSerializer):
    """Trimmed Payment serializer for admin rider payment history.

    Exposes ONLY the whitelisted fields below. No provider_token (Payment has
    none anyway) and no card fields are ever included.
    """

    class Meta:
        model = Payment
        fields = [
            "transaction_id",
            "ride_id",
            "amount",
            "currency",
            "method",
            "status",
            "created_at",
        ]
        read_only_fields = fields


class AdminRiderRefundSerializer(serializers.ModelSerializer):
    """Trimmed RefundRequest serializer for admin rider payment history.

    `currency` is derived from the related PaymentRecord (defaulting to 'MRU'
    when the relation is missing). The PaymentRecord itself — including its
    provider_token — is never serialized.
    """

    currency = serializers.SerializerMethodField()

    class Meta:
        model = RefundRequest
        fields = [
            "id",
            "amount",
            "currency",
            "reason",
            "status",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = fields

    def get_currency(self, obj):
        if obj.payment_record:
            return obj.payment_record.currency
        return "MRU"
