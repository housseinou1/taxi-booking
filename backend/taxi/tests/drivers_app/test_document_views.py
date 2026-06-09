"""
Tests for Document Center API endpoints.

Endpoints tested:
- GET  /drivers/me/documents/           - List all driver documents with status and expiration
- POST /drivers/me/documents/upload/    - Upload document (validates format and size)
- POST /admin/documents/{id}/approve/   - Admin approve a document
- POST /admin/documents/{id}/reject/    - Admin reject a document with reason

Requirements: 8.1, 8.2, 8.3, 8.6
"""

import pytest
from datetime import date, timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile, DriverDocument

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
DOCUMENTS_URL = "/drivers/me/documents/"
UPLOAD_URL = "/drivers/me/documents/upload/"


def _register_driver():
    """Register a driver user and return (payload, token)."""
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
        "phone_number": f"+2222{faker.numerify('#######')}",
        "national_id_number": f"9{faker.numerify('#########')}",
    }
    reg = client.post(REGISTER_URL, payload)
    assert reg.status_code == 201, f"Registration failed: {reg.data}"

    login = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login.status_code == 200, f"Login failed: {login.data}"

    token = login.data["access"]
    return payload, token


def _register_admin():
    """Register an admin user and return (payload, token)."""
    from authapp.models import User

    email = faker.email()
    password = f"Admin@{faker.numerify('####')}Ab"
    user = User(
        email=email,
        first_name=faker.first_name(),
        last_name=faker.last_name(),
        user_type="rider",
        is_staff=True,
        is_superuser=True,
    )
    user.set_password(password)
    user.save()

    login = client.post(LOGIN_URL, {
        "email": email,
        "password": password,
    })
    assert login.status_code == 200, f"Admin login failed: {login.data}"

    token = login.data["access"]
    return {"email": email}, token


def _get_authenticated_client(token):
    """Return a client with auth credentials set."""
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


def _make_valid_file(name="document.pdf", size=1024, content_type="application/pdf"):
    """Create a valid uploaded file for testing."""
    content = b"%PDF-" + b"x" * (size - 5)
    return SimpleUploadedFile(name, content, content_type=content_type)


def _make_jpeg_file(name="photo.jpg", size=1024):
    """Create a valid JPEG file for testing."""
    content = b"\xff\xd8\xff" + b"x" * (size - 3)
    return SimpleUploadedFile(name, content, content_type="image/jpeg")


def _make_png_file(name="photo.png", size=1024):
    """Create a valid PNG file for testing."""
    content = b"\x89PNG" + b"x" * (size - 4)
    return SimpleUploadedFile(name, content, content_type="image/png")


@pytest.mark.django_db
class TestDriverDocumentListView:
    """Tests for GET /drivers/me/documents/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(DOCUMENTS_URL)
        assert response.status_code == 401

    def test_returns_empty_documents_for_new_driver(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(DOCUMENTS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["documents"] == []
        assert "expiring_documents" in data
        assert "alerts" in data

    def test_returns_uploaded_documents(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        # Create a document directly
        DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="pending_review",
            expires_at=date.today() + timedelta(days=365),
        )

        response = c.get(DOCUMENTS_URL)
        assert response.status_code == 200

        data = response.data
        assert len(data["documents"]) == 1
        assert data["documents"][0]["document_type"] == "license"
        assert data["documents"][0]["status"] == "pending_review"

    def test_returns_alerts_for_missing_documents(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(DOCUMENTS_URL)
        assert response.status_code == 200

        data = response.data
        # All 6 required documents should be missing
        assert len(data["alerts"]) == 6
        assert all(alert["reason"] == "missing" for alert in data["alerts"])

    def test_returns_expiring_documents(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        # Create a document expiring in 15 days
        DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="approved",
            expires_at=date.today() + timedelta(days=15),
        )

        response = c.get(DOCUMENTS_URL)
        assert response.status_code == 200

        data = response.data
        assert len(data["expiring_documents"]) == 1
        assert data["expiring_documents"][0]["document_type"] == "license"
        assert data["expiring_documents"][0]["days_remaining"] == 15


@pytest.mark.django_db
class TestDriverDocumentUploadView:
    """Tests for POST /drivers/me/documents/upload/"""

    def test_unauthenticated_returns_401(self):
        response = client.post(UPLOAD_URL)
        assert response.status_code == 401

    def test_upload_valid_pdf(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        issued = (date.today() - timedelta(days=365)).isoformat()
        expires = (date.today() + timedelta(days=365)).isoformat()
        file = _make_valid_file("license.pdf")
        response = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file,
            "issued_at": issued,
            "expires_at": expires,
        }, format="multipart")

        assert response.status_code == 201
        assert response.data["document_type"] == "license"
        assert response.data["status"] == "pending_review"

    def test_upload_valid_jpeg(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        file = _make_jpeg_file("photo.jpg")
        response = c.post(UPLOAD_URL, {
            "document_type": "profile_photo",
            "file": file,
        }, format="multipart")

        assert response.status_code == 201
        assert response.data["document_type"] == "profile_photo"
        assert response.data["status"] == "pending_review"

    def test_upload_valid_png(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        file = _make_png_file("id_card.png")
        response = c.post(UPLOAD_URL, {
            "document_type": "national_id",
            "file": file,
        }, format="multipart")

        assert response.status_code == 201
        assert response.data["document_type"] == "national_id"

    def test_upload_with_expiration_date(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        issued = (date.today() - timedelta(days=365)).isoformat()
        expires = (date.today() + timedelta(days=365)).isoformat()
        file = _make_valid_file("license.pdf")
        response = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file,
            "issued_at": issued,
            "expires_at": expires,
        }, format="multipart")

        assert response.status_code == 201
        assert response.data["expires_at"] == expires

    def test_upload_rejects_invalid_format(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        file = SimpleUploadedFile("doc.bmp", b"BM" + b"x" * 100, content_type="image/bmp")
        response = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file,
        }, format="multipart")

        assert response.status_code == 400
        assert "error" in response.data

    def test_upload_rejects_oversized_file(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        # Create a file just over 10 MB
        large_content = b"%PDF-" + b"x" * (10 * 1024 * 1024)
        file = SimpleUploadedFile("large.pdf", large_content, content_type="application/pdf")
        response = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file,
        }, format="multipart")

        assert response.status_code == 400
        assert "10 MB" in response.data["error"]

    def test_upload_rejects_missing_document_type(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        file = _make_valid_file("license.pdf")
        response = c.post(UPLOAD_URL, {
            "file": file,
        }, format="multipart")

        assert response.status_code == 400
        assert "document_type" in response.data["error"]

    def test_upload_rejects_missing_file(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.post(UPLOAD_URL, {
            "document_type": "license",
        }, format="multipart")

        assert response.status_code == 400
        assert "file" in response.data["error"].lower() or "No file" in response.data["error"]

    def test_upload_rejects_invalid_document_type(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        file = _make_valid_file("doc.pdf")
        response = c.post(UPLOAD_URL, {
            "document_type": "invalid_type",
            "file": file,
        }, format="multipart")

        assert response.status_code == 400

    def test_upload_replaces_existing_document(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        # Upload first document
        issued = (date.today() - timedelta(days=365)).isoformat()
        expires = (date.today() + timedelta(days=365)).isoformat()
        file1 = _make_valid_file("license_v1.pdf")
        response1 = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file1,
            "issued_at": issued,
            "expires_at": expires,
        }, format="multipart")
        assert response1.status_code == 201

        # Upload replacement
        file2 = _make_valid_file("license_v2.pdf")
        response2 = c.post(UPLOAD_URL, {
            "document_type": "license",
            "file": file2,
            "issued_at": issued,
            "expires_at": expires,
        }, format="multipart")
        assert response2.status_code == 201

        # Should still be only one license document
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile
        license_docs = DriverDocument.objects.filter(
            driver=profile, document_type="license"
        )
        assert license_docs.count() == 1
        assert license_docs.first().status == "pending_review"


@pytest.mark.django_db
class TestAdminDocumentApproveView:
    """Tests for POST /admin/documents/{id}/approve/"""

    def test_unauthenticated_returns_401(self):
        response = client.post("/admin/documents/1/approve/")
        assert response.status_code == 401

    def test_non_admin_returns_403(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.post("/admin/documents/1/approve/")
        assert response.status_code == 403

    def test_admin_approves_document(self):
        # Create a driver with a document
        payload, driver_token = _register_driver()
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        doc = DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="pending_review",
        )

        # Admin approves
        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(f"/admin/documents/{doc.id}/approve/")
        assert response.status_code == 200
        assert response.data["message"] == "Document approved successfully."
        assert response.data["document"]["status"] == "approved"

        # Verify in DB
        doc.refresh_from_db()
        assert doc.status == "approved"
        assert doc.reviewed_at is not None
        assert doc.reviewed_by is not None

    def test_approve_already_approved_returns_400(self):
        payload, _ = _register_driver()
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        doc = DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="approved",
        )

        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(f"/admin/documents/{doc.id}/approve/")
        assert response.status_code == 400
        assert "already approved" in response.data["error"]

    def test_approve_nonexistent_document_returns_404(self):
        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post("/admin/documents/99999/approve/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestAdminDocumentRejectView:
    """Tests for POST /admin/documents/{id}/reject/"""

    def test_unauthenticated_returns_401(self):
        response = client.post("/admin/documents/1/reject/")
        assert response.status_code == 401

    def test_non_admin_returns_403(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.post("/admin/documents/1/reject/")
        assert response.status_code == 403

    def test_admin_rejects_document_with_reason(self):
        payload, _ = _register_driver()
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        doc = DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="pending_review",
        )

        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(
            f"/admin/documents/{doc.id}/reject/",
            {"reason": "Document is blurry and unreadable"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["message"] == "Document rejected."
        assert response.data["document"]["status"] == "rejected"
        assert response.data["document"]["rejection_reason"] == "Document is blurry and unreadable"

        # Verify in DB
        doc.refresh_from_db()
        assert doc.status == "rejected"
        assert doc.rejection_reason == "Document is blurry and unreadable"
        assert doc.reviewed_at is not None

    def test_reject_without_reason_returns_400(self):
        payload, _ = _register_driver()
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        doc = DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="pending_review",
        )

        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(
            f"/admin/documents/{doc.id}/reject/",
            {"reason": ""},
            format="json",
        )
        assert response.status_code == 400
        assert "reason" in response.data["error"].lower()

    def test_reject_already_rejected_returns_400(self):
        payload, _ = _register_driver()
        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile

        doc = DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=_make_valid_file("license.pdf"),
            status="rejected",
            rejection_reason="Previous reason",
        )

        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(
            f"/admin/documents/{doc.id}/reject/",
            {"reason": "New reason"},
            format="json",
        )
        assert response.status_code == 400
        assert "already rejected" in response.data["error"]

    def test_reject_nonexistent_document_returns_404(self):
        _, admin_token = _register_admin()
        c = _get_authenticated_client(admin_token)

        response = c.post(
            "/admin/documents/99999/reject/",
            {"reason": "Some reason"},
            format="json",
        )
        assert response.status_code == 404
