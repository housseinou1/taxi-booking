"""
Document Center API endpoints for the Premium Driver App.

Provides:
- GET  /drivers/me/documents/           - List all driver documents with status and expiration
- POST /drivers/me/documents/upload/    - Upload a document (validates format and size)
- POST /admin/documents/{id}/approve/   - Admin approve a document
- POST /admin/documents/{id}/reject/    - Admin reject a document with reason

Requirements: 8.1, 8.2, 8.3, 8.6
"""

from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from django.shortcuts import get_object_or_404

from .api.serializers import DriverDocumentSerializer
from .models import DriverDocument, DriverProfile
from .services.document_service import DocumentService


class DriverDocumentListView(APIView):
    """
    GET /drivers/me/documents/

    Returns all documents for the authenticated driver, including
    status, expiration info, and days until expiry.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        documents = DriverDocument.objects.filter(driver=profile).order_by(
            "document_type", "-uploaded_at"
        )

        serializer = DriverDocumentSerializer(documents, many=True)

        # Also include expiration warnings and alerts
        service = DocumentService()
        expiring = service.get_expiring_documents(profile)
        alerts = service.get_expired_or_missing(profile)

        return Response(
            {
                "documents": serializer.data,
                "expiring_documents": expiring,
                "alerts": [
                    {
                        "document_type": alert.document_type,
                        "reason": alert.reason,
                        "expires_at": (
                            alert.expires_at.isoformat() if alert.expires_at else None
                        ),
                    }
                    for alert in alerts
                ],
            },
            status=status.HTTP_200_OK,
        )


class DriverDocumentUploadView(APIView):
    """
    POST /drivers/me/documents/upload/

    Upload a driver document. Validates file format (JPEG, PNG, PDF)
    and size (max 10 MB). Sets status to pending_review.

    Request body (multipart/form-data):
        - document_type: one of license, national_id, insurance,
                         carte_grise, vignette, profile_photo
        - file: the document file
        - issued_at: issue date in YYYY-MM-DD format (required for license)
        - expires_at: (optional) expiration date in YYYY-MM-DD format
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        document_type = request.data.get("document_type")
        file = request.FILES.get("file")
        issued_at_raw = request.data.get("issued_at") or None
        expires_at_raw = request.data.get("expires_at") or None

        def parse_date(value, field_name):
            if not value:
                return None
            from datetime import date as date_type

            if isinstance(value, date_type):
                return value

            from datetime import datetime

            try:
                return datetime.strptime(str(value), "%Y-%m-%d").date()
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"Invalid {field_name} format. Use YYYY-MM-DD."
                ) from exc

        try:
            issued_at = parse_date(issued_at_raw, "issued_at")
            expires_at = parse_date(expires_at_raw, "expires_at")
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not document_type:
            return Response(
                {"error": "document_type is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not file:
            return Response(
                {"error": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DocumentService()

        # Validate the file format and size
        validation = service.validate_upload(file)
        if not validation.valid:
            return Response(
                {"error": validation.error},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Upload the document
        try:
            document = service.upload_document(
                driver=profile,
                document_type=document_type,
                file=file,
                issued_at=issued_at,
                expires_at=expires_at,
            )
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DriverDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AdminDocumentApproveView(APIView):
    """
    POST /admin/documents/{id}/approve/

    Admin endpoint to approve a driver document.
    Updates status to 'approved' and notifies the driver.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, document_id):
        document = get_object_or_404(DriverDocument, id=document_id)

        if document.status == "approved":
            return Response(
                {"error": "Document is already approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DocumentService()
        document = service.approve_document(document, reviewer=request.user)

        serializer = DriverDocumentSerializer(document)
        return Response(
            {
                "message": "Document approved successfully.",
                "document": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AdminDocumentRejectView(APIView):
    """
    POST /admin/documents/{id}/reject/

    Admin endpoint to reject a driver document with a reason.
    Updates status to 'rejected' and notifies the driver.

    Request body (JSON):
        - reason: (required) the reason for rejection
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, document_id):
        document = get_object_or_404(DriverDocument, id=document_id)

        reason = request.data.get("reason", "").strip()
        if not reason:
            return Response(
                {"error": "A rejection reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if document.status == "rejected":
            return Response(
                {"error": "Document is already rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DocumentService()
        document = service.reject_document(
            document, reviewer=request.user, reason=reason
        )

        serializer = DriverDocumentSerializer(document)
        return Response(
            {
                "message": "Document rejected.",
                "document": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
