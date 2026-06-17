"""
Serializers for Driver QR Code Verification

Provides request/response serializers for QR code scanning and verification,
verification history records, and QR code regeneration audit logging.

Requirements: 2.1, 2.3, 2.4, 2.5, 4.3, 4.4, 4.5, 4.7, 7.4, 7.5
"""

from rest_framework import serializers

from .models import QRCodeAuditLog, VerificationRecord


class VerifyDriverRequestSerializer(serializers.Serializer):
    """Serializer for the QR code verification request payload."""

    token = serializers.CharField(max_length=512)


class VerifyDriverResponseSerializer(serializers.Serializer):
    """
    Serializer for the QR code verification response.

    Returns different levels of information depending on the verification status:
    - verified: full driver info including vehicle details
    - inactive_driver: limited info (name, driver_code) without vehicle details
    - invalid_code: status only, all other fields null
    - forged_code: status only, all other fields null
    """

    status = serializers.ChoiceField(
        choices=["verified", "inactive_driver", "invalid_code", "forged_code"]
    )
    driver_name = serializers.CharField(allow_null=True)
    driver_code = serializers.CharField(allow_null=True)
    driver_photo = serializers.URLField(allow_null=True)
    vehicle_make = serializers.CharField(allow_null=True)
    vehicle_model = serializers.CharField(allow_null=True)
    vehicle_color = serializers.CharField(allow_null=True)
    plate_number = serializers.CharField(allow_null=True)


class VerificationRecordSerializer(serializers.ModelSerializer):
    """Serializer for verification history records."""

    rider_name = serializers.CharField(
        source="rider.get_full_name", read_only=True
    )
    driver_name = serializers.CharField(
        source="driver.user.get_full_name", read_only=True
    )

    class Meta:
        model = VerificationRecord
        fields = ["id", "rider_name", "driver_name", "scanned_at", "scan_result"]


class QRCodeRegenerationLogSerializer(serializers.ModelSerializer):
    """Serializer for QR code regeneration audit log entries."""

    class Meta:
        model = QRCodeAuditLog
        fields = ["id", "admin", "driver", "action", "performed_at"]
