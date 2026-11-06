"""Admin-only, read-only serializer for the driver payout-history endpoint.

This is a NEW, additive serializer used solely by the admin driver
payout-history view. It deliberately exposes a minimal, explicit field set and
NEVER serializes the related DriverPayoutMethod as a nested object, a
PaymentRecord, a provider_token, or a full card / PAN.

Only a derived, redacted `payout_method_label` is exposed (e.g. "card ****1234"
or "bankily 22200000"). It mirrors the whitelist discipline of
admin_rider_serializers.py.
"""

from rest_framework import serializers

from .models import WithdrawalRequest


class AdminDriverWithdrawalSerializer(serializers.ModelSerializer):
    """Trimmed WithdrawalRequest serializer for admin driver payout history.

    Exposes ONLY the whitelisted fields below plus a derived, redacted
    `payout_method_label`. The related DriverPayoutMethod is never serialized
    as a nested object; no provider_token or full card/PAN is ever included.
    """

    payout_method_label = serializers.SerializerMethodField()

    class Meta:
        model = WithdrawalRequest
        fields = [
            "id",
            "amount",
            "currency",
            "status",
            "note",
            "admin_note",
            "approved_at",
            "paid_at",
            "created_at",
            "payout_method_label",
        ]
        read_only_fields = fields

    def get_payout_method_label(self, obj):
        method = obj.payout_method
        if method is None:
            return None

        payout_type = method.payout_type or ""

        if payout_type == "card":
            return f"card ****{method.card_last4}"

        if payout_type == "bank_account":
            return f"{payout_type} {method.bank_name}".strip()

        if payout_type in ("bankily", "masrvi", "seddad"):
            handle = method.phone_number or method.wallet_id or ""
            return f"{payout_type} {handle}".strip()

        return payout_type or None
