"""
Driver QR Code Verification API Views

Provides endpoints for QR code verification and driver QR code retrieval.

POST /api/v1/verify-driver/
    - Validates the token signature
    - Looks up the DriverProfile by qr_code_uuid
    - Checks driver approval status
    - Returns appropriate response based on status
    - Creates a VerificationRecord for audit purposes

GET /drivers/me/qr-code/
    - Returns the authenticated driver's QR code details

POST /api/v1/admin/drivers/{id}/regenerate-qr/
    - Admin-only endpoint to regenerate a driver's QR code

GET /api/v1/admin/drivers/{id}/verification-history/
    - Admin-only endpoint to view driver verification history

GET /api/v1/admin/riders/{id}/verification-history/
    - Admin-only endpoint to view rider verification history

Requirements: 2.1, 2.3, 2.4, 2.5, 4.3, 4.4, 4.5, 4.7, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 7.5
"""

import logging

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile, VerificationRecord
from .serializers_verification import (
    VerificationRecordSerializer,
    VerifyDriverRequestSerializer,
    VerifyDriverResponseSerializer,
)
from .services.qr_service import QRCodeService, QRGenerationError

User = get_user_model()

logger = logging.getLogger(__name__)


class VerifyDriverView(APIView):
    """
    POST /api/v1/verify-driver/

    Verify a driver's identity by validating a scanned QR code token.

    Requires rider authentication.

    Response statuses:
    - "verified": Driver is approved; full info returned.
    - "inactive_driver": Driver is revoked/suspended/rejected; limited info returned.
    - "invalid_code": Token is malformed or QR UUID not found.
    - "forged_code": Token signature verification failed.

    Requirements: 2.1, 2.3, 2.4, 2.5, 4.3, 4.4, 4.5, 4.7, 7.4, 7.5
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        request_serializer = VerifyDriverRequestSerializer(data=request.data)
        if not request_serializer.is_valid():
            return Response(
                request_serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = request_serializer.validated_data["token"]
        qr_service = QRCodeService()

        # Step 1: Validate token signature
        payload = qr_service.verify_signed_token(token)

        if payload is None:
            # Determine if the token is malformed or has a bad signature
            # A token with a dot but invalid signature is "forged_code"
            # A token without proper structure is "invalid_code"
            scan_result = self._determine_invalid_token_type(token, qr_service)
            response_data = self._build_error_response(scan_result)

            # Try to create a VerificationRecord if we can extract a driver
            self._try_create_verification_record(
                rider=request.user,
                token=token,
                scan_result=scan_result,
                qr_service=qr_service,
            )

            serializer = VerifyDriverResponseSerializer(data=response_data)
            serializer.is_valid(raise_exception=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Step 2: Lookup DriverProfile by qr_code_uuid
        qr_uuid = payload.get("uuid")
        try:
            driver_profile = DriverProfile.objects.select_related("user").get(
                qr_code_uuid=qr_uuid
            )
        except DriverProfile.DoesNotExist:
            # Valid signature but UUID not found (e.g., after regeneration)
            response_data = self._build_error_response("invalid_code")
            serializer = VerifyDriverResponseSerializer(data=response_data)
            serializer.is_valid(raise_exception=True)
            # Cannot create VerificationRecord without a valid driver
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Step 3: Check approval status and build response
        if driver_profile.status == "approved":
            response_data = self._build_verified_response(driver_profile)
            scan_result = "verified"
        else:
            # Revoked, suspended, rejected, or any non-approved status
            response_data = self._build_inactive_response(driver_profile)
            scan_result = "inactive_driver"

        # Step 4: Create VerificationRecord
        VerificationRecord.objects.create(
            rider=request.user,
            driver=driver_profile,
            scan_result=scan_result,
        )

        serializer = VerifyDriverResponseSerializer(data=response_data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _determine_invalid_token_type(self, token: str, qr_service: QRCodeService) -> str:
        """
        Determine if an invalid token is malformed (invalid_code) or
        has a failed signature (forged_code).

        A token that has the correct structure (payload.signature) but
        fails signature verification is considered forged.
        A completely malformed token is invalid.
        """
        if not token or "." not in token:
            return "invalid_code"

        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return "invalid_code"

        payload_b64, signature = parts

        # If it has the structure but signature doesn't match, it's forged
        if payload_b64 and signature:
            # Try to decode the payload to see if it's valid base64 JSON
            import base64
            import json

            try:
                payload_json = base64.urlsafe_b64decode(
                    payload_b64.encode()
                ).decode()
                payload = json.loads(payload_json)
                if isinstance(payload, dict) and "uuid" in payload and "driver_code" in payload:
                    # Token has valid structure but bad signature → forged
                    return "forged_code"
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
                pass

        return "invalid_code"

    def _build_verified_response(self, driver_profile: DriverProfile) -> dict:
        """Build response for an approved/verified driver with full info."""
        user = driver_profile.user
        driver_name = user.get_full_name() or user.email

        # Get photo URL
        driver_photo = None
        if driver_profile.driver_photo:
            driver_photo = driver_profile.driver_photo.url

        return {
            "status": "verified",
            "driver_name": driver_name,
            "driver_code": driver_profile.driver_code,
            "driver_photo": driver_photo,
            "vehicle_make": driver_profile.vehicle_make,
            "vehicle_model": driver_profile.vehicle_model,
            "vehicle_color": driver_profile.vehicle_color,
            "plate_number": driver_profile.plate_number,
        }

    def _build_inactive_response(self, driver_profile: DriverProfile) -> dict:
        """Build response for an inactive (revoked/suspended/rejected) driver."""
        user = driver_profile.user
        driver_name = user.get_full_name() or user.email

        return {
            "status": "inactive_driver",
            "driver_name": driver_name,
            "driver_code": driver_profile.driver_code,
            "driver_photo": None,
            "vehicle_make": None,
            "vehicle_model": None,
            "vehicle_color": None,
            "plate_number": None,
        }

    def _build_error_response(self, scan_result: str) -> dict:
        """Build response for invalid or forged tokens."""
        return {
            "status": scan_result,
            "driver_name": None,
            "driver_code": None,
            "driver_photo": None,
            "vehicle_make": None,
            "vehicle_model": None,
            "vehicle_color": None,
            "plate_number": None,
        }

    def _try_create_verification_record(
        self, rider, token: str, scan_result: str, qr_service: QRCodeService
    ):
        """
        Attempt to create a VerificationRecord for invalid/forged tokens.

        Only creates a record if the driver can be resolved from the token
        payload (even if the signature is invalid), since the VerificationRecord
        model requires a non-null driver FK.
        """
        import base64
        import json

        if not token or "." not in token:
            return

        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return

        payload_b64 = parts[0]

        try:
            payload_json = base64.urlsafe_b64decode(
                payload_b64.encode()
            ).decode()
            payload = json.loads(payload_json)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return

        if not isinstance(payload, dict) or "uuid" not in payload:
            return

        qr_uuid = payload["uuid"]
        try:
            driver_profile = DriverProfile.objects.get(qr_code_uuid=qr_uuid)
            VerificationRecord.objects.create(
                rider=rider,
                driver=driver_profile,
                scan_result=scan_result,
            )
        except DriverProfile.DoesNotExist:
            # Cannot create record without a valid driver
            pass


class DriverQRCodeView(APIView):
    """
    GET /drivers/me/qr-code/

    Returns the authenticated driver's QR code details including:
    - qr_code_uuid
    - qr_code_image (absolute URL)
    - driver_code
    - generated_at timestamp

    If the driver does not have a QR code assigned, returns 404 with message
    "QR code is not yet available".

    This endpoint is read-only; drivers cannot modify QR code fields.

    Requirements: 3.1, 3.4, 3.5, 7.1, 7.2, 7.7
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            driver_profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not driver_profile.qr_code_uuid:
            return Response(
                {"detail": "QR code is not yet available"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Build the QR code image URL
        qr_code_image_url = None
        if driver_profile.qr_code_image:
            qr_code_image_url = request.build_absolute_uri(
                driver_profile.qr_code_image.url
            )

        return Response(
            {
                "qr_code_uuid": driver_profile.qr_code_uuid,
                "qr_code_image": qr_code_image_url,
                "driver_code": driver_profile.driver_code,
                "generated_at": driver_profile.qr_code_generated_at,
            },
            status=status.HTTP_200_OK,
        )


class VerificationHistoryPagination(PageNumberPagination):
    """Pagination for verification history: 50 records per page."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminRegenerateQRCodeView(APIView):
    """
    POST /api/v1/admin/drivers/{id}/regenerate-qr/

    Admin-only endpoint to regenerate a driver's QR code.
    Calls QRCodeService.regenerate_qr_code() which:
    - Generates a new unique QR code (up to 5 attempts)
    - Invalidates the old QR code
    - Creates a QRCodeAuditLog entry

    Requirements: 5.3, 5.4, 5.5, 5.6, 5.7
    """

    permission_classes = [IsAdminUser]

    def post(self, request, driver_id):
        try:
            driver_profile = DriverProfile.objects.get(pk=driver_id)
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not driver_profile.qr_code_uuid:
            return Response(
                {"error": "Driver does not have a QR code to regenerate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qr_service = QRCodeService()

        try:
            new_qr_uuid, new_image_path = qr_service.regenerate_qr_code(
                driver_profile, admin_user=request.user
            )
        except QRGenerationError:
            return Response(
                {
                    "error": "Regeneration failed. Existing QR code unchanged.",
                    "error_code": "QR_GENERATION_FAILED",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "message": "QR code regenerated successfully.",
                "qr_code_uuid": new_qr_uuid,
                "qr_code_image": new_image_path,
            },
            status=status.HTTP_200_OK,
        )


class AdminDriverVerificationHistoryView(APIView):
    """
    GET /api/v1/admin/drivers/{id}/verification-history/

    Admin-only endpoint to view paginated verification history for a driver.
    Returns 50 records per page, sorted by timestamp descending.

    Requirements: 6.1, 6.2, 6.3, 6.5
    """

    permission_classes = [IsAdminUser]

    def get(self, request, driver_id):
        try:
            driver_profile = DriverProfile.objects.get(pk=driver_id)
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        queryset = VerificationRecord.objects.filter(
            driver=driver_profile
        ).select_related("rider", "driver__user").order_by("-scanned_at")

        if not queryset.exists():
            return Response(
                {
                    "message": "No verification history exists for this driver.",
                    "results": [],
                    "count": 0,
                },
                status=status.HTTP_200_OK,
            )

        paginator = VerificationHistoryPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = VerificationRecordSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AdminRiderVerificationHistoryView(APIView):
    """
    GET /api/v1/admin/riders/{id}/verification-history/

    Admin-only endpoint to view paginated verification scans performed by a rider.
    Returns 50 records per page, sorted by timestamp descending.

    Requirements: 6.1, 6.4, 6.5
    """

    permission_classes = [IsAdminUser]

    def get(self, request, rider_id):
        try:
            rider = User.objects.get(pk=rider_id)
        except User.DoesNotExist:
            return Response(
                {"error": "Rider not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        queryset = VerificationRecord.objects.filter(
            rider=rider
        ).select_related("rider", "driver__user").order_by("-scanned_at")

        if not queryset.exists():
            return Response(
                {
                    "message": "No verification history exists for this rider.",
                    "results": [],
                    "count": 0,
                },
                status=status.HTTP_200_OK,
            )

        paginator = VerificationHistoryPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = VerificationRecordSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
