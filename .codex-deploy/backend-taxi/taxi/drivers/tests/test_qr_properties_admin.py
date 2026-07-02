"""
Property-based tests for admin-related QR verification features.

Property 10: Old QR code invalidated after regeneration
Property 11: QR field is read-only on driver-facing endpoints

Feature: driver-qr-verification
"""

import uuid

from hypothesis import given, settings, assume
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase as HypothesisTestCase

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from taxi.drivers.models import DriverProfile
from taxi.drivers.services.qr_service import QRCodeService
from taxi.drivers.views_verification import VerifyDriverView

User = get_user_model()


# --- Strategies ---

def valid_driver_code_strategy():
    """Generate valid 6-digit driver codes."""
    return st.from_regex(r"[0-9]{6}", fullmatch=True)


# =============================================================================
# Property 11: QR field is read-only on driver-facing endpoints
# Feature: driver-qr-verification, Property 11: QR field is read-only on driver-facing endpoints
# Validates: Requirements 7.2, 7.7
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestQRFieldReadOnlyOnDriverEndpoints(HypothesisTestCase):
    """
    Property 11: QR field is read-only on driver-facing endpoints

    For any request payload sent to a driver-facing API endpoint that contains
    qr_code_uuid, qr_code_image, or qr_code_generated_at fields, the stored
    values on the DriverProfile should remain unchanged after the request completes.

    **Validates: Requirements 7.2, 7.7**
    """

    @given(
        attempted_uuid=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N")),
            min_size=1,
            max_size=36,
        ),
        attempted_image=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "P")),
            min_size=1,
            max_size=50,
        ),
        data=st.data(),
    )
    @settings(max_examples=100, deadline=None)
    def test_qr_fields_unchanged_after_driver_update(
        self, attempted_uuid, attempted_image, data
    ):
        """
        For any request payload containing qr_code_uuid, qr_code_image, or
        qr_code_generated_at, the stored QR values remain unchanged after
        the driver profile update request completes.
        """
        from taxi.drivers.views import update_driver_profile

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver user and profile with an existing QR code
        driver_user = User.objects.create_user(
            email=f"prop11_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="ReadOnly",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
            vehicle_make="Toyota",
            vehicle_model="Camry",
            vehicle_color="White",
            plate_number="AB1234",
            phone_number="12345678",
        )

        # Generate a real QR code first
        qr_uuid, image_path = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Record original QR field values
        original_uuid = profile.qr_code_uuid
        original_image = str(profile.qr_code_image)
        original_generated_at = profile.qr_code_generated_at

        assert original_uuid is not None

        # Attempt to update QR fields via the driver-facing update endpoint
        factory = APIRequestFactory()
        request = factory.patch(
            "/drivers/profile/update/",
            {
                "qr_code_uuid": attempted_uuid,
                "qr_code_image": attempted_image,
                "qr_code_generated_at": "2099-01-01T00:00:00Z",
                "vehicle_color": "Blue",  # A legitimate field to ensure the request processes
            },
            format="json",
        )
        force_authenticate(request, user=driver_user)
        response = update_driver_profile(request)

        # Refresh the profile from database
        profile.refresh_from_db()

        # QR fields should remain unchanged regardless of the payload
        assert profile.qr_code_uuid == original_uuid, (
            f"qr_code_uuid was changed from '{original_uuid}' to '{profile.qr_code_uuid}' "
            f"after driver attempted to set it to '{attempted_uuid}'"
        )
        assert str(profile.qr_code_image) == original_image, (
            f"qr_code_image was changed from '{original_image}' to '{profile.qr_code_image}' "
            f"after driver attempted to set it to '{attempted_image}'"
        )
        assert profile.qr_code_generated_at == original_generated_at, (
            f"qr_code_generated_at was changed from '{original_generated_at}' to "
            f"'{profile.qr_code_generated_at}'"
        )


# =============================================================================
# Property 10: Old QR code invalidated after regeneration
# Feature: driver-qr-verification, Property 10: Old QR code invalidated after regeneration
# Validates: Requirements 5.6
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestOldQRCodeInvalidatedAfterRegeneration(HypothesisTestCase):
    """
    Property 10: Old QR code invalidated after regeneration

    For any driver whose QR code has been regenerated, scanning the previous
    (old) signed token should return "invalid_code".

    **Validates: Requirements 5.6**
    """

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_old_qr_token_returns_invalid_code_after_regeneration(self, data):
        """
        After regeneration, scanning the old signed token should return
        "invalid_code" because the old UUID no longer resolves to any driver.
        """
        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver user and profile
        driver_user = User.objects.create_user(
            email=f"prop10_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Regen",
            last_name="Invalid",
        )
        admin_user = User.objects.create_user(
            email=f"prop10_admin_{unique_suffix}@test.com",
            password="adminpass123",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
            vehicle_make="Honda",
            vehicle_model="Civic",
            vehicle_color="Black",
            plate_number="XY9876",
        )

        # Generate initial QR code
        old_qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Create the old token (this is what would have been in the old QR image)
        old_token = service.create_signed_token(old_qr_uuid, driver_code)

        # Regenerate QR code (this invalidates the old UUID)
        new_qr_uuid, _ = service.regenerate_qr_code(profile, admin_user)
        profile.refresh_from_db()

        # Verify old UUID is different from new UUID
        assert old_qr_uuid != new_qr_uuid

        # Now scan the OLD token via the verification endpoint
        rider_user = User.objects.create_user(
            email=f"prop10_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="Scanner",
        )

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": old_token},
            format="json",
        )
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.data}"
        )

        # The old token should return "invalid_code" because the UUID
        # no longer matches any driver profile's qr_code_uuid
        assert response.data["status"] == "invalid_code", (
            f"Expected 'invalid_code' for old token after regeneration, "
            f"got '{response.data['status']}'. Old UUID: {old_qr_uuid}, "
            f"New UUID: {new_qr_uuid}"
        )
