# Implementation Plan: Rider Unique Code

## Overview

Add a unique 6-digit rider_code to the User model, auto-generated at registration with global uniqueness across both riders and drivers. Expose the code in profile and admin APIs, display it in the rider app and admin dashboard, and enforce immutability after assignment.

## Tasks

- [ ] 1. Add rider_code field to User model and create migration
  - [ ] 1.1 Add rider_code CharField to User model with immutability guard
    - Add `rider_code = models.CharField(max_length=6, unique=True, null=True, blank=True, db_index=True)` to the User model in `backend/taxi/authapp/models.py`
    - Override `User.save()` to preserve existing rider_code on subsequent saves (immutability guard)
    - _Requirements: 1.1, 1.2, 1.3, 6.3_

  - [ ] 1.2 Generate and apply database migration
    - Run `makemigrations` to create the migration adding rider_code field
    - Verify the migration applies cleanly with `migrate`
    - _Requirements: 1.1, 1.2_

- [ ] 2. Implement code generation utility
  - [ ] 2.1 Create `backend/taxi/authapp/code_generator.py` with `generate_unique_rider_code()`
    - Implement random generation of 6-digit codes in range 100000–999999
    - Query both `User.rider_code` and `DriverProfile.driver_code` for collision check
    - Retry on collision up to max_retries (default 100)
    - Raise `RuntimeError` if code space exhausted
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1_

  - [ ]* 2.2 Write property test: generated codes are within valid range
    - **Property 1: Generated codes are within valid range**
    - **Validates: Requirements 2.2**

  - [ ]* 2.3 Write property test: generated codes are globally unique
    - **Property 2: Generated codes are globally unique**
    - **Validates: Requirements 1.2, 2.3, 2.4, 2.5, 3.1**

- [ ] 3. Integrate code generation into registration flow
  - [ ] 3.1 Update RegisterSerializer.create() to generate rider_code for rider registrations
    - Import `generate_unique_rider_code` in `backend/taxi/authapp/serializers.py`
    - Call generator when `user_type == "rider"` and assign to user before save
    - Leave rider_code as None for non-rider registrations
    - _Requirements: 2.1, 6.1_

  - [ ]* 3.2 Write unit tests for registration with rider_code assignment
    - Test that rider registration assigns a valid 6-digit code
    - Test that driver registration does not assign a rider_code
    - Test that registration fails gracefully when code space is exhausted
    - _Requirements: 2.1, 2.2_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Enforce global uniqueness and immutability
  - [ ] 5.1 Add driver_code cross-check validation on DriverProfile save
    - In the DriverProfile model or its save logic, validate that a new driver_code does not collide with an existing rider_code
    - _Requirements: 3.2_

  - [ ]* 5.2 Write property test: rider code immutability
    - **Property 4: Rider code immutability**
    - **Validates: Requirements 6.1, 6.3**

  - [ ]* 5.3 Write property test: driver code rejects existing rider codes
    - **Property 3: Driver code assignment rejects existing rider codes**
    - **Validates: Requirements 3.2**

- [ ] 6. Expose rider_code in API serializers
  - [ ] 6.1 Add rider_code to the profile API serializer
    - Update the user profile serializer (used by the rider profile endpoint) to include `rider_code` as a read-only field
    - _Requirements: 4.1_

  - [ ] 6.2 Add rider_code to the admin user serializer
    - Update the admin user list/detail serializer to include `rider_code` as a read-only field
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.3 Write unit tests for API serializer responses
    - Test profile endpoint includes rider_code for riders
    - Test admin endpoint includes rider_code in user list
    - _Requirements: 4.1, 5.2_

- [ ] 7. Display rider_code in frontend applications
  - [ ] 7.1 Display rider_code on rider app profile screen
    - Update the rider profile component in `frontend/src/profile/ProfilePages.js` to render rider_code in a visible badge/card format
    - _Requirements: 4.2, 4.3_

  - [ ] 7.2 Display rider_code in admin dashboard user view
    - Update `frontend/src/admin/AdminDashboard.js` to show rider_code column for rider users in the user list/detail view
    - _Requirements: 5.1_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Python/Django (backend) and React/JavaScript (frontend)
- Hypothesis is already available in the test environment for property-based testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "6.1", "6.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "5.1"] },
    { "id": 4, "tasks": ["3.2", "5.2", "5.3", "6.3"] },
    { "id": 5, "tasks": ["7.1", "7.2"] }
  ]
}
```
