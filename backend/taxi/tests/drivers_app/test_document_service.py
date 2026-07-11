"""
Unit tests for DocumentService.

Tests cover:
- validate_upload(): file format and size validation
- upload_document(): document creation and replacement
- approve_document(): admin approval workflow
- reject_document(): admin rejection workflow with reason
- get_expiring_documents(): expiration warning within 30 days
- get_days_until_expiry(): days remaining calculation
- get_expired_or_missing(): expired/missing document alerts

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from taxi.drivers.services.document_service import (
    ALLOWED_EXTENSIONS,
    ALLOWED_CONTENT_TYPES,
    DocumentAlert,
    DocumentService,
    MAX_FILE_SIZE,
    REQUIRED_DOCUMENT_TYPES,
    ValidationResult,
)


class TestValidateUpload:
    """Tests for DocumentService.validate_upload()"""

    def setup_method(self):
        self.service = DocumentService()

    def test_valid_jpeg_file(self):
        """JPEG file within size limit is accepted."""
        file = MagicMock()
        file.name = "license.jpg"
        file.size = 5 * 1024 * 1024  # 5 MB
        file.content_type = "image/jpeg"

        result = self.service.validate_upload(file)

        assert result.valid is True
        assert result.error is None

    def test_valid_jpeg_extension(self):
        """File with .jpeg extension is accepted."""
        file = MagicMock()
        file.name = "document.jpeg"
        file.size = 1024
        file.content_type = "image/jpeg"

        result = self.service.validate_upload(file)

        assert result.valid is True

    def test_valid_png_file(self):
        """PNG file within size limit is accepted."""
        file = MagicMock()
        file.name = "id_card.png"
        file.size = 3 * 1024 * 1024
        file.content_type = "image/png"

        result = self.service.validate_upload(file)

        assert result.valid is True

    def test_valid_pdf_file(self):
        """PDF file within size limit is accepted."""
        file = MagicMock()
        file.name = "insurance.pdf"
        file.size = 8 * 1024 * 1024
        file.content_type = "application/pdf"

        result = self.service.validate_upload(file)

        assert result.valid is True

    def test_file_exactly_10mb(self):
        """File exactly at 10 MB limit is accepted."""
        file = MagicMock()
        file.name = "large_doc.pdf"
        file.size = MAX_FILE_SIZE  # Exactly 10 MB
        file.content_type = "application/pdf"

        result = self.service.validate_upload(file)

        assert result.valid is True

    def test_file_exceeds_10mb(self):
        """File exceeding 10 MB is rejected."""
        file = MagicMock()
        file.name = "huge_doc.pdf"
        file.size = MAX_FILE_SIZE + 1  # 10 MB + 1 byte
        file.content_type = "application/pdf"

        result = self.service.validate_upload(file)

        assert result.valid is False
        assert "10 MB" in result.error

    def test_invalid_extension_bmp(self):
        """BMP file is rejected."""
        file = MagicMock()
        file.name = "photo.bmp"
        file.size = 1024
        file.content_type = "image/bmp"

        result = self.service.validate_upload(file)

        assert result.valid is False
        assert "Invalid file format" in result.error

    def test_invalid_extension_gif(self):
        """GIF file is rejected."""
        file = MagicMock()
        file.name = "animation.gif"
        file.size = 1024
        file.content_type = "image/gif"

        result = self.service.validate_upload(file)

        assert result.valid is False

    def test_invalid_extension_docx(self):
        """DOCX file is rejected."""
        file = MagicMock()
        file.name = "document.docx"
        file.size = 1024
        file.content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        result = self.service.validate_upload(file)

        assert result.valid is False

    def test_none_file(self):
        """None file is rejected."""
        result = self.service.validate_upload(None)

        assert result.valid is False
        assert "No file provided" in result.error

    def test_empty_file(self):
        """Empty file (0 bytes) is rejected."""
        file = MagicMock()
        file.name = "empty.pdf"
        file.size = 0
        file.content_type = "application/pdf"

        result = self.service.validate_upload(file)

        assert result.valid is False
        assert "empty" in result.error.lower()

    def test_invalid_content_type_with_valid_extension(self):
        """File with valid extension but invalid content type is rejected."""
        file = MagicMock()
        file.name = "fake.jpg"
        file.size = 1024
        file.content_type = "text/html"

        result = self.service.validate_upload(file)

        assert result.valid is False
        assert "Invalid file type" in result.error

    def test_case_insensitive_extension(self):
        """Extension check is case-insensitive."""
        file = MagicMock()
        file.name = "PHOTO.JPG"
        file.size = 1024
        file.content_type = "image/jpeg"

        result = self.service.validate_upload(file)

        assert result.valid is True

    def test_no_content_type_with_valid_extension(self):
        """File without content_type but valid extension is accepted."""
        file = MagicMock()
        file.name = "doc.png"
        file.size = 1024
        file.content_type = None

        result = self.service.validate_upload(file)

        assert result.valid is True


class TestUploadDocument:
    """Tests for DocumentService.upload_document()"""

    def setup_method(self):
        self.service = DocumentService()

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_creates_new_document(self, mock_objects):
        """New document is created with pending_review status."""
        mock_objects.filter.return_value.first.return_value = None
        mock_doc = MagicMock()
        mock_objects.create.return_value = mock_doc

        driver = MagicMock()
        file = MagicMock()
        file.name = "license.pdf"
        file.size = 1024
        file.content_type = "application/pdf"
        issued = date.today() - timedelta(days=365)
        expires = date.today() + timedelta(days=365)

        result = self.service.upload_document(
            driver, "license", file, issued_at=issued, expires_at=expires
        )

        mock_objects.create.assert_called_once_with(
            driver=driver,
            document_type="license",
            file=file,
            status="pending_review",
            issued_at=issued,
            expires_at=expires,
        )
        assert result == mock_doc

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_replaces_existing_document(self, mock_objects):
        """Existing document is replaced and status reset to pending_review."""
        existing_doc = MagicMock()
        mock_objects.filter.return_value.first.return_value = existing_doc

        driver = MagicMock()
        file = MagicMock()
        file.name = "new_license.jpg"
        file.size = 2048
        file.content_type = "image/jpeg"
        issued = date.today() - timedelta(days=365)
        expires = date.today() + timedelta(days=365)

        result = self.service.upload_document(
            driver, "license", file, issued_at=issued, expires_at=expires
        )

        assert existing_doc.file == file
        assert existing_doc.status == "pending_review"
        assert existing_doc.rejection_reason == ""
        assert existing_doc.reviewed_at is None
        assert existing_doc.reviewed_by is None
        assert existing_doc.issued_at == issued
        assert existing_doc.expires_at == expires
        existing_doc.save.assert_called_once()
        assert result == existing_doc

    def test_invalid_document_type_raises_error(self):
        """Invalid document type raises ValueError."""
        driver = MagicMock()
        file = MagicMock()
        file.name = "doc.pdf"
        file.size = 1024
        file.content_type = "application/pdf"

        with pytest.raises(ValueError, match="Invalid document type"):
            self.service.upload_document(driver, "invalid_type", file)

    def test_invalid_file_raises_error(self):
        """Invalid file raises ValueError."""
        driver = MagicMock()
        file = MagicMock()
        file.name = "doc.bmp"
        file.size = 1024
        file.content_type = "image/bmp"

        with pytest.raises(ValueError):
            self.service.upload_document(driver, "license", file)

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_upload_with_expiration_date(self, mock_objects):
        """Document can be uploaded with an expiration date."""
        mock_objects.filter.return_value.first.return_value = None
        mock_doc = MagicMock()
        mock_objects.create.return_value = mock_doc

        driver = MagicMock()
        file = MagicMock()
        file.name = "license.pdf"
        file.size = 1024
        file.content_type = "application/pdf"
        issued = date.today() - timedelta(days=365)
        expires = date.today() + timedelta(days=365)

        result = self.service.upload_document(
            driver, "license", file, issued_at=issued, expires_at=expires
        )

        mock_objects.create.assert_called_once_with(
            driver=driver,
            document_type="license",
            file=file,
            status="pending_review",
            issued_at=issued,
            expires_at=expires,
        )


class TestApproveDocument:
    """Tests for DocumentService.approve_document()"""

    def setup_method(self):
        self.service = DocumentService()

    @patch("taxi.drivers.services.document_service.DocumentService._notify_document_status")
    def test_approve_sets_status(self, mock_notify):
        """Approving sets status to 'approved'."""
        document = MagicMock()
        document.status = "pending_review"
        reviewer = MagicMock()

        result = self.service.approve_document(document, reviewer)

        assert document.status == "approved"
        assert document.reviewed_by == reviewer
        assert document.rejection_reason == ""
        document.save.assert_called_once()

    @patch("taxi.drivers.services.document_service.DocumentService._notify_document_status")
    def test_approve_triggers_notification(self, mock_notify):
        """Approving triggers a notification to the driver."""
        document = MagicMock()
        reviewer = MagicMock()

        self.service.approve_document(document, reviewer)

        mock_notify.assert_called_once_with(document)


class TestRejectDocument:
    """Tests for DocumentService.reject_document()"""

    def setup_method(self):
        self.service = DocumentService()

    @patch("taxi.drivers.services.document_service.DocumentService._notify_document_status")
    def test_reject_sets_status_and_reason(self, mock_notify):
        """Rejecting sets status to 'rejected' with reason."""
        document = MagicMock()
        document.status = "pending_review"
        reviewer = MagicMock()
        reason = "Document is blurry and unreadable"

        result = self.service.reject_document(document, reviewer, reason)

        assert document.status == "rejected"
        assert document.reviewed_by == reviewer
        assert document.rejection_reason == reason
        document.save.assert_called_once()

    @patch("taxi.drivers.services.document_service.DocumentService._notify_document_status")
    def test_reject_triggers_notification(self, mock_notify):
        """Rejecting triggers a notification to the driver."""
        document = MagicMock()
        reviewer = MagicMock()

        self.service.reject_document(document, reviewer, "Expired document")

        mock_notify.assert_called_once_with(document)


class TestGetExpiringDocuments:
    """Tests for DocumentService.get_expiring_documents()"""

    def setup_method(self):
        self.service = DocumentService()

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_returns_documents_expiring_within_30_days(self, mock_objects):
        """Returns documents expiring within 30 days."""
        today = date.today()
        doc1 = MagicMock()
        doc1.id = 1
        doc1.document_type = "license"
        doc1.expires_at = today + timedelta(days=15)

        mock_objects.filter.return_value = [doc1]

        driver = MagicMock()
        result = self.service.get_expiring_documents(driver)

        assert len(result) == 1
        assert result[0]["document_type"] == "license"
        assert result[0]["days_remaining"] == 15

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_empty_when_no_expiring_documents(self, mock_objects):
        """Returns empty list when no documents are expiring."""
        mock_objects.filter.return_value = []

        driver = MagicMock()
        result = self.service.get_expiring_documents(driver)

        assert result == []


class TestGetDaysUntilExpiry:
    """Tests for DocumentService.get_days_until_expiry()"""

    def setup_method(self):
        self.service = DocumentService()

    def test_document_expiring_in_future(self):
        """Document expiring in 20 days returns 20."""
        document = MagicMock()
        document.expires_at = date.today() + timedelta(days=20)

        result = self.service.get_days_until_expiry(document)

        assert result == 20

    def test_document_expiring_today(self):
        """Document expiring today returns 0."""
        document = MagicMock()
        document.expires_at = date.today()

        result = self.service.get_days_until_expiry(document)

        assert result == 0

    def test_document_already_expired(self):
        """Expired document returns negative days."""
        document = MagicMock()
        document.expires_at = date.today() - timedelta(days=5)

        result = self.service.get_days_until_expiry(document)

        assert result == -5

    def test_document_no_expiration(self):
        """Document without expiration date returns None."""
        document = MagicMock()
        document.expires_at = None

        result = self.service.get_days_until_expiry(document)

        assert result is None


class TestGetExpiredOrMissing:
    """Tests for DocumentService.get_expired_or_missing()"""

    def setup_method(self):
        self.service = DocumentService()
        self.legacy_patcher = patch.object(
            DocumentService, "_legacy_satisfies_required_type", return_value=False
        )
        self.legacy_patcher.start()

    def teardown_method(self):
        self.legacy_patcher.stop()

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_missing_document_detected(self, mock_objects):
        """Missing document (no upload) generates alert."""
        # Return None for all document types (no documents uploaded)
        mock_objects.filter.return_value.order_by.return_value.first.return_value = None

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        # All required documents should be missing
        assert len(result) == len(REQUIRED_DOCUMENT_TYPES)
        assert all(alert.reason == "missing" for alert in result)

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_rejected_document_treated_as_missing(self, mock_objects):
        """Rejected document is treated as missing."""
        rejected_doc = MagicMock()
        rejected_doc.status = "rejected"
        rejected_doc.expires_at = None

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = rejected_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        assert len(result) == len(REQUIRED_DOCUMENT_TYPES)
        assert all(alert.reason == "missing" for alert in result)

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_expired_document_detected(self, mock_objects):
        """Expired document generates alert with 'expired' reason."""
        expired_doc = MagicMock()
        expired_doc.status = "approved"
        expired_doc.expires_at = date.today() - timedelta(days=10)

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = expired_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        assert len(result) == len(REQUIRED_DOCUMENT_TYPES)
        assert all(alert.reason == "expired" for alert in result)
        assert all(alert.expires_at == expired_doc.expires_at for alert in result)

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_approved_non_expired_no_alert(self, mock_objects):
        """Approved, non-expired document generates no alert."""
        valid_doc = MagicMock()
        valid_doc.status = "approved"
        valid_doc.expires_at = date.today() + timedelta(days=60)

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = valid_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        assert len(result) == 0

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_approved_no_expiry_no_alert(self, mock_objects):
        """Approved document without expiration date generates no alert."""
        valid_doc = MagicMock()
        valid_doc.status = "approved"
        valid_doc.expires_at = None

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = valid_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        assert len(result) == 0

    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_pending_review_no_alert(self, mock_objects):
        """Document in pending_review status generates no alert."""
        pending_doc = MagicMock()
        pending_doc.status = "pending_review"
        pending_doc.expires_at = None

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = pending_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        result = self.service.get_expired_or_missing(driver)

        assert len(result) == 0


class TestGetDocumentsReviewState:
    """Tests for DocumentService.get_documents_review_state() alert levels."""

    def setup_method(self):
        self.service = DocumentService()

    @patch.object(DocumentService, "_legacy_satisfies_required_type", return_value=False)
    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_no_alert_when_documents_valid_beyond_15_days(self, mock_objects, _legacy):
        valid_doc = MagicMock()
        valid_doc.status = "approved"
        valid_doc.expires_at = date.today() + timedelta(days=40)

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = valid_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        driver.status = "approved"
        state = self.service.get_documents_review_state(driver)

        assert state["documents_alert_level"] is None
        assert state["documents_block_online"] is False
        assert state["expiring_soon_documents"] == []

    @patch.object(DocumentService, "_legacy_satisfies_required_type", return_value=False)
    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_warning_when_document_expires_within_15_days(self, mock_objects, _legacy):
        expiring_doc = MagicMock()
        expiring_doc.status = "approved"
        expiring_doc.expires_at = date.today() + timedelta(days=10)

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = expiring_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        driver.status = "approved"
        state = self.service.get_documents_review_state(driver)

        assert state["documents_alert_level"] == "warning"
        assert state["documents_block_online"] is False
        assert len(state["expiring_soon_documents"]) == len(REQUIRED_DOCUMENT_TYPES)

    @patch.object(DocumentService, "_legacy_satisfies_required_type", return_value=False)
    @patch("taxi.drivers.services.document_service.DriverDocument.objects")
    def test_error_when_document_expired(self, mock_objects, _legacy):
        expired_doc = MagicMock()
        expired_doc.status = "approved"
        expired_doc.expires_at = date.today() - timedelta(days=1)

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.first.return_value = expired_doc
        mock_objects.filter.return_value = mock_qs

        driver = MagicMock()
        driver.status = "approved"
        state = self.service.get_documents_review_state(driver)

        assert state["documents_alert_level"] == "error"
        assert state["documents_block_online"] is True
        assert len(state["expired_document_types"]) == len(REQUIRED_DOCUMENT_TYPES)


class TestRequiredDocumentTypes:
    """Tests for REQUIRED_DOCUMENT_TYPES constant."""

    def test_all_required_types_present(self):
        """All required document types are defined."""
        assert len(REQUIRED_DOCUMENT_TYPES) == 7
        assert "license" in REQUIRED_DOCUMENT_TYPES
        assert "national_id" in REQUIRED_DOCUMENT_TYPES
        assert "insurance" in REQUIRED_DOCUMENT_TYPES
        assert "carte_grise" in REQUIRED_DOCUMENT_TYPES
        assert "vignette" in REQUIRED_DOCUMENT_TYPES
        assert "plate_number_photo" in REQUIRED_DOCUMENT_TYPES
        assert "profile_photo" in REQUIRED_DOCUMENT_TYPES


class TestConstants:
    """Tests for service constants."""

    def test_max_file_size_is_10mb(self):
        """MAX_FILE_SIZE is exactly 10 MB."""
        assert MAX_FILE_SIZE == 10 * 1024 * 1024

    def test_allowed_extensions(self):
        """Allowed extensions include jpg, jpeg, png, pdf."""
        assert ".jpg" in ALLOWED_EXTENSIONS
        assert ".jpeg" in ALLOWED_EXTENSIONS
        assert ".png" in ALLOWED_EXTENSIONS
        assert ".pdf" in ALLOWED_EXTENSIONS

    def test_allowed_content_types(self):
        """Allowed content types include JPEG, PNG, PDF."""
        assert "image/jpeg" in ALLOWED_CONTENT_TYPES
        assert "image/png" in ALLOWED_CONTENT_TYPES
        assert "application/pdf" in ALLOWED_CONTENT_TYPES
