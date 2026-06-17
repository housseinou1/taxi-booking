# Implementation Plan: Family Trusted Contacts

## Overview

Extend the existing `safety` app's `EmergencyContact` model with trusted contact capabilities (verification fields + auto-share), add a verification service with SMS OTP flow, create REST API endpoints for managing trusted contacts, and hook into the ride workflow to trigger automatic trip sharing when a ride transitions to `in_progress`.

## Tasks

- [ ] 1. Model extension and migration
  - [ ] 1.1 Add trusted contact fields to EmergencyContact model
    - Add `is_verified = models.BooleanField(default=False)` to `EmergencyContact` in `safety/models.py`
    - Add `verification_code = models.CharField(max_length=10, blank=True, default="")` to `EmergencyContact`
    - Add `auto_share = models.BooleanField(default=False)` to `EmergencyContact`
    - Add `clean()` method override to enforce 5-trusted-contact limit per rider at model level
    - Generate and apply Django migration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property test for new contact defaults
    - **Property 1: New contact defaults**
    - **Validates: Requirements 1.1, 1.3**

  - [ ]* 1.3 Write property test for contact limit enforcement
    - **Property 2: Contact limit enforcement**
    - **Validates: Requirements 1.4, 1.5**

- [ ] 2. Trusted Contact Service
  - [ ] 2.1 Implement trusted contact service module
    - Create `safety/trusted_contact_service.py`
    - Implement `generate_verification_code()`: returns 6-digit zero-padded numeric string using `secrets.randbelow`
    - Implement `initiate_verification(contact)`: generates code, stores on contact, sends SMS via `send_sms`, returns bool success
    - Implement `verify_contact(contact, submitted_code)`: validates code match, sets `is_verified=True`, `auto_share=True`, clears `verification_code`, returns `(success, error_message)` tuple
    - Implement `remove_trusted_status(contact)`: resets `is_verified`, `auto_share`, `verification_code` to defaults
    - Implement `create_auto_trip_shares(ride)`: queries verified auto_share contacts, creates TripShare per contact, sends SMS with tracking link, logs failures without blocking
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.5, 4.1, 5.1, 5.2_

  - [ ]* 2.2 Write property test for verification code format
    - **Property 13: Verification code format**
    - **Validates: Requirements 5.1**

  - [ ]* 2.3 Write property test for verification initiation stores code and sends SMS
    - **Property 3: Verification initiation stores code and sends SMS**
    - **Validates: Requirements 2.1**

  - [ ]* 2.4 Write property test for successful verification state transition
    - **Property 4: Successful verification state transition**
    - **Validates: Requirements 2.2, 5.2**

  - [ ]* 2.5 Write property test for invalid code rejection
    - **Property 5: Invalid code rejection**
    - **Validates: Requirements 2.3**

  - [ ]* 2.6 Write property test for code rotation invalidates previous code
    - **Property 6: Code rotation invalidates previous code**
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Write property test for removal resets trusted status
    - **Property 10: Removal resets trusted status**
    - **Validates: Requirements 4.1**

  - [ ]* 2.8 Write property test for no-code verification rejection
    - **Property 14: No-code verification rejection**
    - **Validates: Requirements 5.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Serializer and API endpoints
  - [ ] 4.1 Create TrustedContactSerializer
    - Create or update `safety/serializers.py` with `TrustedContactSerializer` (ModelSerializer for EmergencyContact)
    - Include fields: `id`, `name`, `phone_number`, `relationship`, `is_verified`, `auto_share`, `created_at`, `updated_at`
    - Set read-only fields: `id`, `is_verified`, `created_at`, `updated_at`
    - _Requirements: 4.4_

  - [ ] 4.2 Implement trusted contacts list and add endpoint
    - Add `trusted_contacts` view in `safety/views.py` (GET and POST)
    - GET: return all contacts that are verified or have a pending verification code for the authenticated rider
    - POST: accept `contact_id`, validate ownership, enforce 5-contact limit, call `initiate_verification`, return serialized contact or appropriate error (400 for limit, 503 for SMS failure)
    - Require authentication via `@permission_classes([IsAuthenticated])`
    - _Requirements: 1.4, 2.1, 4.4_

  - [ ] 4.3 Implement verify, resend, toggle, and remove endpoints
    - Add `verify_trusted_contact` view (POST `/safety/trusted-contacts/{id}/verify/`): validate code, return 400 on failure
    - Add `resend_verification` view (POST `/safety/trusted-contacts/{id}/resend/`): regenerate and resend code
    - Add `toggle_auto_share` view (PATCH `/safety/trusted-contacts/{id}/`): toggle `auto_share` for verified contacts only
    - Add `remove_trusted_contact` view (DELETE `/safety/trusted-contacts/{id}/`): call `remove_trusted_status`
    - All endpoints require authentication and verify contact ownership via `get_object_or_404`
    - _Requirements: 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 5.3_

  - [ ] 4.4 Register URL patterns
    - Add URL patterns in `safety/urls.py` for all trusted contact endpoints
    - Ensure URLs follow the pattern: `/safety/trusted-contacts/`, `/safety/trusted-contacts/{id}/verify/`, `/safety/trusted-contacts/{id}/resend/`
    - _Requirements: 4.4_

  - [ ]* 4.5 Write property test for auto-share toggle preserves verification
    - **Property 11: Auto-share toggle preserves verification**
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 4.6 Write unit tests for API endpoints
    - Test list endpoint returns only trusted/pending contacts
    - Test add endpoint rejects when limit exceeded (Req 1.4)
    - Test verify endpoint rejects invalid code (Req 2.3)
    - Test resend endpoint generates new code (Req 2.4)
    - Test remove endpoint resets fields (Req 4.1)
    - Test unauthenticated access returns 401
    - Test accessing another user's contact returns 404
    - _Requirements: 1.4, 2.3, 2.4, 4.1, 4.4, 5.3_

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Ride workflow integration
  - [ ] 6.1 Hook auto trip sharing into ride transition
    - Modify `transition_ride` in `taxi/drivers/services/ride_workflow.py`
    - After successful transition to `in_progress`, call `create_auto_trip_shares(ride)`
    - Import from `safety.trusted_contact_service`
    - Ensure SMS failures do not affect ride transition
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 6.2 Write property test for auto trip share count matches eligible contacts
    - **Property 7: Auto trip share count matches eligible contacts**
    - **Validates: Requirements 3.1**

  - [ ]* 6.3 Write property test for TripShare tokens are unique with future expiry
    - **Property 8: TripShare tokens are unique with future expiry**
    - **Validates: Requirements 3.3**

  - [ ]* 6.4 Write property test for SMS failure does not block remaining shares or ride
    - **Property 9: SMS failure does not block remaining shares or ride**
    - **Validates: Requirements 3.5**

  - [ ]* 6.5 Write property test for unverified contacts excluded from auto-sharing
    - **Property 12: Unverified contacts excluded from auto-sharing**
    - **Validates: Requirements 4.5**

  - [ ]* 6.6 Write integration tests for ride workflow
    - Test ride transition to in_progress creates TripShare records for all eligible contacts
    - Test ride transition with no eligible contacts proceeds without error (Req 3.4)
    - Test SMS failure for one contact does not block others (Req 3.5)
    - Test unverified contacts are excluded (Req 4.5)
    - Mock SMS via `@override_settings(YALA_SMS_PROVIDER="console")`
    - _Requirements: 3.1, 3.4, 3.5, 4.5_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `hypothesis`
- Unit tests validate specific examples and edge cases
- All SMS sending is mocked in tests via `@override_settings(YALA_SMS_PROVIDER="console")`
- The `TripShare` model already exists in the safety app — no new models needed beyond the field additions
- The `send_sms` utility from `authapp/phone_views.py` is reused for all SMS delivery
- This plan covers the Django backend implementation only

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4"] },
    { "id": 5, "tasks": ["4.5", "4.6"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6"] }
  ]
}
```
