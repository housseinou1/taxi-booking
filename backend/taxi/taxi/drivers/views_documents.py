"""
Document Center API endpoints for the Premium Driver App.

Provides:
- GET  /drivers/me/documents/           - List all driver documents with status and expiration
- POST /drivers/me/documents/upload/    - Upload a document (validates format and size)
- POST /admin/documents/{id}/approve/   - Admin approve a document
- POST /admin/documents/{id}/reject/    - Admin reject a document with reason
- POST /admin/documents/{id}/request-replacement/ - Admin request a new upload
- GET  /admin/documents/driver/{id}/    - Admin list every document for one driver

Requirements: 8.1, 8.2, 8.3, 8.6
"""

from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from django.shortcuts import get_object_or_404

from .driver_access import resolve_driver_profile
from .api.serializers import DriverDocumentSerializer
from .models import DriverDocument, DriverProfile
from .services.document_service import DocumentService

from deliveries.courier_onboarding import (
    get_courier_documents_review_state,
    get_required_courier_document_types,
)
from deliveries.models import DriverDeliverySettings


class DriverDocumentListView(APIView):
    """
    GET /drivers/me/documents/

    Returns all documents for the authenticated driver, including
    status, expiration info, and days until expiry.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

        documents = DriverDocument.objects.filter(driver=profile).order_by(
            "document_type", "-uploaded_at"
        )

        serializer = DriverDocumentSerializer(documents, many=True)

        # Also include expiration warnings and alerts
        service = DocumentService()
        expiring = service.get_expiring_documents(profile)
        settings = DriverDeliverySettings.objects.filter(driver=request.user).first()
        delivery_context = request.query_params.get("context") == "delivery"

        if delivery_context:
            vehicle_type = settings.delivery_vehicle_type if settings else "motorcycle"
            review_state = get_courier_documents_review_state(profile, vehicle_type)
            alerts = service.get_expired_or_missing(
                profile,
                required_types=list(get_required_courier_document_types(vehicle_type)),
            )
        else:
            alerts = service.get_expired_or_missing(profile)
            review_state = service.get_documents_review_state(profile)

        return Response(
            {
                "documents": serializer.data,
                "expiring_documents": expiring,
                "delivery_context": delivery_context,
                "delivery_vehicle_type": settings.delivery_vehicle_type if settings else "",
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
                **review_state,
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
        - issued_at: optional issue date in YYYY-MM-DD format
        - expires_at: optional expiration date in YYYY-MM-DD format
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile, error = resolve_driver_profile(request.user, auto_create=True)
        if error:
            return Response(error["data"], status=error["status"])

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
        service.mark_application_pending_if_complete(profile)
        review_state = service.get_documents_review_state(profile)

        response_payload = {
            **serializer.data,
            **review_state,
        }
        if review_state["documents_under_review"]:
            response_payload["message"] = (
                "All required documents uploaded. Your application is under admin review."
            )

        return Response(response_payload, status=status.HTTP_201_CREATED)


class AdminDocumentApproveView(APIView):
    """
    POST /admin/documents/{id}/approve/

    Admin endpoint to approve a driver document.
    Updates status to 'approved' and notifies the driver.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, document_id):
        document = get_object_or_404(DriverDocument, id=document_id)
        prior_status = document.status

        service = DocumentService()
        try:
            document = service.approve_document(document, reviewer=request.user)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from security.services.audit_service import log_from_request

        log_from_request(
            request,
            action="document_approval",
            entity_type="document",
            entity_id=document.id,
            summary=f"Document approved: {document.document_type}",
            details={
                "driver_id": document.driver_id,
                "document_type": document.document_type,
                "prior_status": prior_status,
                "account_status_unchanged": True,
            },
        )

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

        prior_status = document.status
        service = DocumentService()
        document = service.reject_document(
            document, reviewer=request.user, reason=reason
        )

        from security.services.audit_service import log_from_request

        log_from_request(
            request,
            action="document_approval",
            entity_type="document",
            entity_id=document.id,
            summary=f"Document rejected: {document.document_type}",
            details={
                "driver_id": document.driver_id,
                "reason": reason,
                "prior_status": prior_status,
                "account_status_unchanged": True,
            },
        )

        serializer = DriverDocumentSerializer(document)
        return Response(
            {
                "message": "Document rejected.",
                "document": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AdminDocumentRequestReplacementView(APIView):
    """
    POST /admin/documents/{id}/request-replacement/

    Admin endpoint to request a new upload for a driver document without
    rejecting the driver account. Sets status to 'replacement_required',
    records the reviewer and reason, and notifies the driver.

    Request body (JSON):
        - reason: (required) what the driver must fix
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, document_id):
        document = get_object_or_404(DriverDocument, id=document_id)

        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return Response(
                {"error": "A reason is required when requesting a replacement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prior_status = document.status
        service = DocumentService()
        try:
            document = service.request_document_replacement(
                document, reviewer=request.user, reason=reason
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from security.services.audit_service import log_from_request

        log_from_request(
            request,
            action="document_approval",
            entity_type="document",
            entity_id=document.id,
            summary=f"Document replacement requested: {document.document_type}",
            details={
                "driver_id": document.driver_id,
                "document_type": document.document_type,
                "reason": reason,
                "prior_status": prior_status,
                "account_status_unchanged": True,
            },
        )

        serializer = DriverDocumentSerializer(document)
        return Response(
            {
                "message": "Replacement requested. Driver account status was not changed.",
                "document": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AdminDriverDocumentsView(APIView):
    """
    GET /admin/documents/driver/{driver_id}/

    Admin endpoint listing every DriverDocument for one driver, regardless of
    review status. Approved and rejected documents stay visible for audit.

    ``driver_id`` may be the DriverProfile id or the underlying User id —
    resolved the same way the other per-driver admin endpoints resolve it.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request, driver_id):
        from .views import get_driver_profile_by_any_id

        profile = get_driver_profile_by_any_id(driver_id)
        if profile is None:
            return Response(
                {"error": "Driver not found."}, status=status.HTTP_404_NOT_FOUND
            )

        documents = (
            DriverDocument.objects.filter(driver=profile)
            .select_related("reviewed_by")
            .order_by("document_type", "-uploaded_at")
        )
        serializer = DriverDocumentSerializer(
            documents, many=True, context={"request": request}
        )
        return Response(
            {
                "driver_id": profile.id,
                "user_id": profile.user_id,
                "documents": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
