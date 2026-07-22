from rest_framework import serializers

from .models import (
    DriverPayoutMethod,
    MerchantWithdrawalRequest,
    OwnerPayoutMethod,
    Payment,
    PaymentRecord,
    RefundRequest,
    RiderPaymentMethod,
    WithdrawalRequest,
    WalletAccount,
    WalletTransaction,
)
from .withdrawal_service import normalize_payout_type
from security.models import AuditLog


class RiderPaymentMethodSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = RiderPaymentMethod

        fields = [
            "id",
            "rider",
            "payment_type",
            "card_holder_name",
            "card_type",
            "card_last4",
            "expiry_month",
            "expiry_year",
            "bank_name",
            "account_reference",
            "phone_number",
            "wallet_id",
            "is_default",
            "display_name",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "rider",
            "display_name",
            "created_at",
        ]

    def get_display_name(self, obj):
        return str(obj)


class PaymentSerializer(serializers.ModelSerializer):
    rider_email = serializers.EmailField(
        source="rider.email",
        read_only=True,
    )

    class Meta:
        model = Payment

        fields = [
            "id",
            "rider",
            "rider_email",
            "ride_id",
            "amount",
            "app_fee",
            "tip_percentage",
            "tip_amount",
            "driver_earning",
            "currency",
            "method",
            "status",
            "transaction_id",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "rider",
            "rider_email",
            "status",
            "transaction_id",
            "created_at",
        ]


class DriverPayoutMethodSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    masked_account = serializers.SerializerMethodField()

    class Meta:
        model = DriverPayoutMethod
        fields = [
            "id",
            "driver",
            "payout_type",
            "account_holder_name",
            "bank_name",
            "account_reference",
            "card_type",
            "card_last4",
            "phone_number",
            "wallet_id",
            "is_default",
            "is_verified",
            "verified_at",
            "display_name",
            "masked_account",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "driver", "display_name", "masked_account", "is_verified",
            "verified_at", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        payout_type = normalize_payout_type(
            attrs.get("payout_type") or getattr(self.instance, "payout_type", None)
        )
        attrs["payout_type"] = payout_type

        if payout_type == "card":
            raise serializers.ValidationError(
                "Card withdrawals are not supported."
            )

        if payout_type == "bank_account":
            if not attrs.get("bank_name") or not attrs.get("account_reference"):
                raise serializers.ValidationError(
                    "Bank name and account number are required for bank account payouts."
                )

        if payout_type in ["bankily", "masrvi", "seddad"]:
            if not attrs.get("phone_number") and not attrs.get("wallet_id"):
                raise serializers.ValidationError(
                    "Phone number is required for mobile money withdrawals."
                )

        return attrs

    def get_display_name(self, obj):
        return str(obj)

    def get_masked_account(self, obj):
        value = obj.phone_number or obj.wallet_id or obj.account_reference or ""
        if not value:
            return ""
        if len(value) <= 4:
            return value
        return f"•••• {value[-4:]}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Keep raw phone_number/account_reference/wallet_id so the owner can edit
        # their own payout method. masked_account is available for display.
        data["masked_account"] = self.get_masked_account(instance)
        return data


class WithdrawalRequestSerializer(serializers.ModelSerializer):
    driver = serializers.EmailField(source="driver.email", read_only=True)
    driver_name = serializers.SerializerMethodField()
    payout_method_display = serializers.SerializerMethodField()
    approved_by_email = serializers.EmailField(source="approved_by.email", read_only=True, default=None)
    paid_by_email = serializers.EmailField(source="paid_by.email", read_only=True, default=None)
    audit_history = serializers.SerializerMethodField()

    class Meta:
        model = WithdrawalRequest
        fields = [
            "id",
            "driver",
            "driver_name",
            "payout_method",
            "payout_method_display",
            "amount",
            "currency",
            "status",
            "note",
            "admin_note",
            "approved_at",
            "paid_at",
            "approved_by_email",
            "paid_by_email",
            "reference",
            "payment_reference",
            "idempotency_key",
            "created_at",
            "updated_at",
            "audit_history",
        ]
        read_only_fields = [
            "id",
            "driver",
            "driver_name",
            "payout_method_display",
            "approved_by_email",
            "paid_by_email",
            "status",
            "reference",
            "payment_reference",
            "idempotency_key",
            "created_at",
            "updated_at",
            "audit_history",
        ]

    def get_audit_history(self, obj):
        logs = AuditLog.objects.filter(
            entity_type="payment",
            entity_id=str(obj.id),
        ).order_by("-created_at")[:20]
        return [
            {
                "action": log.action,
                "summary": log.summary,
                "actor": log.actor.email if log.actor else "system",
                "created_at": log.created_at.isoformat(),
                "details": log.details,
            }
            for log in logs
        ]

    def get_driver_name(self, obj):
        return f"{obj.driver.first_name} {obj.driver.last_name}".strip() or obj.driver.email

    def get_payout_method_display(self, obj):
        if not obj.payout_method:
            return "No payout method"
        method = obj.payout_method
        if method.payout_type == "bank_account":
            value = method.account_reference or ""
            masked = f"•••• {value[-4:]}" if len(value) > 4 else value
            return f"{method.bank_name} - {masked}"
        value = method.phone_number or method.wallet_id or ""
        masked = f"•••• {value[-4:]}" if len(value) > 4 else value
        return f"{method.payout_type.upper()} - {masked}"


class OwnerPayoutMethodSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = OwnerPayoutMethod
        fields = [
            "id",
            "owner",
            "payout_type",
            "account_holder_name",
            "bank_name",
            "account_reference",
            "phone_number",
            "wallet_id",
            "is_default",
            "display_name",
            "created_at",
        ]
        read_only_fields = ["id", "owner", "display_name", "created_at"]

    def validate(self, attrs):
        payout_type = attrs.get("payout_type")

        if payout_type == "bank_account":
            if not attrs.get("bank_name") or not attrs.get("account_reference"):
                raise serializers.ValidationError(
                    "Bank name and account number/RIB are required for owner payout."
                )

        if payout_type in ["bankily", "masrvi", "seddad"]:
            if not attrs.get("phone_number") and not attrs.get("wallet_id"):
                raise serializers.ValidationError(
                    "Phone number or wallet ID is required for owner mobile money payout."
                )

        return attrs

    def get_display_name(self, obj):
        return str(obj)


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = "__all__"
        read_only_fields = ["wallet", "balance_after", "created_at"]


class WalletAccountSerializer(serializers.ModelSerializer):
    available_balance = serializers.SerializerMethodField()
    pending_balance = serializers.SerializerMethodField()
    lifetime_earnings = serializers.SerializerMethodField()

    class Meta:
        model = WalletAccount
        fields = [
            "id",
            "balance",
            "available_balance",
            "pending_balance",
            "lifetime_earnings",
            "currency",
            "is_active",
            "updated_at",
        ]

    def get_available_balance(self, obj):
        from .withdrawal_service import driver_available_balance

        return str(driver_available_balance(obj.owner))

    def get_pending_balance(self, obj):
        from .withdrawal_service import driver_reserved_withdrawals

        return str(driver_reserved_withdrawals(obj.owner))

    def get_lifetime_earnings(self, obj):
        from .withdrawal_service import driver_total_earned

        return str(driver_total_earned(obj.owner))


class PaymentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentRecord
        fields = (
            "id",
            "source",
            "customer",
            "courier",
            "merchant",
            "ride_id",
            "delivery",
            "merchant_order",
            "amount",
            "promo_discount",
            "method",
            "status",
            "payment_timing",
            "transaction_id",
            "app_fee",
            "courier_earning",
            "merchant_earning",
            "currency",
            "created_at",
        )


class RefundRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefundRequest
        fields = (
            "id",
            "payment_record",
            "customer",
            "amount",
            "reason",
            "status",
            "note",
            "admin_note",
            "fraud_flag",
            "created_at",
            "resolved_at",
        )


class MerchantWithdrawalRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantWithdrawalRequest
        fields = (
            "id",
            "merchant",
            "amount",
            "status",
            "note",
            "admin_note",
            "reference",
            "created_at",
            "paid_at",
        )
