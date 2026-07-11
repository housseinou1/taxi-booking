"""
Document Service

Manages driver document uploads, validation, admin review workflow,
expiration tracking, and expired/missing document alerts.

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
"""

import os
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional

from django.utils import timezone

from taxi.drivers.models import DriverDocument, DriverProfile


# Allowed file extensions and their MIME type prefixes
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf",
}

# Maximum file size: 10 MB in bytes
MAX_FILE_SIZE = 10 * 1024 * 1024

# Required document types that every driver must have
REQUIRED_DOCUMENT_TYPES = [
    "license",
    "national_id",
    "insurance",
    "carte_grise",
    "vignette",
    "plate_number_photo",
    "profile_photo",
]

EXPIRING_DOCUMENT_TYPES = {
    "license",
    "insurance",
    "carte_grise",
    "vignette",
    "vehicle_registration",
}

# Expiration warning window in days
EXPIRATION_WARNING_DAYS = 30

DOCUMENT_DISPLAY_STATUSES = (
    "uploaded",
    "pending_review",
    "approved",
    "rejected",
    "expired",
)


def get_document_display_status(document: DriverDocument) -> str:
    """Return the user-facing document lifecycle status."""
    today = date.today()
    if document.expires_at and document.expires_at < today:
        return "expired"
    if document.status == "pending_review":
        return "pending_review"
    return document.status


@dataclass
class ValidationResult:
    """Result of a file validation check."""

    valid: bool
    error: Optional[str] = None


@dataclass
class DocumentAlert:
    """Represents an alert for an expired or missing document."""

    document_type: str
    reason: str  # "expired" or "missing"
    expires_at: Optional[date] = None


class DocumentService:
    """
    Service responsible for document upload validation, admin review workflow,
    expiration warning calculations, and expired/missing document alerts.
    """

    def validate_upload(self, file) -> ValidationResult:
        """
        Validate a file upload for format and size.

        Accepts JPEG, PNG, or PDF files with a maximum size of 10 MB.

        Args:
            file: An uploaded file object (Django UploadedFile or similar
                  with .name, .size, and .content_type attributes).

        Returns:
            ValidationResult indicating whether the file is valid.
        """
        if file is None:
            return ValidationResult(
                valid=False,
                error="No file provided.",
            )

        # Check file size
        file_size = file.size if hasattr(file, "size") else 0
        if file_size > MAX_FILE_SIZE:
            return ValidationResult(
                valid=False,
                error=(
                    f"File size exceeds 10 MB limit. "
                    f"Uploaded file is {file_size / (1024 * 1024):.1f} MB."
                ),
            )

        if file_size == 0:
            return ValidationResult(
                valid=False,
                error="File is empty.",
            )

        # Check file extension
        file_name = getattr(file, "name", "") or ""
        _, ext = os.path.splitext(file_name.lower())

        if ext not in ALLOWED_EXTENSIONS:
            return ValidationResult(
                valid=False,
                error=(
                    f"Invalid file format '{ext}'. "
                    f"Accepted formats: JPEG, PNG, PDF. Maximum size: 10 MB."
                ),
            )

        # Check content type if available
        content_type = getattr(file, "content_type", None)
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            return ValidationResult(
                valid=False,
                error=(
                    f"Invalid file type '{content_type}'. "
                    f"Accepted formats: JPEG, PNG, PDF. Maximum size: 10 MB."
                ),
            )

        return ValidationResult(valid=True)

    def upload_document(
        self,
        driver: DriverProfile,
        document_type: str,
        file,
        issued_at: Optional[date] = None,
        expires_at: Optional[date] = None,
    ) -> DriverDocument:
        """
        Upload a document for a driver. Validates the file, stores it,
        and sets the status to pending_review.

        If a document of the same type already exists for the driver,
        it replaces the existing one (updates the file and resets status).

        Args:
            driver: The DriverProfile instance.
            document_type: One of the DOCUMENT_TYPES choices.
            file: The uploaded file object.
        issued_at: Optional issue date metadata.
            expires_at: Expiration date for time-limited documents.

        Returns:
            The created or updated DriverDocument instance.

        Raises:
            ValueError: If file validation fails or document_type is invalid.
        """
        # Validate document type
        valid_types = [dt[0] for dt in DriverDocument.DOCUMENT_TYPES]
        if document_type not in valid_types:
            raise ValueError(
                f"Invalid document type '{document_type}'. "
                f"Valid types: {', '.join(valid_types)}"
            )

        # Validate the file
        validation = self.validate_upload(file)
        if not validation.valid:
            raise ValueError(validation.error)

        # Dates are optional — the physical document contains all date info
        today = timezone.localdate()
        if issued_at and issued_at > today:
            raise ValueError("Document issue date cannot be in the future.")
        if issued_at and expires_at and expires_at <= issued_at:
            raise ValueError("Expiration date must be after the issue date.")

        # Check if document of this type already exists for the driver
        existing = DriverDocument.objects.filter(
            driver=driver,
            document_type=document_type,
        ).first()

        if existing:
            # Replace existing document
            existing.file = file
            existing.status = "pending_review"
            existing.rejection_reason = ""
            existing.issued_at = issued_at
            existing.expires_at = expires_at
            existing.reviewed_at = None
            existing.reviewed_by = None
            existing.save()
            return existing

        # Create new document
        document = DriverDocument.objects.create(
            driver=driver,
            document_type=document_type,
            file=file,
            status="pending_review",
            issued_at=issued_at,
            expires_at=expires_at,
        )

        return document

    def approve_document(self, document: DriverDocument, reviewer) -> DriverDocument:
        """
        Approve a document and trigger a notification to the driver.

        Args:
            document: The DriverDocument instance to approve.
            reviewer: The User who is approving the document.

        Returns:
            The updated DriverDocument instance.
        """
        document.status = "approved"
        document.reviewed_at = timezone.now()
        document.reviewed_by = reviewer
        document.rejection_reason = ""
        document.save()

        # Trigger notification to driver
        self._notify_document_status(document)

        return document

    def reject_document(
        self, document: DriverDocument, reviewer, reason: str
    ) -> DriverDocument:
        """
        Reject a document with a reason and trigger a notification to the driver.

        Args:
            document: The DriverDocument instance to reject.
            reviewer: The User who is rejecting the document.
            reason: The reason for rejection.

        Returns:
            The updated DriverDocument instance.
        """
        document.status = "rejected"
        document.reviewed_at = timezone.now()
        document.reviewed_by = reviewer
        document.rejection_reason = reason
        document.save()

        # Trigger notification to driver
        self._notify_document_status(document)

        return document

    def get_expiring_documents(
        self, driver: DriverProfile, days: int = EXPIRATION_WARNING_DAYS
    ) -> List[dict]:
        """
        Return documents expiring within the specified number of days.

        Args:
            driver: The DriverProfile instance.
            days: Number of days to look ahead (default 30).

        Returns:
            List of dicts with document info and days_remaining.
        """
        today = date.today()
        warning_date = today + timedelta(days=days)

        expiring_docs = DriverDocument.objects.filter(
            driver=driver,
            expires_at__isnull=False,
            expires_at__gte=today,
            expires_at__lte=warning_date,
            status="approved",
        )

        results = []
        for doc in expiring_docs:
            days_remaining = self.get_days_until_expiry(doc)
            results.append(
                {
                    "id": doc.id,
                    "document_type": doc.document_type,
                    "expires_at": doc.expires_at,
                    "days_remaining": days_remaining,
                }
            )

        return results

    def get_days_until_expiry(self, document: DriverDocument) -> Optional[int]:
        """
        Calculate the number of days remaining until a document expires.

        Args:
            document: The DriverDocument instance.

        Returns:
            Number of days until expiry, or None if no expiration date is set.
            Returns negative values for already-expired documents.
        """
        if document.expires_at is None:
            return None

        today = date.today()
        delta = document.expires_at - today
        return delta.days

    def get_expired_or_missing(
        self,
        driver: DriverProfile,
        required_types: Optional[List[str]] = None,
    ) -> List[DocumentAlert]:
        """
        Return a list of required documents that are expired or missing.

        A document is considered:
        - "missing" if no document of that type exists for the driver,
          or if the only document of that type has been rejected.
        - "expired" if the document's expires_at date is in the past.

        Args:
            driver: The DriverProfile instance.
            required_types: Optional list of document type keys to check.

        Returns:
            List of DocumentAlert objects for each problematic document.
        """
        today = date.today()
        alerts = []

        # Map document types to legacy profile fields that satisfy the requirement
        legacy_field_map = {
            "profile_photo": lambda d: bool(d.driver_photo),
            "plate_number_photo": lambda d: bool(d.vehicle_plate or d.plate_number),
            "national_id": lambda d: bool(getattr(d.user, "national_id_document", None)),
            "license": lambda d: bool(d.license_file),
            "insurance": lambda d: bool(d.insurance_document),
            "vignette": lambda d: bool(d.vignette_document),
            "carte_grise": lambda d: bool(d.vehicle_registration),
        }

        for doc_type in required_types or REQUIRED_DOCUMENT_TYPES:
            # Check if a legacy profile field already satisfies this requirement
            legacy_check = legacy_field_map.get(doc_type)
            if legacy_check and legacy_check(driver):
                continue

            compatible_types = [doc_type]
            if doc_type == "carte_grise":
                compatible_types.append("vehicle_registration")

            # Get the most recent document of this type
            document = (
                DriverDocument.objects.filter(
                    driver=driver,
                    document_type__in=compatible_types,
                )
                .order_by("-uploaded_at")
                .first()
            )

            if document is None:
                # No document uploaded at all
                alerts.append(
                    DocumentAlert(
                        document_type=doc_type,
                        reason="missing",
                    )
                )
            elif document.status == "rejected":
                # Document was rejected - treated as missing
                alerts.append(
                    DocumentAlert(
                        document_type=doc_type,
                        reason="missing",
                    )
                )
            elif (
                document.expires_at is not None and document.expires_at < today
            ):
                # Document has expired
                alerts.append(
                    DocumentAlert(
                        document_type=doc_type,
                        reason="expired",
                        expires_at=document.expires_at,
                    )
                )

        return alerts

    def get_documents_review_state(self, driver: DriverProfile) -> dict:
        """
        Summarize whether the driver finished uploading required documents
        and is waiting for admin review.
        """
        alerts = self.get_expired_or_missing(driver)
        missing_types = [
            alert.document_type for alert in alerts if alert.reason == "missing"
        ]
        expired_types = [
            alert.document_type for alert in alerts if alert.reason == "expired"
        ]
        all_required_uploaded = len(missing_types) == 0
        documents_under_review = (
            all_required_uploaded
            and not expired_types
            and driver.status != "approved"
        )

        return {
            "all_required_documents_uploaded": all_required_uploaded,
            "documents_under_review": documents_under_review,
            "missing_document_types": missing_types,
            "expired_document_types": expired_types,
        }

    def mark_application_pending_if_complete(self, driver: DriverProfile) -> bool:
        """
        Move a completed application back to pending review once every
        required document has been uploaded.
        """
        state = self.get_documents_review_state(driver)
        if not state["all_required_documents_uploaded"]:
            return False
        if state["expired_document_types"]:
            return False
        if driver.status == "approved":
            return False

        if driver.status not in ("approved", "rejected", "pending_review"):
            driver.status = "pending_review"
            driver.save(update_fields=["status"])
        return True

    def _notify_document_status(self, document: DriverDocument) -> None:
        """
        Send a notification to the driver about a document status change.

        Sends both a WebSocket notification (if channels are available)
        and a push notification.

        Args:
            document: The DriverDocument whose status changed.
        """
        driver = document.driver
        user = driver.user
        doc_type_display = document.get_document_type_display()
        status = document.status

        if status == "approved":
            title = "Document Approved"
            body = f"Your {doc_type_display} has been approved."
        elif status == "rejected":
            title = "Document Rejected"
            reason = document.rejection_reason or "No reason provided."
            body = f"Your {doc_type_display} has been rejected. Reason: {reason}"
        else:
            return

        # Send push notification
        try:
            from notifications.services import send_push_notification

            send_push_notification(
                user,
                title,
                body,
                {
                    "type": "document_status",
                    "document_type": document.document_type,
                    "status": status,
                    "reason": document.rejection_reason if status == "rejected" else None,
                },
            )
        except ImportError:
            pass

        # Send WebSocket notification via channel layer
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"driver_{user.id}",
                    {
                        "type": "document.status",
                        "document_type": document.document_type,
                        "document_type_display": doc_type_display,
                        "status": status,
                        "reason": document.rejection_reason if status == "rejected" else None,
                    },
                )
        except (ImportError, Exception):
            # Channels not available or not configured - skip silently
            pass
