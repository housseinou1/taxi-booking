from rest_framework import serializers

from .models import (
    DriverPayoutMethod,
    Payment,
    RiderPaymentMethod,
    WithdrawalRequest,
)


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
            "display_name",
            "created_at",
        ]
        read_only_fields = ["id", "driver", "display_name", "created_at"]

    def get_display_name(self, obj):
        return str(obj)


class WithdrawalRequestSerializer(serializers.ModelSerializer):
    driver = serializers.EmailField(source="driver.email", read_only=True)
    driver_name = serializers.SerializerMethodField()
    payout_method_display = serializers.SerializerMethodField()

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "driver", "driver_name", "status", "created_at", "updated_at"]

    def get_driver_name(self, obj):
        return f"{obj.driver.first_name} {obj.driver.last_name}".strip() or obj.driver.email

    def get_payout_method_display(self, obj):
        return str(obj.payout_method) if obj.payout_method else "No payout method"
