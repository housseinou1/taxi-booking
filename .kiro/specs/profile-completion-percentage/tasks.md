# Implementation Plan: Profile Completion Percentage

## Overview

Implement a profile completion percentage feature that computes the fraction of tracked profile fields filled for riders (10 fields) and drivers (20 fields). The computation is a stateless service module under `authapp/services/` integrated into the existing `/auth/me/` and `/drivers/me/` API responses.

## Tasks

- [ ] 1. Create the ProfileCompletionService module
  - [ ] 1.1 Create `authapp/services/profile_completion.py` with field definitions and computation logic
    - Create `backend/taxi/authapp/services/` directory with `__init__.py`
    - Define `RIDER_TRACKED_FIELDS` list (10 fields) and `DRIVER_EXTRA_TRACKED_FIELDS` list (10 fields)
    - Define `DRIVER_TRACKED_FIELDS` as the concatenation of both lists
    - Implement `is_field_filled(value)` function with logic for text, file, datetime, and FK fields
    - Implement `compute_completion(filled_count, total_count)` returning `math.floor(filled / total * 100)`
    - Implement `get_field_value(obj, field_name)` using `getattr`
    - Implement `get_rider_completion(user)` returning `{"percentage": int, "missing_fields": list[str]}`
    - Implement `get_driver_completion(user, driver_profile=None)` returning `{"percentage": int, "missing_fields": list[str]}`
    - Handle `driver_profile=None` case by treating all driver-specific fields as missing
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.4_

  - [ ]* 1.2 Write property test: Percentage formula correctness (Property 1)
    - **Property 1: Percentage formula correctness**
    - Use Hypothesis to generate random combinations of filled/empty field values
    - Verify `percentage == math.floor(filled_count / total_fields_count * 100)` for all inputs
    - Create test file at `backend/taxi/authapp/tests/test_profile_completion_properties.py`
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.5, 5.1**

  - [ ]* 1.3 Write property test: Missing fields accuracy (Property 2)
    - **Property 2: Missing fields accuracy**
    - Use Hypothesis to generate random user/driver field combinations
    - Verify `missing_fields` contains exactly the field names where `is_field_filled` returns False
    - **Validates: Requirements 1.3, 2.3, 5.2**

  - [ ]* 1.4 Write property test: Field evaluation correctness (Property 3)
    - **Property 3: Field evaluation correctness**
    - Use Hypothesis to generate random strings (including None, empty, whitespace-only)
    - Verify `is_field_filled` returns True iff value is not None, not empty, and not whitespace-only for strings
    - Verify file-like objects are filled iff they have a non-empty `.name` attribute
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]* 1.5 Write property test: Percentage and missing_fields consistency (Property 4)
    - **Property 4: Percentage and missing_fields consistency**
    - Use Hypothesis to generate random field states
    - Verify: if percentage == 100 then missing_fields is empty; if missing_fields is non-empty then percentage < 100
    - **Validates: Requirements 4.3**

  - [ ]* 1.6 Write property test: Driver without profile treats driver fields as missing (Property 5)
    - **Property 5: Driver without profile treats driver fields as missing**
    - Use Hypothesis to generate random user field states with `driver_profile=None`
    - Verify all 10 `DRIVER_EXTRA_TRACKED_FIELDS` appear in `missing_fields`
    - Verify percentage reflects those 10 fields as unfilled
    - **Validates: Requirements 4.4, 5.1, 5.2**

- [ ] 2. Checkpoint - Verify service module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Integrate into `/auth/me/` endpoint
  - [ ] 3.1 Modify `authapp/views.py` to include `profile_completion` in the `/auth/me/` response
    - Import `get_rider_completion` and `get_driver_completion` from `authapp.services.profile_completion`
    - Import `DriverProfile` from `taxi.drivers.models`
    - In the `me` view function, query for the user's `DriverProfile`
    - If driver profile exists, call `get_driver_completion(user, driver_profile)`; otherwise call `get_rider_completion(user)`
    - Add `"profile_completion": profile_completion` to the response dict
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 5.1, 5.2_

  - [ ]* 3.2 Write unit tests for `/auth/me/` profile_completion response
    - Test rider user receives `profile_completion` with correct percentage and missing_fields
    - Test driver user receives driver-level completion via `/auth/me/`
    - Test response structure matches `{"percentage": int, "missing_fields": list}`
    - Create test at `backend/taxi/authapp/tests/test_profile_completion_views.py`
    - _Requirements: 4.1, 5.1, 5.2_

- [ ] 4. Integrate into `/drivers/me/` endpoint
  - [ ] 4.1 Modify `taxi/drivers/views.py` to include `profile_completion` in the `/drivers/me/` response
    - Import `get_driver_completion` from `authapp.services.profile_completion`
    - In the `driver_me` view function, call `get_driver_completion(request.user, profile)`
    - Add `"profile_completion"` key to the driver response data
    - _Requirements: 2.1, 2.2, 2.3, 4.2_

  - [ ]* 4.2 Write unit tests for `/drivers/me/` profile_completion response
    - Test driver receives `profile_completion` with correct percentage and missing_fields
    - Test that all 20 fields are evaluated for driver
    - Test driver without DriverProfile gets all driver-specific fields as missing
    - Add tests to `backend/taxi/taxi/drivers/tests/test_profile_completion_driver.py`
    - _Requirements: 4.2, 4.4_

- [ ] 5. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using Hypothesis (already in project virtualenv)
- Unit tests validate specific examples and edge cases
- No database migrations are needed — the feature reads existing model fields only
- The service is a pure computation layer with no side effects

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "4.2"] }
  ]
}
```
