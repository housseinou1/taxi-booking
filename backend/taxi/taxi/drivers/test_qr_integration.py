"""
Integration test to verify end-to-end QR code generation wiring.

Tests: create driver → assign driver_code → approve → QR code generated

Requirements: 1.1, 1.6
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from taxi.drivers.models import DriverProfile


User = get_user_model()


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class QRCodeEndToEndWiringTest(TestCase):
    """Verify that the signal → Celery task → QR service pipeline works."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="driver_test_qr@example.com",
            password="testpass123",
            first_name="Test",
            last_name="Driver",
        )

    def test_approval_with_driver_code_generates_qr(self):
        """
        End-to-end: create driver profile → assign driver_code → approve
        → QR code is generated and stored on the profile.
        """
        # Create a driver profile in pending state with a driver_code
        profile = DriverProfile.objects.create(
            user=self.user,
            status="pending",
            driver_code="123456",
        )

        # Approve the driver — this should trigger the signal → task → QR gen
        profile.status = "approved"
        profile.save()

        # Refresh from DB
        profile.refresh_from_db()

        # Verify QR code was generated
        assert profile.qr_code_uuid is not None, "qr_code_uuid should be set after approval"
        assert profile.qr_code_image is not None, "qr_code_image should be set after approval"
        assert profile.qr_code_image.name != "", "qr_code_image should have a file path"
        assert profile.qr_code_generated_at is not None, "qr_code_generated_at should be set"

    def test_approval_without_driver_code_auto_assigns(self):
        """
        End-to-end: approving a driver without driver_code auto-assigns one
        and still generates the QR code.
        """
        profile = DriverProfile.objects.create(
            user=self.user,
            status="pending",
            driver_code=None,
        )

        # Approving with no driver_code auto-assigns one instead of rejecting.
        profile.status = "approved"
        profile.save()

        # Verify the approval stuck and a driver_code + QR code were assigned.
        profile.refresh_from_db()
        assert profile.status == "approved"
        assert profile.driver_code
        assert profile.qr_code_uuid is not None

    def test_reapproval_preserves_existing_qr(self):
        """
        End-to-end: if a driver already has a QR code, re-approving
        should not regenerate it.
        """
        # Create approved driver with QR code
        profile = DriverProfile.objects.create(
            user=self.user,
            status="pending",
            driver_code="654321",
        )
        profile.status = "approved"
        profile.save()
        profile.refresh_from_db()

        original_uuid = profile.qr_code_uuid
        original_generated_at = profile.qr_code_generated_at

        assert original_uuid is not None

        # Simulate re-approval (e.g., status goes pending then approved again)
        # First, change to a different status without signal trigger concern
        DriverProfile.objects.filter(pk=profile.pk).update(status="pending")
        profile.refresh_from_db()

        # Now approve again
        profile.status = "approved"
        profile.save()
        profile.refresh_from_db()

        # QR should be preserved (existing QR = skip)
        assert profile.qr_code_uuid == original_uuid
        assert profile.qr_code_generated_at == original_generated_at
