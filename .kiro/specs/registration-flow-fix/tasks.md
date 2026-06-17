# Implementation Plan

## Overview

Fix the registration flow bug where both the Yala Driver App and Rider App present a Rider/Driver toggle, allowing users to register as the wrong account type. The fix removes the toggle from the UI, forces `user_type` from the app's `REACT_APP_TYPE`, sends an `X-App-Type` header, and adds backend validation to reject mismatched requests.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - App-Type Mismatch Accepted by Backend
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the backend accepts mismatched app-type/user-type combinations
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: Driver App submitting user_type="rider" and Rider App submitting user_type="driver"
  - Write a property-based test using Hypothesis that generates registration requests where `isBugCondition(input)` is true:
    - `X-App-Type: driver` with `user_type = "rider"`
    - `X-App-Type: rider` with `user_type = "driver"`
  - The test asserts: for all such mismatched inputs, the registration endpoint returns HTTP 400 OR the created user's `user_type` matches the `X-App-Type` header (not the submitted value)
  - Use `backend/taxi/authapp/tests/` directory for test file (e.g., `test_registration_bug_condition.py`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because the backend currently accepts mismatches)
  - Document counterexamples found (e.g., "POST with X-App-Type: driver and user_type=rider returns 201 and creates a rider account")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Matching Registrations Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 - Observe**: Run UNFIXED code with non-buggy inputs (matching app-type/user-type) and record results:
    - Observe: POST `/auth/register/` with `X-App-Type: driver` and `user_type=driver` creates User + DriverProfile with status "pending"
    - Observe: POST `/auth/register/` with `X-App-Type: rider` and `user_type=rider` creates User with `rider_status = "pending"`
    - Observe: Duplicate email returns 400 validation error
    - Observe: Duplicate phone returns 400 validation error
  - **Step 2 - Write property tests**: Using Hypothesis, generate random valid registration payloads where `NOT isBugCondition(input)`:
    - For all valid driver registrations (matching X-App-Type: driver + user_type=driver), assert User is created with user_type="driver" and DriverProfile exists with status="pending"
    - For all valid rider registrations (matching X-App-Type: rider + user_type=rider), assert User is created with user_type="rider" and rider_status="pending"
    - For all duplicate email submissions, assert 400 error with appropriate message
    - For all duplicate phone submissions, assert 400 error with appropriate message
  - **Step 3 - Verify**: Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Use `backend/taxi/authapp/tests/test_registration_preservation.py`
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for registration app-type mismatch bug

  - [x] 3.1 Remove user type toggle from frontend when app type is known
    - In `frontend/src/auth/Register.js`, check `getAppType()` from `frontend/src/native/platform.js`
    - When `getAppType()` returns `"driver"` or `"rider"`, hide the `auth-register-tabs` section entirely
    - Lock `user_type` in form state to the value of `getAppType()` — user cannot override
    - Replace `getInitialUserType()` to prioritize `getAppType()` over URL params
    - Show only relevant registration fields based on the locked user_type
    - _Bug_Condition: isBugCondition(input) where input.app_source IN ["driver","rider"] AND ui_shows_type_toggle == true_
    - _Expected_Behavior: UI SHALL NOT present Rider/Driver choice when app type is known_
    - _Preservation: Conditional form fields (driver vs rider specific fields) must continue to render correctly_
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x] 3.2 Send X-App-Type header from frontend
    - In `frontend/src/auth/Register.js` or `frontend/src/api.js`, add `X-App-Type` header to the registration POST request
    - Header value is the result of `getAppType()` (from `frontend/src/native/platform.js`)
    - Ensure the header is sent on every registration request
    - _Bug_Condition: isBugCondition(input) where no app identification is sent to backend_
    - _Expected_Behavior: Frontend SHALL send X-App-Type header identifying the app source_
    - _Preservation: Other API requests (login, profile update) should not be affected_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Add backend validation of X-App-Type header against user_type
    - In `backend/taxi/authapp/views.py` (`RegisterView.create()`), extract `X-App-Type` from `request.META.get("HTTP_X_APP_TYPE")`
    - Pass `app_type` to serializer context
    - In `backend/taxi/authapp/serializers.py` (`RegisterSerializer.validate()`), compare `app_type` from context with submitted `user_type`
    - If `app_type` is `"driver"` or `"rider"` and `user_type` does not match, raise `ValidationError` (HTTP 400)
    - If `X-App-Type` header is missing, reject the registration request (require app identification)
    - _Bug_Condition: isBugCondition(input) where input.app_source != input.user_type_
    - _Expected_Behavior: Backend SHALL reject or override mismatched user_type; expectedBehavior(result) = (status_code == 400) OR (result.user.user_type == input.app_source)_
    - _Preservation: Matching registrations (driver app + driver type, rider app + rider type) must continue to succeed with same behavior_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.5, 3.6_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - App-Type Mismatch Rejected or Overridden
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (mismatched requests are rejected/overridden)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - mismatched registrations are now rejected)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Matching Registrations Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - matching registrations still work correctly)
    - Confirm all preservation tests still pass after fix (no regressions to driver registration, rider registration, duplicate detection, etc.)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to verify no regressions across the project
  - Ensure bug condition test (Property 1) passes — mismatched registrations are rejected
  - Ensure preservation tests (Property 2) pass — matching registrations unchanged
  - Verify frontend tests pass (toggle hidden, X-App-Type header sent)
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3"] },
    { "id": 3, "tasks": ["3.4"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be executed in parallel
- Tasks 1 and 2 MUST be completed BEFORE any implementation in task 3
- The exploration test (task 1) is expected to FAIL on unfixed code — this confirms the bug exists
- The preservation tests (task 2) are expected to PASS on unfixed code — this captures baseline behavior
- After the fix (task 3.1–3.3), re-running the same tests validates both the fix and preservation
- Property-based tests use Python's Hypothesis library for the backend
- Frontend testing uses React Testing Library with Jest
