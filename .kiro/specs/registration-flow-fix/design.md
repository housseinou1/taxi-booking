# Registration Flow Fix — Bugfix Design

## Overview

Both the Yala Driver App and Yala Rider App present a Rider/Driver toggle during registration, allowing users to register as the wrong account type. The registration backend (`RegisterSerializer`) accepts any `user_type` value without verifying which app sent the request. The fix removes the user type choice from the UI, auto-determines the type from the app's build-time `REACT_APP_TYPE` environment variable, and adds backend enforcement via a custom `X-App-Type` header that the backend validates against the submitted `user_type`.

## Glossary

- **Bug_Condition (C)**: A registration request where the submitted `user_type` does not match the app source — i.e., the Driver App submitting `user_type = "rider"` or the Rider App submitting `user_type = "driver"`
- **Property (P)**: The registration endpoint SHALL automatically enforce the correct `user_type` based on the requesting app, and the UI SHALL not present a Rider/Driver choice
- **Preservation**: Existing registration behavior for matching requests (Driver App registering as driver, Rider App registering as rider) must remain unchanged, including DriverProfile creation, rider_status assignment, duplicate checks, and file validation
- **RegisterSerializer**: The DRF serializer in `backend/taxi/authapp/serializers.py` that validates and creates user accounts
- **RegisterView**: The DRF view in `backend/taxi/authapp/views.py` that handles POST to `/auth/register/`
- **Register component**: The React component in `frontend/src/auth/Register.js` that renders the registration form
- **getAppType()**: The function in `frontend/src/native/platform.js` that returns `REACT_APP_TYPE` (`"rider"`, `"driver"`, or `"web"`)
- **X-App-Type header**: A custom HTTP header sent by the frontend to identify which app is making the request

## Bug Details

### Bug Condition

The bug manifests when a user opens either the Yala Driver App or the Yala Rider App and encounters a Rider/Driver toggle (`auth-register-tabs`) on the registration form. The user can select the wrong type, and the backend blindly accepts it because `RegisterSerializer` treats `user_type` as a simple `ChoiceField` without correlating it to the app source.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RegistrationRequest { app_source: string, user_type: string }
  OUTPUT: boolean
  
  RETURN (input.app_source == "driver" AND input.user_type == "rider")
         OR (input.app_source == "rider" AND input.user_type == "driver")
         OR (input.app_source IN ["driver", "rider"] AND ui_shows_type_toggle == true)
END FUNCTION
```

### Examples

- **Driver App → selects "Rider"**: User opens Yala Driver App, registration form shows Rider/Driver tabs, user clicks "Rider", submits form. Backend creates a Rider account without a DriverProfile. Expected: Driver App should only create Driver accounts.
- **Rider App → selects "Driver"**: User opens Yala Rider App, registration form shows Rider/Driver tabs, user clicks "Driver", submits form. Backend creates a Driver account with a DriverProfile. Expected: Rider App should only create Rider accounts.
- **Driver App → submits via API manipulation**: A modified client sends `user_type=rider` with no app-type header. Backend currently accepts it. Expected: Backend should reject or override the mismatch.
- **Edge case — Web browser (no app type)**: A user registers from the web version where `REACT_APP_TYPE` is not set. Expected: The system should either require explicit app identification or default to a safe behavior (reject if no app type is provided, or allow the toggle only for web).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Driver App registration with `user_type = "driver"` must continue to create a User with `user_type = "driver"` and a pending DriverProfile with temporary vehicle placeholders
- Rider App registration with `user_type = "rider"` must continue to create a User with `user_type = "rider"`, `rider_status = "pending"`, and require profile_picture and national_id_document
- Duplicate email detection must continue to return a validation error
- Duplicate phone number detection must continue to return a validation error
- Duplicate national ID number detection must continue to return a validation error
- Password validation via `validate_password` must continue to enforce Django password rules
- Phone number normalization (`normalize_mauritania_phone`) must continue to work
- National ID normalization (`normalize_national_id`) must continue to work
- Rate limiting on registration (5 attempts per hour) must continue to function
- Post-registration flow (auto-login, phone verification, redirect to vehicle-setup or payment-setup) must remain unchanged

**Scope:**
All inputs that do NOT involve a mismatch between app source and `user_type` should be completely unaffected by this fix. This includes:
- Valid Driver App registrations with `user_type = "driver"`
- Valid Rider App registrations with `user_type = "rider"`
- Login requests
- Profile update requests
- All other API endpoints

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Frontend: User type toggle is always rendered**: In `Register.js`, the `auth-register-tabs` section renders Rider/Driver buttons unconditionally (when not in verification step). There is no check against `getAppType()` to hide the toggle when the app type is already known.

2. **Frontend: `user_type` is not forced by app identity**: The `getInitialUserType()` function reads from a `?role=` URL param, but it doesn't consult `REACT_APP_TYPE`. Even if the initial value were correct, the user can still click the other tab to override it.

3. **Backend: No app source validation**: `RegisterSerializer` accepts `user_type` as a plain `ChoiceField` with no cross-reference to any app identifier. There is no `X-App-Type` header check, no API key differentiation, and no other mechanism to verify which app is calling.

4. **Backend: No enforcement logic in `RegisterView.create()`**: The view delegates entirely to the serializer without inspecting request headers or metadata to enforce app-type consistency.

## Correctness Properties

Property 1: Bug Condition - App-Type Mismatch Rejected or Overridden

_For any_ registration request where the app source is identified (via `X-App-Type` header) and the submitted `user_type` does not match the app source, the fixed registration endpoint SHALL either reject the request with a 400 error or override the `user_type` to match the app source, ensuring no mismatched account is ever created.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Matching Registrations Unchanged

_For any_ registration request where the submitted `user_type` matches the app source (Driver App with `user_type = "driver"`, or Rider App with `user_type = "rider"`), the fixed registration endpoint SHALL produce exactly the same result as the original endpoint, preserving User creation, DriverProfile creation, rider_status assignment, and all validation behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/auth/Register.js`

**Function**: `Register` component

**Specific Changes**:
1. **Remove the user type toggle**: When `getAppType()` returns `"driver"` or `"rider"`, hide the `auth-register-tabs` section entirely. The `user_type` in form state should be locked to `getAppType()`.
2. **Force `user_type` from app identity**: Replace `getInitialUserType()` to prioritize `getAppType()` over URL params. If `getAppType()` is `"driver"` or `"rider"`, that value is final and non-overridable.
3. **Send `X-App-Type` header**: Include `X-App-Type: <getAppType()>` in the registration POST request so the backend can validate.
4. **Conditional form fields**: When `getAppType() === "driver"`, hide rider-specific fields (profile_picture, national_id_document upload prompts). When `getAppType() === "rider"`, show only rider-specific fields. This already partially exists based on `formData.user_type`, so locking user_type achieves this.

**File**: `frontend/src/api.js` (or inline in Register.js)

**Specific Changes**:
5. **Add `X-App-Type` header to registration request**: Modify the axios POST call to include the header.

**File**: `backend/taxi/authapp/serializers.py`

**Class**: `RegisterSerializer`

**Specific Changes**:
6. **Accept `app_type` from context**: Add logic in `validate()` or a custom field to read the app type from the serializer context (passed from the view).
7. **Override or reject mismatched `user_type`**: If the request includes an `X-App-Type` header that is `"driver"` or `"rider"`, the `user_type` field MUST match it. If it doesn't, either override it silently or raise a `ValidationError`.

**File**: `backend/taxi/authapp/views.py`

**Class**: `RegisterView`

**Specific Changes**:
8. **Extract `X-App-Type` header**: In `create()`, read `request.META.get("HTTP_X_APP_TYPE")` and pass it to the serializer context.
9. **Enforce app-type logic**: If the header is present and is `"driver"` or `"rider"`, pass it as `app_type` in serializer context. The serializer then enforces the match.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that submit registration requests with mismatched `user_type` and `X-App-Type` header (or no header). Run these tests on the UNFIXED code to observe that the backend accepts them without error.

**Test Cases**:
1. **Driver App sends rider type**: POST to `/auth/register/` with `user_type=rider` and `X-App-Type: driver` — expect current code to create a rider account (will demonstrate bug on unfixed code)
2. **Rider App sends driver type**: POST to `/auth/register/` with `user_type=driver` and `X-App-Type: rider` — expect current code to create a driver account (will demonstrate bug on unfixed code)
3. **No header, any type**: POST to `/auth/register/` with `user_type=driver` and no `X-App-Type` header — expect current code to accept it (will demonstrate lack of enforcement on unfixed code)
4. **UI toggle visibility**: Render `Register` component with `REACT_APP_TYPE=driver` — expect current code to still show Rider/Driver tabs (will demonstrate UI bug on unfixed code)

**Expected Counterexamples**:
- Backend creates accounts with mismatched user_type because there is no header validation
- Frontend renders the toggle regardless of `REACT_APP_TYPE` value

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := register_fixed(input)
  ASSERT result.status_code == 400
         OR result.user.user_type == input.app_source
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT register_original(input) == register_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (valid emails, phone numbers, names, cities)
- It catches edge cases that manual unit tests might miss (unusual characters, boundary lengths)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for matching registrations (Driver App + driver type, Rider App + rider type), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Driver registration preservation**: Verify Driver App registration with `user_type=driver` continues to create User + DriverProfile with status "pending" and temp placeholders
2. **Rider registration preservation**: Verify Rider App registration with `user_type=rider` continues to create User with rider_status "pending" and required documents
3. **Duplicate email preservation**: Verify duplicate email still returns validation error
4. **Duplicate phone preservation**: Verify duplicate phone number still returns validation error
5. **Rate limiting preservation**: Verify rate limiting still triggers after 5 attempts

### Unit Tests

- Test that `RegisterSerializer.validate()` rejects mismatched app_type/user_type combinations
- Test that `RegisterSerializer.validate()` accepts matching app_type/user_type combinations
- Test that `RegisterSerializer.validate()` handles missing app_type gracefully (rejects registration when no app identity is provided, or defaults to a specific behavior)
- Test that `RegisterView.create()` extracts `X-App-Type` header correctly
- Test that the Register React component hides tabs when `REACT_APP_TYPE` is `"driver"` or `"rider"`
- Test that the Register React component sends `X-App-Type` header in registration request

### Property-Based Tests

- Generate random valid registration payloads with matching app_type and verify accounts are created correctly (preservation)
- Generate random registration payloads with mismatched app_type/user_type and verify all are rejected or overridden (fix checking)
- Generate random non-registration inputs (login, profile update) and verify they are unaffected by the fix

### Integration Tests

- Test full registration flow from Driver App: form renders without toggle, submits with `user_type=driver`, creates Driver account
- Test full registration flow from Rider App: form renders without toggle, submits with `user_type=rider`, creates Rider account
- Test that post-registration redirect to vehicle-setup (driver) or payment-setup (rider) continues to work
- Test that phone verification step still triggers correctly after registration
