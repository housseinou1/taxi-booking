# Implementation Plan: Driver QR Verification

## Overview

Implement a QR code verification system for the Yala platform where approved drivers receive cryptographically signed QR codes that riders can scan to verify driver identity. The implementation uses Django/DRF backend with Celery for async QR generation, HMAC-SHA256 signing, and new models for verification records and audit logging.

## Tasks

- [x] 1. Database models and migrations
  - [x] 1.1 Add QR code fields to DriverProfile model and create VerificationRecord and QRCodeAuditLog models
    - Add `qr_code_uuid` (CharField, max_length=36, unique, nullable, db_index), `qr_code_image` (FileField, upload_to="drivers/qr_codes/", nullable), and `qr_code_generated_at` (DateTimeField, nullable) to `DriverProfile` in `taxi/taxi/drivers/models.py`
    - Create `VerificationRecord` model with fields: `rider` (FK to User), `driver` (FK to DriverProfile), `scanned_at` (DateTimeField, auto_now_add), `scan_result` (CharField with choices: verified, inactive_driver, invalid_code, forged_code)
    - Create `QRCodeAuditLog` model with fields: `admin` (FK to User, nullable), `driver` (FK to DriverProfile), `action` (CharField with choices: generated, regenerated), `old_qr_uuid` (CharField, nullable), `new_qr_uuid` (CharField), `performed_at` (DateTimeField, auto_now_add)
    - Add database indexes on VerificationRecord: `["-scanned_at"]`, `["rider", "-scanned_at"]`, `["driver", "-scanned_at"]`
    - Generate and apply Django migration
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 1.2 Write property test for UUID format validation
    - **Property 12: UUID format validation**
    - **Validates: Requirements 8.5**

- [x] 2. QR Code Generator Service
  - [x] 2.1 Implement QRCodeService with signing and generation logic
    - Create `taxi/taxi/drivers/services/qr_service.py`
    - Implement `create_signed_token(qr_uuid, driver_code)`: creates HMAC-SHA256 signed token using `base64(json({uuid, driver_code})).signature` format with Django `SECRET_KEY`
    - Implement `verify_signed_token(token)`: verifies signature and returns payload dict or None
    - Implement `generate_qr_code(driver_profile)`: generates UUID4, ensures uniqueness (up to 5 attempts), creates signed token, renders QR image via `qrcode` + `Pillow`, stores via Django file storage, returns `(qr_uuid, image_path)`
    - Implement `regenerate_qr_code(driver_profile, admin_user)`: generates new QR, invalidates old, creates QRCodeAuditLog entry
    - Raise `QRGenerationError` after 5 failed uniqueness attempts
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 5.4, 5.6, 5.7, 7.3_

  - [x]* 2.2 Write property test for QR payload signing round-trip
    - **Property 1: QR payload signing round-trip**
    - **Validates: Requirements 1.2, 2.1, 7.3**

  - [x]* 2.3 Write property test for QR generation unique identifiers
    - **Property 2: QR generation produces unique identifiers**
    - **Validates: Requirements 1.1, 1.3**

  - [x]* 2.4 Write property test for regeneration produces distinct QR code
    - **Property 9: Regeneration produces a new distinct QR code**
    - **Validates: Requirements 5.4**

- [x] 3. Signal handler and Celery task for automatic QR generation
  - [x] 3.1 Create Celery task and Django signal for QR generation on driver approval
    - Create `taxi/taxi/drivers/tasks.py` with `generate_qr_code_task` (shared_task, bind=True, max_retries=3)
    - Create `taxi/taxi/drivers/signals.py` with `post_save` signal on DriverProfile
    - Signal validates: driver_code is present (reject if missing), QR code doesn't already exist (skip if yes), status changed to "approved"
    - Register signal in `taxi/taxi/drivers/apps.py` ready() method
    - Handle QRGenerationError: log failure, revert status change, raise error message
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.2_

  - [x]* 3.2 Write property test for existing QR preserved on re-approval
    - **Property 3: Existing QR preserved on re-approval**
    - **Validates: Requirements 1.4**

  - [x]* 3.3 Write property test for only approved drivers receive QR codes
    - **Property 4: Only approved drivers receive QR codes**
    - **Validates: Requirements 2.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Verification API endpoint
  - [x] 5.1 Implement the driver verification endpoint and serializers
    - Create `taxi/taxi/drivers/serializers_verification.py` with `VerifyDriverRequestSerializer`, `VerifyDriverResponseSerializer`, `VerificationRecordSerializer`, `QRCodeRegenerationLogSerializer`
    - Create `taxi/taxi/drivers/views_verification.py` with `POST /api/v1/verify-driver/` endpoint
    - Endpoint logic: validate token signature → lookup DriverProfile by qr_code_uuid → check approval status → return appropriate response → create VerificationRecord
    - For approved driver: return full info (name, driver_code, photo, vehicle make/model/color/plate, status "verified")
    - For revoked/suspended driver: return limited info (name, driver_code, status "inactive_driver"), withhold vehicle details
    - For invalid/malformed token: return status "invalid_code"
    - For failed signature: return status "forged_code"
    - Require rider authentication on the endpoint
    - Register URL in `taxi/taxi/drivers/urls.py`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 4.3, 4.4, 4.5, 4.7, 7.4, 7.5_

  - [x]* 5.2 Write property test for scan of approved driver returns complete information
    - **Property 5: Scan of approved driver returns complete information**
    - **Validates: Requirements 2.3, 4.3**

  - [x]* 5.3 Write property test for scan of inactive driver returns limited information
    - **Property 6: Scan of inactive driver returns limited information**
    - **Validates: Requirements 2.4, 4.5**

  - [x]* 5.4 Write property test for invalid or tampered tokens
    - **Property 7: Invalid or tampered tokens produce error and audit record**
    - **Validates: Requirements 2.5, 7.4, 7.5**

  - [x]* 5.5 Write property test for verification record creation for all scan types
    - **Property 8: Verification record creation for all scan types**
    - **Validates: Requirements 4.7, 6.1**

- [x] 6. Driver-facing QR code API endpoint
  - [x] 6.1 Implement driver QR code retrieval endpoint with read-only enforcement
    - Add `GET /api/v1/drivers/me/qr-code/` endpoint in `taxi/taxi/drivers/views_verification.py`
    - Return QR code image URL, qr_code_uuid, driver_code, and generated_at timestamp
    - If QR code not assigned, return 404 with message "QR code is not yet available"
    - Ensure `qr_code_uuid`, `qr_code_image`, and `qr_code_generated_at` fields are excluded from all driver-facing writable serializers (update the existing `DriverProfileSerializer` to explicitly exclude/ignore these fields)
    - Register URL in `taxi/taxi/drivers/urls.py`
    - _Requirements: 3.1, 3.4, 3.5, 7.1, 7.2, 7.7_

  - [x]* 6.2 Write property test for QR field is read-only on driver-facing endpoints
    - **Property 11: QR field is read-only on driver-facing endpoints**
    - **Validates: Requirements 7.2, 7.7**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Admin API endpoints
  - [x] 8.1 Implement admin QR code regeneration and verification history endpoints
    - Add `POST /api/v1/admin/drivers/{id}/regenerate-qr/` endpoint with admin permission check
    - Add `GET /api/v1/admin/drivers/{id}/verification-history/` endpoint with pagination (50 per page, descending by timestamp)
    - Add `GET /api/v1/admin/riders/{id}/verification-history/` endpoint with pagination (50 per page, descending by timestamp)
    - Regeneration endpoint: call `QRCodeService.regenerate_qr_code()`, handle failure (5 attempts), return success/error
    - Verification history endpoints: return paginated VerificationRecord list with rider_name, driver_name, scan_timestamp, scan_result
    - Handle empty history case with appropriate message
    - Register URLs in `taxi/taxi/drivers/urls.py`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 8.2 Write property test for old QR code invalidated after regeneration
    - **Property 10: Old QR code invalidated after regeneration**
    - **Validates: Requirements 5.6**

  - [x]* 8.3 Write unit tests for admin endpoints
    - Test regeneration failure after 5 attempts (Req 5.5)
    - Test audit log creation on regeneration (Req 5.7)
    - Test pagination of verification history (Req 6.2, 6.3, 6.4)
    - Test empty verification history response (Req 6.5)
    - Test non-admin cannot access admin endpoints
    - _Requirements: 5.5, 5.7, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Admin Dashboard integration
  - [x] 9.1 Extend DriverProfileAdmin with QR code display and regeneration action
    - Update `taxi/taxi/drivers/admin.py` to display QR code image and generation timestamp as read-only fields
    - Add "Regenerate QR Code" admin action with confirmation dialog
    - Add inline display of VerificationRecord history on driver admin page
    - Display message when no QR code is assigned; hide regeneration action in that case
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 10. Integration wiring and dependency setup
  - [x] 10.1 Add dependencies and wire all components together
    - Add `qrcode[pil]>=7.0` and `hypothesis>=6.0` to `requirements.txt`
    - Ensure Celery task is discoverable (verify `taxi/taxi/celery.py` autodiscover config includes drivers app)
    - Add new URL patterns to the project-level `taxi/taxi/urls.py` if needed
    - Verify signal registration works end-to-end: create driver → assign driver_code → approve → QR code generated
    - _Requirements: 1.1, 1.6_

  - [x]* 10.2 Write integration tests for end-to-end flows
    - Test full approval flow: create driver → assign driver_code → approve → verify QR stored
    - Test full scan flow: scan valid QR → API returns driver info → VerificationRecord created
    - Test regeneration flow: regenerate → old code invalid → new code valid
    - Test approval rejection when driver_code is missing (Req 1.7)
    - Test QR generation failure after 5 attempts with mocked UUID collision (Req 1.5)
    - _Requirements: 1.1, 1.5, 1.7, 2.3, 4.7, 5.4, 5.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `hypothesis`
- Unit tests validate specific examples and edge cases
- The `qrcode[pil]` library is the only new dependency; `Pillow` and `celery` are already available
- All QR code generation happens server-side only (Requirement 1.6)
- Flutter mobile app changes (Driver App QR display, Rider App scanner) are frontend tasks not covered here — this plan covers the Django backend implementation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["2.4", "3.2", "3.3"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "6.2"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2"] }
  ]
}
```
