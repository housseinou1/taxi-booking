"""
Unit and integration tests for admin QR code endpoints and end-to-end flows.

Task 8.3: Unit tests for admin endpoints
Task 10.2: Integration tests for end-to-end flows

Feature: driver-qr-verification
"""

import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from taxi.drivers.models import (
    DriverProfile,
    QRCodeAuditLog,
    VerificationRecord,
)
from taxi.drivers.services.qr_service import QRCodeService, QRGenerationError
from taxi.drivers.views_verification import (
    AdminDriverVerificationHistoryView,
    AdminRegenerateQRCodeView,
    AdminRiderVerificationHistoryView,
    VerifyDriverView,
)

User = get_user_model()


# =============================================================================
# Task 8.3: Unit tests for admin endpoints
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestAdminRegenerateQRCodeEndpoint(TestCase):
    """Unit tests for the AdminRegenerateQRCodeView."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.service = QRCodeService()

        # Create admin user
        self.admin_user = User.objects.create_user(
            email="admin_regen@test.com",
            password="adminpass123",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )

        # Create regular (non-admin) user
        self.regular_user = User.objects.create_user(
            email="regular_user@test.com",
            password="testpass123",
            first_name="Regular",
            last_name="User",
            is_staff=False,
        )

        # Create driver user and profile with QR code
        self.driver_user = User.objects.create_user(
            email="driver_regen@test.com",
            password="testpass123",
            first_name="Driver",
            last_name="Regen",
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            driver_code="123456",
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            vehicle_color="White",
            plate_number="ABC123",
        )
        # Generate initial QR code
        self.service.generate_qr_code(self.driver_profile)
        self.driver_profile.refresh_from_db()

    def test_regeneration_failure_after_5_attempts(self):
        """
        Test regeneration failure after 5 attempts (Req 5.5).

        When UUID generation fails after 5 attempts, the endpoint should return
        500 with error message and leave existing QR code unchanged.
        """
        original_uuid = self.driver_profile.qr_code_uuid
        original_image = str(self.driver_profile.qr_code_image)
        original_generated_at = self.driver_profile.qr_code_generated_at

        # Mock _generate_unique_uuid to always raise QRGenerationError
        with patch.object(
            QRCodeService,
            "_generate_unique_uuid",
            side_effect=QRGenerationError(
                "Could not generate unique QR code after 5 attempts"
            ),
        ):
            request = self.factory.post(
                f"/api/v1/admin/drivers/{self.driver_profile.pk}/regenerate-qr/"
            )
            force_authenticate(request, user=self.admin_user)
            view = AdminRegenerateQRCodeView.as_view()
            response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 500)
        self.assertIn("error", response.data)
        self.assertEqual(response.data["error_code"], "QR_GENERATION_FAILED")

        # Verify existing QR code is unchanged
        self.driver_profile.refresh_from_db()
        self.assertEqual(self.driver_profile.qr_code_uuid, original_uuid)
        self.assertEqual(str(self.driver_profile.qr_code_image), original_image)
        self.assertEqual(
            self.driver_profile.qr_code_generated_at, original_generated_at
        )

    def test_audit_log_creation_on_regeneration(self):
        """
        Test audit log creation on regeneration (Req 5.7).

        When an admin regenerates a QR code, a QRCodeAuditLog entry should be
        created with the admin, driver, action, old UUID and new UUID.
        """
        old_uuid = self.driver_profile.qr_code_uuid
        initial_log_count = QRCodeAuditLog.objects.count()

        request = self.factory.post(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/regenerate-qr/"
        )
        force_authenticate(request, user=self.admin_user)
        view = AdminRegenerateQRCodeView.as_view()
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 200)

        # Verify audit log was created
        self.assertEqual(QRCodeAuditLog.objects.count(), initial_log_count + 1)

        audit_log = QRCodeAuditLog.objects.latest("performed_at")
        self.assertEqual(audit_log.admin, self.admin_user)
        self.assertEqual(audit_log.driver, self.driver_profile)
        self.assertEqual(audit_log.action, "regenerated")
        self.assertEqual(audit_log.old_qr_uuid, old_uuid)
        self.assertIsNotNone(audit_log.new_qr_uuid)
        self.assertNotEqual(audit_log.new_qr_uuid, old_uuid)

    def test_non_admin_cannot_access_regenerate_endpoint(self):
        """
        Test non-admin cannot access admin endpoints.

        A non-admin user should receive 403 Forbidden.
        """
        request = self.factory.post(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/regenerate-qr/"
        )
        force_authenticate(request, user=self.regular_user)
        view = AdminRegenerateQRCodeView.as_view()
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 403)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestAdminVerificationHistoryEndpoint(TestCase):
    """Unit tests for admin verification history endpoints."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.service = QRCodeService()

        # Create admin user
        self.admin_user = User.objects.create_user(
            email="admin_history@test.com",
            password="adminpass123",
            first_name="Admin",
            last_name="History",
            is_staff=True,
        )

        # Create regular (non-admin) user
        self.regular_user = User.objects.create_user(
            email="regular_history@test.com",
            password="testpass123",
            first_name="Regular",
            last_name="History",
            is_staff=False,
        )

        # Create driver user and profile
        self.driver_user = User.objects.create_user(
            email="driver_history@test.com",
            password="testpass123",
            first_name="Driver",
            last_name="History",
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            status="approved",
            driver_code="654321",
            vehicle_make="Honda",
            vehicle_model="Civic",
            vehicle_color="Black",
            plate_number="XYZ789",
        )

        # Create rider user
        self.rider_user = User.objects.create_user(
            email="rider_history@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="History",
        )

    def test_pagination_of_driver_verification_history(self):
        """
        Test pagination of verification history (Req 6.2, 6.3).

        Verification history should be paginated with 50 records per page,
        sorted by timestamp descending.
        """
        # Create 55 verification records for this driver
        for i in range(55):
            VerificationRecord.objects.create(
                rider=self.rider_user,
                driver=self.driver_profile,
                scan_result="verified",
            )

        # Request page 1
        request = self.factory.get(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/verification-history/"
        )
        force_authenticate(request, user=self.admin_user)
        view = AdminDriverVerificationHistoryView.as_view()
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 55)
        self.assertEqual(len(response.data["results"]), 50)
        self.assertIsNotNone(response.data["next"])  # There is a next page

        # Request page 2
        request = self.factory.get(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/verification-history/",
            {"page": 2},
        )
        force_authenticate(request, user=self.admin_user)
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNone(response.data["next"])  # No more pages

    def test_pagination_of_rider_verification_history(self):
        """
        Test pagination of rider verification history (Req 6.4).

        Rider verification history should also paginate at 50 records per page.
        """
        # Create 55 verification records for this rider
        for i in range(55):
            VerificationRecord.objects.create(
                rider=self.rider_user,
                driver=self.driver_profile,
                scan_result="verified",
            )

        # Request page 1
        request = self.factory.get(
            f"/api/v1/admin/riders/{self.rider_user.pk}/verification-history/"
        )
        force_authenticate(request, user=self.admin_user)
        view = AdminRiderVerificationHistoryView.as_view()
        response = view(request, rider_id=self.rider_user.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 55)
        self.assertEqual(len(response.data["results"]), 50)

    def test_empty_driver_verification_history_response(self):
        """
        Test empty verification history response (Req 6.5).

        When a driver has no verification records, the endpoint should return
        a message indicating no history exists.
        """
        request = self.factory.get(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/verification-history/"
        )
        force_authenticate(request, user=self.admin_user)
        view = AdminDriverVerificationHistoryView.as_view()
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.data)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)

    def test_empty_rider_verification_history_response(self):
        """
        Test empty rider verification history response (Req 6.5).
        """
        request = self.factory.get(
            f"/api/v1/admin/riders/{self.rider_user.pk}/verification-history/"
        )
        force_authenticate(request, user=self.admin_user)
        view = AdminRiderVerificationHistoryView.as_view()
        response = view(request, rider_id=self.rider_user.pk)

        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.data)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)

    def test_non_admin_cannot_access_driver_history(self):
        """Test non-admin cannot access driver verification history endpoint."""
        request = self.factory.get(
            f"/api/v1/admin/drivers/{self.driver_profile.pk}/verification-history/"
        )
        force_authenticate(request, user=self.regular_user)
        view = AdminDriverVerificationHistoryView.as_view()
        response = view(request, driver_id=self.driver_profile.pk)

        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_access_rider_history(self):
        """Test non-admin cannot access rider verification history endpoint."""
        request = self.factory.get(
            f"/api/v1/admin/riders/{self.rider_user.pk}/verification-history/"
        )
        force_authenticate(request, user=self.regular_user)
        view = AdminRiderVerificationHistoryView.as_view()
        response = view(request, rider_id=self.rider_user.pk)

        self.assertEqual(response.status_code, 403)


# =============================================================================
# Task 10.2: Integration tests for end-to-end flows
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestFullApprovalFlow(TestCase):
    """
    Integration test: full approval flow.

    Create driver → assign driver_code → approve → verify QR stored.
    """

    def test_approval_generates_qr_code(self):
        """
        Full approval flow: create driver → assign driver_code → approve →
        verify QR code is stored on the profile.
        """
        # Create a driver user
        driver_user = User.objects.create_user(
            email="integration_approval@test.com",
            password="testpass123",
            first_name="Approval",
            last_name="Flow",
        )

        # Create driver profile in pending state with driver_code
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="pending",
            driver_code="111222",
            vehicle_make="Ford",
            vehicle_model="Focus",
            vehicle_color="Red",
            plate_number="INT001",
        )

        # Verify no QR code initially
        self.assertIsNone(profile.qr_code_uuid)
        self.assertFalse(profile.qr_code_image)
        self.assertIsNone(profile.qr_code_generated_at)

        # Approve the driver (triggers signal → Celery task → QR generation)
        profile.status = "approved"
        profile.save()

        # Refresh and verify QR code was generated
        profile.refresh_from_db()
        self.assertIsNotNone(profile.qr_code_uuid)
        self.assertTrue(profile.qr_code_image)
        self.assertIsNotNone(profile.qr_code_generated_at)

        # Verify UUID format
        import re
        uuid_regex = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )
        self.assertTrue(uuid_regex.match(profile.qr_code_uuid))


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestFullScanFlow(TestCase):
    """
    Integration test: full scan flow.

    Scan valid QR → API returns driver info → VerificationRecord created.
    """

    def test_scan_valid_qr_returns_driver_info_and_creates_record(self):
        """
        Full scan flow: scan a valid QR code token via the verify endpoint,
        verify the response contains driver info and a VerificationRecord
        is created.
        """
        service = QRCodeService()
        factory = APIRequestFactory()

        # Create driver with QR code
        driver_user = User.objects.create_user(
            email="integration_scan_driver@test.com",
            password="testpass123",
            first_name="Scan",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code="333444",
            vehicle_make="BMW",
            vehicle_model="X3",
            vehicle_color="Silver",
            plate_number="SCAN01",
        )
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Create the token as if scanned from QR
        token = service.create_signed_token(qr_uuid, "333444")

        # Create rider who will scan
        rider_user = User.objects.create_user(
            email="integration_scan_rider@test.com",
            password="testpass123",
            first_name="Scan",
            last_name="Rider",
        )

        # Verify no records exist yet
        initial_count = VerificationRecord.objects.count()

        # Perform the scan
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": token},
            format="json",
        )
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "verified")
        self.assertEqual(response.data["driver_name"], "Scan Driver")
        self.assertEqual(response.data["driver_code"], "333444")
        self.assertEqual(response.data["vehicle_make"], "BMW")
        self.assertEqual(response.data["vehicle_model"], "X3")
        self.assertEqual(response.data["vehicle_color"], "Silver")
        self.assertEqual(response.data["plate_number"], "SCAN01")

        # Verify VerificationRecord was created
        self.assertEqual(VerificationRecord.objects.count(), initial_count + 1)
        record = VerificationRecord.objects.latest("scanned_at")
        self.assertEqual(record.rider, rider_user)
        self.assertEqual(record.driver, profile)
        self.assertEqual(record.scan_result, "verified")


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestRegenerationFlow(TestCase):
    """
    Integration test: regeneration flow.

    Regenerate → old code invalid → new code valid.
    """

    def test_regeneration_invalidates_old_and_validates_new(self):
        """
        Regeneration flow: after regeneration, the old token returns
        invalid_code and the new token returns verified.
        """
        service = QRCodeService()
        factory = APIRequestFactory()

        # Create driver with QR code
        driver_user = User.objects.create_user(
            email="integration_regen_driver@test.com",
            password="testpass123",
            first_name="Regen",
            last_name="Flow",
        )
        admin_user = User.objects.create_user(
            email="integration_regen_admin@test.com",
            password="adminpass123",
            first_name="Admin",
            last_name="Regen",
            is_staff=True,
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code="555666",
            vehicle_make="Mercedes",
            vehicle_model="C-Class",
            vehicle_color="Blue",
            plate_number="REGEN1",
        )

        # Generate initial QR code
        old_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()
        old_token = service.create_signed_token(old_uuid, "555666")

        # Regenerate
        new_uuid, _ = service.regenerate_qr_code(profile, admin_user)
        profile.refresh_from_db()
        new_token = service.create_signed_token(new_uuid, "555666")

        # Create rider
        rider_user = User.objects.create_user(
            email="integration_regen_rider@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="Regen",
        )

        # Scan OLD token → should return invalid_code
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": old_token},
            format="json",
        )
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "invalid_code")

        # Scan NEW token → should return verified
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": new_token},
            format="json",
        )
        force_authenticate(request, user=rider_user)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "verified")
        self.assertEqual(response.data["driver_name"], "Regen Flow")
        self.assertEqual(response.data["driver_code"], "555666")


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestApprovalAutoAssignsMissingDriverCode(TestCase):
    """
    Integration test: approving a driver without a driver_code auto-assigns one
    and proceeds with QR generation (Req 1.7).
    """

    def test_approval_auto_assigns_missing_driver_code(self):
        """
        When a driver profile without a driver_code is set to approved,
        the signal auto-assigns a driver_code and generates the QR code.
        """
        driver_user = User.objects.create_user(
            email="integration_nocode@test.com",
            password="testpass123",
            first_name="NoCode",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="pending",
            driver_code=None,  # No driver code
        )

        # Approving without a driver_code no longer raises — it auto-assigns one.
        profile.status = "approved"
        profile.save()

        # Verify the approval stuck and a driver_code + QR code were assigned.
        profile.refresh_from_db()
        self.assertEqual(profile.status, "approved")
        self.assertTrue(profile.driver_code)
        self.assertIsNotNone(profile.qr_code_uuid)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestQRGenerationFailureWithUUIDCollision(TestCase):
    """
    Integration test: QR generation failure after 5 attempts with mocked
    UUID collision (Req 1.5).
    """

    def test_qr_generation_fails_after_5_uuid_collisions(self):
        """
        When uuid4 always returns the same UUID that already exists in the
        database, QR generation should fail after 5 attempts and raise
        QRGenerationError.
        """
        service = QRCodeService()

        # Create a driver that already has a QR code with a specific UUID
        # Use pending status to avoid the signal generating a QR code
        existing_user = User.objects.create_user(
            email="existing_qr@test.com",
            password="testpass123",
            first_name="Existing",
            last_name="QR",
        )
        existing_profile = DriverProfile.objects.create(
            user=existing_user,
            status="pending",
            driver_code="999888",
        )
        # Set a known UUID on the existing profile directly
        colliding_uuid = "12345678-1234-1234-1234-123456789abc"
        DriverProfile.objects.filter(pk=existing_profile.pk).update(
            qr_code_uuid=colliding_uuid
        )

        # Create a new driver that needs a QR code (pending to avoid signal)
        new_user = User.objects.create_user(
            email="new_collision@test.com",
            password="testpass123",
            first_name="New",
            last_name="Collision",
        )
        new_profile = DriverProfile.objects.create(
            user=new_user,
            status="pending",
            driver_code="777666",
        )

        # Mock uuid.uuid4 at the module where it's used so it always
        # returns the colliding UUID
        with patch(
            "taxi.drivers.services.qr_service.uuid.uuid4",
            return_value=uuid.UUID(colliding_uuid),
        ):
            with self.assertRaises(QRGenerationError) as ctx:
                service.generate_qr_code(new_profile)

        self.assertIn("5 attempts", str(ctx.exception))

        # Verify no QR code was stored on the new profile
        new_profile.refresh_from_db()
        self.assertIsNone(new_profile.qr_code_uuid)
