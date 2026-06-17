# Implementation Plan: Vehicle Inspection Alerts

## Overview

This plan adds vehicle inspection (contrôle technique) expiration tracking and progressive alerts to the existing driver document management system. The implementation extends the existing `DriverProfile`, `DriverDocument`, and `DocumentService` with the new "inspection" document type, adds a dedicated `InspectionAlertService` with a Celery periodic task for milestone notifications, and extends the availability gate to block drivers with expired inspections. The approach is incremental: model changes first, then service extensions, then the alert system, with testing integrated throughout.

## Tasks

- [ ] 1. Model layer and migration
  - [ ] 1.1 Add inspection document type and profile field
    - Add `("inspection", "Contrôle Technique")` to `DriverDocument.DOCUMENT_TYPES` choices in `taxi/drivers/models.py`
    - Add `inspection_expires_at = models.DateField(blank=True, null=True, help_text="Expiration date of the vehicle inspection (contrôle technique).")` to the `DriverProfile` model
    - Generate and apply the migration
    - _Requirements: 1.3, 2.1_

- [ ] 2. DocumentService configuration updates
  - [ ] 2.1 Register inspection in service-level constants
    - Add `"inspection"` to `REQUIRED_DOCUMENT_TYPES` list in `taxi/drivers/services/document_service.py`
    - Add `"inspection"` to `EXPIRING_DOCUMENT_TYPES` set in `taxi/drivers/services/document_service.py`
    - Verify that existing `upload_document` method now requires `expires_at` for inspection uploads and rejects past dates
    - _Requirements: 1.1, 1.2, 2.2, 2.3_

  - [ ]* 2.2 Write property test for expiration date validation (Property 1)
    - **Property 1: Expiration Date Validity Determines Upload Acceptance**
    - Use `hypothesis` to generate arbitrary date values and verify upload succeeds if and only if the date is strictly after today
    - **Validates: Requirements 2.2, 2.3**

- [ ] 3. Availability gate extension
  - [ ] 3.1 Extend expired document detection to include inspection
    - In `taxi/drivers/views.py`, add inspection check to `expired_document_labels` function: `if document_status(profile.inspection_expires_at) == "expired": expired.append("Contrôle Technique")`
    - Verify that `enforce_document_expiration` sets `is_available=False` and `status="rejected"` when inspection is expired
    - Verify that toggle-availability endpoint blocks drivers with expired inspection
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 3.2 Write property test for expired inspection blocks availability (Property 3)
    - **Property 3: Expired Inspection Blocks Availability**
    - Use `hypothesis` to generate driver profiles with `inspection_expires_at` in the past and verify `is_available` is `False` and `status` is `"rejected"` after gate enforcement
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 3.3 Write property test for expired inspection prevents toggle (Property 4)
    - **Property 4: Expired Inspection Prevents Toggle**
    - Use `hypothesis` to generate drivers with expired inspections attempting to toggle online and verify the request is rejected
    - **Validates: Requirements 4.3**

- [ ] 4. Profile sync on document approval
  - [ ] 4.1 Update approve_document to sync inspection_expires_at
    - In `DocumentService.approve_document`, after saving the document, add logic: if `document.document_type == "inspection"` and `document.expires_at`, update `driver.inspection_expires_at = document.expires_at` and save
    - This ensures the profile-level field stays in sync with the latest approved inspection document
    - _Requirements: 4.4_

  - [ ]* 4.2 Write property test for renewed inspection allows reactivation (Property 5)
    - **Property 5: Renewed Inspection Allows Reactivation**
    - Use `hypothesis` to generate drivers with previously expired inspections, then approve a new document with a future date, and verify the availability gate no longer blocks them
    - **Validates: Requirements 4.4**

- [ ] 5. Checkpoint - Core inspection type and availability gate complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Inspection alert service and notifications
  - [ ] 6.1 Create InspectionAlertService
    - Create `taxi/drivers/services/inspection_alert_service.py`
    - Implement `InspectionAlert` dataclass with fields: `driver_profile_id`, `document_id`, `document_type`, `expires_at`, `days_remaining`
    - Implement `InspectionAlertService` class with methods: `get_drivers_at_milestone(today, milestone_days)`, `build_notification_payload(alert)`, `send_alert(alert)`
    - Define `ALERT_MILESTONES = [30, 15, 7, 1]`
    - Query `DriverDocument` with `document_type="inspection"`, `status="approved"`, `expires_at=target_date`
    - Build payload with fields: `type`, `document_id`, `document_type`, `expires_at`, `days_remaining`
    - Send push notification via `send_push_notification` with title "Inspection Expiring" and formatted body
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 6.2 Write property test for notification payload completeness (Property 2)
    - **Property 2: Notification Payload Completeness**
    - Use `hypothesis` to generate `InspectionAlert` instances at any milestone and verify the payload contains exactly the required fields with correct types and values
    - **Validates: Requirements 3.5**

  - [ ] 6.3 Create Celery periodic task for daily alert dispatch
    - In `taxi/drivers/tasks.py`, create `send_inspection_expiry_alerts` shared task
    - Iterate over `ALERT_MILESTONES`, call `get_drivers_at_milestone` for each, and dispatch alerts
    - Return results dict with `total_sent` and `milestones_checked`
    - Register in `CELERY_BEAT_SCHEDULE` in settings with 86400-second schedule
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 7. Expired/missing and expiring document alerts
  - [ ] 7.1 Verify inspection in expired or missing document alerts
    - Confirm that `get_expired_or_missing` in `DocumentService` correctly includes "inspection" with reason "missing" when no document exists or most recent is rejected, and reason "expired" with date when the most recent approved document has a past expiration
    - Add any necessary adjustments if the existing method doesn't fully handle the new type
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 7.2 Write property test for alert classification (Property 6)
    - **Property 6: Alert Classification for Inspection State**
    - Use `hypothesis` to generate driver profiles in various inspection states (no document, rejected, expired, valid) and verify correct alert classification
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ] 7.3 Verify inspection in expiring documents list
    - Confirm that `get_expiring_documents` in `DocumentService` correctly includes approved inspection documents expiring within 30 days with correct `days_remaining` calculation
    - Add any necessary adjustments if the existing method doesn't fully handle the new type
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.4 Write property test for expiring documents days remaining (Property 7)
    - **Property 7: Expiring Inspection Appears With Correct Days Remaining**
    - Use `hypothesis` to generate approved inspection documents with expiration dates between today and 30 days from today, and verify `days_remaining` equals `(expires_at - today).days`
    - **Validates: Requirements 6.1, 6.2**

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses Python (Django) with `hypothesis` for property tests
- The existing `DocumentService` methods (`upload_document`, `get_expiring_documents`, `get_expired_or_missing`) already iterate over the constants lists, so adding "inspection" to those lists is sufficient for most service-layer behavior
- The `enforce_document_expiration` function already handles blocking logic; we only extend the label detection

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.1", "7.3"] },
    { "id": 6, "tasks": ["7.2", "7.4"] }
  ]
}
```
