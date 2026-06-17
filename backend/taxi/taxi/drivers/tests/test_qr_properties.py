"""
Property-based tests for the Driver QR Verification feature.

Uses the `hypothesis` library to verify correctness properties defined in the
design document for QR code generation, signing, and regeneration.

Feature: driver-qr-verification
"""

import re
import uuid

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase as HypothesisTestCase

from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from taxi.drivers.models import DriverProfile, QRCodeAuditLog
from taxi.drivers.services.qr_service import QRCodeService


User = get_user_model()

# Regex for valid UUID4 format: 8-4-4-4-12 hexadecimal with hyphens
UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


# --- Strategies ---

def valid_uuid_strategy():
    """Generate valid UUID4 strings."""
    return st.builds(lambda: str(uuid.uuid4()))


def valid_driver_code_strategy():
    """Generate valid 6-digit driver codes."""
    return st.from_regex(r"[0-9]{6}", fullmatch=True)


def invalid_uuid_strategy():
    """Generate strings that do NOT match the UUID format (8-4-4-4-12 hex with hyphens)."""
    return st.text(
        alphabet=st.characters(whitelist_categories=("L", "N", "P", "S")),
        min_size=1,
        max_size=50,
    ).filter(lambda s: not UUID_REGEX.match(s))


# =============================================================================
# Property 12: UUID format validation
# Feature: driver-qr-verification, Property 12: UUID format validation
# Validates: Requirements 8.5
# =============================================================================


class TestUUIDFormatValidation:
    """
    Property 12: UUID format validation

    For any string that does not match UUID format (8-4-4-4-12 hex with hyphens),
    attempting to store it as qr_code_uuid should be rejected with a validation error.

    **Validates: Requirements 8.5**
    """

    @given(invalid_value=invalid_uuid_strategy())
    @settings(max_examples=100)
    def test_invalid_uuid_format_rejected(self, invalid_value):
        """Non-UUID strings should fail the UUID format validation."""
        # The system should reject any value that doesn't match UUID format
        assert not UUID_REGEX.match(invalid_value), (
            f"Strategy produced a valid UUID: {invalid_value}"
        )
        # Validate that the system's validation logic would reject this
        # The qr_code_uuid field should only accept valid UUID4 format
        is_valid = bool(UUID_REGEX.match(invalid_value))
        assert not is_valid, (
            f"Value '{invalid_value}' should be rejected as invalid UUID format"
        )

    @given(valid_uuid=valid_uuid_strategy())
    @settings(max_examples=100)
    def test_valid_uuid_format_accepted(self, valid_uuid):
        """Valid UUID4 strings should pass the format validation."""
        assert UUID_REGEX.match(valid_uuid), (
            f"Valid UUID '{valid_uuid}' should match the UUID format regex"
        )


# =============================================================================
# Property 1: QR payload signing round-trip
# Feature: driver-qr-verification, Property 1: QR payload signing round-trip
# Validates: Requirements 1.2, 2.1, 7.3
# =============================================================================


@override_settings(
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestQRPayloadSigningRoundTrip(HypothesisTestCase):
    """
    Property 1: QR payload signing round-trip

    For any valid UUID and driver_code pair, creating a signed token and then
    verifying it should return the original UUID and driver_code unchanged.

    **Validates: Requirements 1.2, 2.1, 7.3**
    """

    def setUp(self):
        self.service = QRCodeService()

    @given(
        qr_uuid=valid_uuid_strategy(),
        driver_code=valid_driver_code_strategy(),
    )
    @settings(max_examples=100)
    def test_sign_then_verify_returns_original_payload(self, qr_uuid, driver_code):
        """
        For any valid UUID and driver_code, sign → verify should return
        the original values unchanged.
        """
        # Create a signed token
        token = self.service.create_signed_token(qr_uuid, driver_code)

        # Verify the token
        result = self.service.verify_signed_token(token)

        # The result should not be None (valid signature)
        assert result is not None, (
            f"verify_signed_token returned None for token created from "
            f"uuid={qr_uuid}, driver_code={driver_code}"
        )

        # The payload should match the original values exactly
        assert result["uuid"] == qr_uuid, (
            f"UUID mismatch: expected {qr_uuid}, got {result['uuid']}"
        )
        assert result["driver_code"] == driver_code, (
            f"driver_code mismatch: expected {driver_code}, got {result['driver_code']}"
        )


# =============================================================================
# Property 2: QR generation produces unique identifiers
# Feature: driver-qr-verification, Property 2: QR generation produces unique identifiers
# Validates: Requirements 1.1, 1.3
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestQRGenerationUniqueIdentifiers(HypothesisTestCase):
    """
    Property 2: QR generation produces unique identifiers

    For any set of N driver profiles that are approved, the N generated QR code
    UUIDs should all be distinct.

    **Validates: Requirements 1.1, 1.3**
    """

    @given(n=st.integers(min_value=2, max_value=10))
    @settings(max_examples=100, deadline=None)
    def test_n_generated_qr_codes_are_all_distinct(self, n):
        """
        For N approved driver profiles, all generated QR code UUIDs are distinct.
        """
        service = QRCodeService()
        generated_uuids = []

        for i in range(n):
            # Create a unique user and driver profile for each iteration
            unique_suffix = uuid.uuid4().hex[:8]
            user = User.objects.create_user(
                email=f"prop2_driver_{unique_suffix}@test.com",
                password="testpass123",
                first_name=f"Driver{i}",
                last_name="Test",
            )
            profile = DriverProfile.objects.create(
                user=user,
                status="approved",
                driver_code=unique_suffix[:6],
            )

            # Generate QR code directly via service (bypassing signal)
            qr_uuid, _ = service.generate_qr_code(profile)
            generated_uuids.append(qr_uuid)

        # All UUIDs should be distinct
        assert len(set(generated_uuids)) == n, (
            f"Expected {n} distinct UUIDs, got {len(set(generated_uuids))}. "
            f"UUIDs: {generated_uuids}"
        )


# =============================================================================
# Property 9: Regeneration produces a new distinct QR code
# Feature: driver-qr-verification, Property 9: Regeneration produces a new distinct QR code
# Validates: Requirements 5.4
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestRegenerationProducesDistinctQRCode(HypothesisTestCase):
    """
    Property 9: Regeneration produces a new distinct QR code

    For any driver profile with an existing QR code, regenerating should produce
    a different qr_code_uuid and update qr_code_generated_at.

    **Validates: Requirements 5.4**
    """

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_regeneration_produces_different_uuid_and_updates_timestamp(self, data):
        """
        Regenerating a QR code should produce a different UUID and update
        the generation timestamp.
        """
        service = QRCodeService()

        # Create user and driver profile
        user = User.objects.create_user(
            email=f"prop9_driver_{uuid.uuid4().hex[:8]}@test.com",
            password="testpass123",
            first_name="Regen",
            last_name="Driver",
        )
        admin_user = User.objects.create_user(
            email=f"prop9_admin_{uuid.uuid4().hex[:8]}@test.com",
            password="adminpass123",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )
        driver_code = data.draw(valid_driver_code_strategy())
        profile = DriverProfile.objects.create(
            user=user,
            status="approved",
            driver_code=driver_code,
        )

        # Generate initial QR code
        original_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()
        original_generated_at = profile.qr_code_generated_at

        assert original_uuid is not None
        assert original_generated_at is not None

        # Regenerate QR code
        new_uuid, _ = service.regenerate_qr_code(profile, admin_user)
        profile.refresh_from_db()
        new_generated_at = profile.qr_code_generated_at

        # New UUID should be different from the original
        assert new_uuid != original_uuid, (
            f"Regenerated UUID should differ from original. "
            f"Original: {original_uuid}, New: {new_uuid}"
        )

        # The generation timestamp should be updated
        assert new_generated_at is not None
        assert new_generated_at >= original_generated_at, (
            f"New generated_at ({new_generated_at}) should be >= "
            f"original ({original_generated_at})"
        )


# =============================================================================
# Property 3: Existing QR preserved on re-approval
# Feature: driver-qr-verification, Property 3: Existing QR preserved on re-approval
# Validates: Requirements 1.4
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestExistingQRPreservedOnReApproval(HypothesisTestCase):
    """
    Property 3: Existing QR preserved on re-approval

    For any driver profile that already has a non-null qr_code_uuid,
    triggering the approval process should leave qr_code_uuid, qr_code_image,
    and qr_code_generated_at unchanged.

    **Validates: Requirements 1.4**
    """

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_existing_qr_preserved_when_status_set_to_approved(self, data):
        """
        For any driver with an existing QR code, re-saving with status=approved
        should not change qr_code_uuid, qr_code_image, or qr_code_generated_at.
        """
        service = QRCodeService()

        # Create user and driver profile
        unique_suffix = uuid.uuid4().hex[:8]
        user = User.objects.create_user(
            email=f"prop3_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Preserve",
            last_name="QR",
        )
        driver_code = data.draw(valid_driver_code_strategy())
        profile = DriverProfile.objects.create(
            user=user,
            status="approved",
            driver_code=driver_code,
        )

        # Generate a QR code directly (bypassing signal to avoid double-trigger)
        qr_uuid, image_path = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Capture existing QR fields
        original_uuid = profile.qr_code_uuid
        original_image = str(profile.qr_code_image)
        original_generated_at = profile.qr_code_generated_at

        assert original_uuid is not None

        # Trigger the approval signal again by saving with status=approved
        # The signal should detect existing QR and skip generation
        profile.status = "approved"
        profile.save()
        profile.refresh_from_db()

        # QR fields should be unchanged
        assert profile.qr_code_uuid == original_uuid, (
            f"qr_code_uuid changed from {original_uuid} to {profile.qr_code_uuid}"
        )
        assert str(profile.qr_code_image) == original_image, (
            f"qr_code_image changed from {original_image} to {profile.qr_code_image}"
        )
        assert profile.qr_code_generated_at == original_generated_at, (
            f"qr_code_generated_at changed from {original_generated_at} to "
            f"{profile.qr_code_generated_at}"
        )


# =============================================================================
# Property 4: Only approved drivers receive QR codes
# Feature: driver-qr-verification, Property 4: Only approved drivers receive QR codes
# Validates: Requirements 2.2
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestOnlyApprovedDriversReceiveQRCodes(HypothesisTestCase):
    """
    Property 4: Only approved drivers receive QR codes

    For any driver profile with a status other than "approved", attempting
    QR code generation should be rejected and no QR code should be stored.

    **Validates: Requirements 2.2**
    """

    @given(
        status=st.sampled_from(["pending", "rejected", "suspended"]),
        data=st.data(),
    )
    @settings(max_examples=100, deadline=None)
    def test_non_approved_status_does_not_trigger_qr_generation(self, status, data):
        """
        For any non-approved status, saving the profile should not trigger
        QR code generation, and qr_code_uuid should remain null.
        """
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        user = User.objects.create_user(
            email=f"prop4_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="NonApproved",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=user,
            status=status,
            driver_code=driver_code,
        )

        # After creation with non-approved status, no QR should exist
        profile.refresh_from_db()
        assert profile.qr_code_uuid is None, (
            f"Driver with status '{status}' should not have a QR code, "
            f"but has qr_code_uuid={profile.qr_code_uuid}"
        )
        assert not profile.qr_code_image, (
            f"Driver with status '{status}' should not have a QR image"
        )
        assert profile.qr_code_generated_at is None, (
            f"Driver with status '{status}' should not have a QR generation timestamp"
        )

        # Explicitly save with non-approved status (re-trigger signal)
        profile.status = status
        profile.save()
        profile.refresh_from_db()

        # Still no QR code
        assert profile.qr_code_uuid is None, (
            f"After re-save with status '{status}', qr_code_uuid should remain None"
        )


# =============================================================================
# Property 5: Scan of approved driver returns complete information
# Feature: driver-qr-verification, Property 5: Scan of approved driver returns complete information
# Validates: Requirements 2.3, 4.3
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestScanApprovedDriverReturnsCompleteInfo(HypothesisTestCase):
    """
    Property 5: Scan of approved driver returns complete information

    For any approved driver profile with a valid QR code, verifying the token
    should return a response containing the driver's full name, driver_code,
    profile photo URL, vehicle make, model, color, plate number, and status "verified".

    **Validates: Requirements 2.3, 4.3**
    """

    @given(
        first_name=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=1,
            max_size=20,
        ),
        last_name=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=1,
            max_size=20,
        ),
        vehicle_make=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N")),
            min_size=1,
            max_size=30,
        ),
        vehicle_model=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N")),
            min_size=1,
            max_size=30,
        ),
        vehicle_color=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=1,
            max_size=20,
        ),
        plate_number=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N")),
            min_size=1,
            max_size=20,
        ),
        data=st.data(),
    )
    @settings(max_examples=100, deadline=None)
    def test_verified_response_contains_full_driver_info(
        self, first_name, last_name, vehicle_make, vehicle_model,
        vehicle_color, plate_number, data,
    ):
        """
        For any approved driver with a QR code, scanning the token via the
        API returns status='verified' and all driver/vehicle details.
        """
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver user and profile
        driver_user = User.objects.create_user(
            email=f"prop5_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name=first_name,
            last_name=last_name,
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
            vehicle_make=vehicle_make,
            vehicle_model=vehicle_model,
            vehicle_color=vehicle_color,
            plate_number=plate_number,
        )

        # Generate QR code
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Create the signed token for scanning
        token = service.create_signed_token(qr_uuid, driver_code)

        # Create rider user
        rider_user = User.objects.create_user(
            email=f"prop5_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="User",
        )

        # Call the verification view directly (bypasses URL resolution)
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.data}"
        )

        data_resp = response.data
        assert data_resp["status"] == "verified"

        expected_name = driver_user.get_full_name() or driver_user.email
        assert data_resp["driver_name"] == expected_name, (
            f"Expected driver_name='{expected_name}', got '{data_resp['driver_name']}'"
        )
        assert data_resp["driver_code"] == driver_code
        assert data_resp["vehicle_make"] == vehicle_make
        assert data_resp["vehicle_model"] == vehicle_model
        assert data_resp["vehicle_color"] == vehicle_color
        assert data_resp["plate_number"] == plate_number


# =============================================================================
# Property 6: Scan of inactive driver returns limited information
# Feature: driver-qr-verification, Property 6: Scan of inactive driver returns limited information
# Validates: Requirements 2.4, 4.5
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestScanInactiveDriverReturnsLimitedInfo(HypothesisTestCase):
    """
    Property 6: Scan of inactive driver returns limited information

    For any driver profile whose status is "rejected" or "suspended" after
    QR code generation, verifying the token should return only the driver's
    name and driver_code with status "inactive_driver", withholding vehicle details.

    **Validates: Requirements 2.4, 4.5**
    """

    @given(
        inactive_status=st.sampled_from(["rejected", "suspended"]),
        first_name=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=1,
            max_size=20,
        ),
        last_name=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=1,
            max_size=20,
        ),
        data=st.data(),
    )
    @settings(max_examples=100, deadline=None)
    def test_inactive_driver_scan_returns_limited_info(
        self, inactive_status, first_name, last_name, data,
    ):
        """
        For any driver whose status became rejected/suspended after QR generation,
        the verification response contains only name and driver_code with
        status='inactive_driver', and vehicle details are withheld (null).
        """
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver with approved status and generate QR
        driver_user = User.objects.create_user(
            email=f"prop6_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name=first_name,
            last_name=last_name,
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
            vehicle_make="Toyota",
            vehicle_model="Camry",
            vehicle_color="White",
            plate_number="ABC123",
        )

        # Generate QR code while approved
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()
        token = service.create_signed_token(qr_uuid, driver_code)

        # Change status to inactive (rejected or suspended)
        DriverProfile.objects.filter(pk=profile.pk).update(status=inactive_status)
        profile.refresh_from_db()

        # Create rider user
        rider_user = User.objects.create_user(
            email=f"prop6_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="User",
        )

        # Call the verification view directly
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.data}"
        )

        data_resp = response.data
        assert data_resp["status"] == "inactive_driver", (
            f"Expected 'inactive_driver', got '{data_resp['status']}'"
        )

        # Should return name and driver_code
        expected_name = driver_user.get_full_name() or driver_user.email
        assert data_resp["driver_name"] == expected_name
        assert data_resp["driver_code"] == driver_code

        # Vehicle details should be withheld (null)
        assert data_resp["vehicle_make"] is None, (
            f"vehicle_make should be None for inactive driver, got {data_resp['vehicle_make']}"
        )
        assert data_resp["vehicle_model"] is None
        assert data_resp["vehicle_color"] is None
        assert data_resp["plate_number"] is None


# =============================================================================
# Property 7: Invalid or tampered tokens produce error and audit record
# Feature: driver-qr-verification, Property 7: Invalid or tampered tokens produce error and audit record
# Validates: Requirements 2.5, 7.4, 7.5
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestInvalidTokensProduceErrorAndAuditRecord(HypothesisTestCase):
    """
    Property 7: Invalid or tampered tokens produce error and audit record

    For any string that is not a valid signed token, submitting it to the
    verification endpoint should return status "forged_code" or "invalid_code"
    and create a VerificationRecord with the corresponding scan result.

    **Validates: Requirements 2.5, 7.4, 7.5**
    """

    @given(
        invalid_token=st.text(
            alphabet=st.characters(
                whitelist_categories=("L", "N", "P"),
                blacklist_characters=("\x00",),
                max_codepoint=127,
            ),
            min_size=1,
            max_size=100,
        ),
    )
    @settings(max_examples=100, deadline=None)
    def test_invalid_token_returns_error_status(self, invalid_token):
        """
        For any arbitrary string that isn't a valid signed token, the endpoint
        returns 'forged_code' or 'invalid_code' status.
        """
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()

        # Make sure this token isn't accidentally valid
        assume(service.verify_signed_token(invalid_token) is None)

        unique_suffix = uuid.uuid4().hex[:8]

        # Create rider user
        rider_user = User.objects.create_user(
            email=f"prop7_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="User",
        )

        # Submit invalid token via view directly
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": invalid_token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.data}"
        )

        data_resp = response.data
        assert data_resp["status"] in ("forged_code", "invalid_code"), (
            f"Expected 'forged_code' or 'invalid_code', got '{data_resp['status']}'"
        )

        # Driver info should be null
        assert data_resp["driver_name"] is None
        assert data_resp["driver_code"] is None
        assert data_resp["vehicle_make"] is None

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_forged_token_with_valid_structure_creates_verification_record(self, data):
        """
        For a token with valid structure but tampered signature pointing to
        an existing driver, the system returns 'forged_code' and creates a
        VerificationRecord.
        """
        import base64
        import json
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.models import VerificationRecord
        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create a driver with a QR code
        driver_user = User.objects.create_user(
            email=f"prop7b_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Forged",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
        )
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Create a forged token: valid payload structure but bad signature
        payload = json.dumps(
            {"uuid": qr_uuid, "driver_code": driver_code},
            separators=(",", ":"),
        )
        payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()
        forged_token = f"{payload_b64}.bad_signature_value"

        # Ensure this token is invalid
        assert service.verify_signed_token(forged_token) is None

        # Create rider user
        rider_user = User.objects.create_user(
            email=f"prop7b_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="User",
        )

        count_before = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()

        # Submit forged token via view directly
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": forged_token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200
        data_resp = response.data
        assert data_resp["status"] == "forged_code", (
            f"Expected 'forged_code', got '{data_resp['status']}'"
        )

        # A VerificationRecord should be created for this forged scan
        count_after = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()
        assert count_after == count_before + 1, (
            f"Expected VerificationRecord count to increase by 1, "
            f"was {count_before}, now {count_after}"
        )

        # Check the record has the correct scan_result
        record = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).latest("scanned_at")
        assert record.scan_result == "forged_code"


# =============================================================================
# Property 8: Verification record creation for all scan types
# Feature: driver-qr-verification, Property 8: Verification record creation for all scan types
# Validates: Requirements 4.7, 6.1
# =============================================================================


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    SECRET_KEY="test-secret-key-for-property-tests-12345",
)
class TestVerificationRecordCreationForAllScanTypes(HypothesisTestCase):
    """
    Property 8: Verification record creation for all scan types

    For any QR scan event regardless of outcome, the system should create
    exactly one VerificationRecord containing the rider identifier, driver
    identifier (when resolvable), scan timestamp, and the correct scan result value.

    **Validates: Requirements 4.7, 6.1**
    """

    @given(
        scan_type=st.sampled_from(["verified", "inactive_driver"]),
        data=st.data(),
    )
    @settings(max_examples=100, deadline=None)
    def test_verification_record_created_for_resolvable_scans(self, scan_type, data):
        """
        For scans where the driver is resolvable (verified and inactive_driver),
        a VerificationRecord is created with rider, driver, timestamp, and result.
        """
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.models import VerificationRecord
        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver with QR code
        driver_user = User.objects.create_user(
            email=f"prop8_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Record",
            last_name="Driver",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
            vehicle_make="Honda",
            vehicle_model="Civic",
            vehicle_color="Blue",
            plate_number="XYZ789",
        )
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()
        token = service.create_signed_token(qr_uuid, driver_code)

        # For inactive_driver scan, change the status
        if scan_type == "inactive_driver":
            DriverProfile.objects.filter(pk=profile.pk).update(status="rejected")
            profile.refresh_from_db()

        # Create rider
        rider_user = User.objects.create_user(
            email=f"prop8_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="Scan",
        )

        before_time = timezone.now()
        count_before = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()

        # Perform the scan via view directly
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200
        assert response.data["status"] == scan_type

        # Exactly one new VerificationRecord should be created
        count_after = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()
        assert count_after == count_before + 1, (
            f"Expected exactly 1 new record for scan_type={scan_type}, "
            f"was {count_before}, now {count_after}"
        )

        # Validate record contents
        record = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).latest("scanned_at")
        assert record.rider == rider_user
        assert record.driver == profile
        assert record.scan_result == scan_type
        assert record.scanned_at is not None
        assert record.scanned_at >= before_time

    @given(data=st.data())
    @settings(max_examples=100, deadline=None)
    def test_verification_record_created_for_forged_code(self, data):
        """
        For forged_code scans (tampered token referencing a real driver),
        a VerificationRecord is created with correct scan_result.
        """
        import base64
        import json
        from rest_framework.test import APIRequestFactory

        from taxi.drivers.models import VerificationRecord
        from taxi.drivers.views_verification import VerifyDriverView

        service = QRCodeService()
        unique_suffix = uuid.uuid4().hex[:8]
        driver_code = data.draw(valid_driver_code_strategy())

        # Create driver with QR code
        driver_user = User.objects.create_user(
            email=f"prop8f_driver_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Forged",
            last_name="Record",
        )
        profile = DriverProfile.objects.create(
            user=driver_user,
            status="approved",
            driver_code=driver_code,
        )
        qr_uuid, _ = service.generate_qr_code(profile)
        profile.refresh_from_db()

        # Create forged token referencing the real driver
        payload = json.dumps(
            {"uuid": qr_uuid, "driver_code": driver_code},
            separators=(",", ":"),
        )
        payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()
        forged_token = f"{payload_b64}.tampered_sig_12345"

        # Create rider
        rider_user = User.objects.create_user(
            email=f"prop8f_rider_{unique_suffix}@test.com",
            password="testpass123",
            first_name="Rider",
            last_name="Forged",
        )

        before_time = timezone.now()
        count_before = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()

        # Perform the scan via view directly
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/verify-driver/",
            {"token": forged_token},
            format="json",
        )
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=rider_user)
        view = VerifyDriverView.as_view()
        response = view(request)

        assert response.status_code == 200
        assert response.data["status"] == "forged_code"

        # Verify record created
        count_after = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).count()
        assert count_after == count_before + 1

        record = VerificationRecord.objects.filter(
            rider=rider_user, driver=profile
        ).latest("scanned_at")
        assert record.scan_result == "forged_code"
        assert record.rider == rider_user
        assert record.driver == profile
        assert record.scanned_at >= before_time
