# Design Document

## Overview

This design improves the existing Yala Delivery courier registration onboarding flow to provide a streamlined, Uber-style step-by-step wizard experience. The system auto-redirects couriers to the Delivery Profile Setup page after account creation and conditionally displays fields/documents based on the selected courier type (Bicycle, Motorcycle, or Vehicle/Car).

The existing codebase already has most backend logic in place (`courier_onboarding.py`, `courier_vehicle_setup` view, `courier_profile_setup_submit` view) and frontend components (`DeliveryCourierProfileSetup.js`, `DeliveryCourierOnboarding.js`). This design focuses on targeted improvements to achieve the desired UX.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (React)                           │
│                                                                 │
│  RegisterPage ──auto-redirect──▶ DeliveryCourierProfileSetup    │
│                                   (5-step Uber-style wizard)    │
│                                                                 │
│  Step 1: CourierTypePicker                                      │
│  Step 2: PersonalInfoForm                                       │
│  Step 3: VehicleInfoForm (skipped for bicycle)                  │
│  Step 4: DocumentUpload (conditional doc list)                  │
│  Step 5: SubmitForApproval                                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ API Calls
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Django REST)                        │
│                                                                 │
│  POST /auth/register/                                           │
│    → Returns access token + redirect_to field                   │
│                                                                 │
│  PATCH /deliveries/driver/mode/                                 │
│    → Saves delivery_vehicle_type                                │
│                                                                 │
│  PATCH /auth/identity/update/                                   │
│    → Saves personal info + profile photo                        │
│                                                                 │
│  POST /deliveries/courier/vehicle-setup/                        │
│    → Saves vehicle details (or clears for bicycle)              │
│                                                                 │
│  GET /drivers/me/documents/?context=delivery                    │
│  POST /drivers/me/documents/upload/                             │
│    → Handles document upload                                    │
│                                                                 │
│  POST /deliveries/courier/profile-setup/submit/                 │
│    → Sets status to pending_review                              │
│                                                                 │
│  GET /deliveries/courier/onboarding/                            │
│    → Returns full onboarding state with step completion         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Data Layer                                │
│                                                                 │
│  User (first_name, last_name, phone_number, city_id,            │
│         profile_picture)                                        │
│  DriverProfile (vehicle_make, vehicle_model, vehicle_color,     │
│                  plate_number, status, terms_accepted)           │
│  DriverDeliverySettings (delivery_vehicle_type)                 │
│  DriverDocument (document_type, file, status, expires_at)       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Registration**: User submits registration form → backend creates account → response includes `redirect_to: "/delivery/profile-setup"` for delivery app context → frontend navigates to profile setup.

2. **Profile Setup Wizard**: Frontend loads onboarding state from `GET /deliveries/courier/onboarding/` → determines which step to resume → renders the appropriate wizard step.

3. **Step Persistence**: Each step saves data to the backend before advancing (courier type → `PATCH /deliveries/driver/mode/`, personal info → `PATCH /auth/identity/update/`, vehicle → `POST /deliveries/courier/vehicle-setup/`).

4. **Submission**: Final step posts to `POST /deliveries/courier/profile-setup/submit/` → sets `status = "pending_review"` → courier sees confirmation and is redirected to onboarding dashboard.

## Components

### Backend Changes

#### 1. RegisterView Response Enhancement

**File**: `backend/taxi/authapp/views.py` (or serializer)

Add a `redirect_to` field in the registration response when the app type is `delivery`:

```python
# In RegisterSerializer.create() or RegisterView.create() response
if app_type == "delivery":
    response_data["redirect_to"] = "/delivery/profile-setup"
```

This tells the frontend where to navigate after successful registration.

#### 2. Courier Onboarding State (existing, minor improvements)

**File**: `backend/taxi/deliveries/courier_onboarding.py`

The existing `build_courier_onboarding_state()` already:
- Tracks step completion for all 8 steps
- Returns `bicycle_courier` flag
- Returns `required_document_types`
- Marks vehicle step as complete for bicycle couriers

Minor improvements:
- Ensure the `steps` list includes `visible` flag so frontend can filter hidden steps
- Add `wizard_steps` field that returns only the 5 wizard-relevant steps (type, personal, vehicle, documents, submit)

#### 3. Vehicle Setup View (existing, no changes needed)

**File**: `backend/taxi/deliveries/views.py`

The existing `courier_vehicle_setup` view already:
- Accepts `delivery_vehicle_type`
- Clears vehicle fields for bicycle couriers
- Validates vehicle fields for motorcycle/car couriers
- Checks for duplicate plate numbers

#### 4. Profile Submit View (existing, no changes needed)

**File**: `backend/taxi/deliveries/views.py`

The existing `courier_profile_setup_submit` view already:
- Validates all required fields are complete
- Validates all documents are uploaded
- Sets `profile.status = "pending_review"`
- Returns confirmation message

### Frontend Changes

#### 1. Registration Auto-Redirect

**File**: `frontend/src/delivery/` (registration handler or app routing)

After successful registration API response:
```javascript
if (response.data.redirect_to) {
  window.location.href = response.data.redirect_to;
}
```

#### 2. DeliveryCourierProfileSetup (existing, refinements)

**File**: `frontend/src/delivery/DeliveryCourierProfileSetup.js`

The existing component already implements the 5-step wizard:
- Step navigation with `getNextStepIndex` / `getPreviousStepIndex` that skips vehicle for bicycle
- `visibleSteps` computed list that filters out the vehicle step for bicycle
- Progress bar based on visible steps
- Conditional field display per courier type
- Document upload with type-specific requirements

Refinements needed:
- Ensure the step indicator labels match the user's specification exactly
- Verify the resume-at-incomplete-step logic correctly handles all edge cases
- Ensure the UI styling matches the Uber-style design consistently

#### 3. DeliveryCourierOnboarding Dashboard (existing, minor refinements)

**File**: `frontend/src/delivery/DeliveryCourierOnboarding.js`

The existing component already:
- Shows progress bar with step completion
- Renders all steps with action buttons
- Links to profile setup page for incomplete steps

Refinements:
- Ensure the "Create courier account" button passes `next=/delivery/profile-setup`
- Ensure registration link in action button uses the redirect parameter

### Conditional Logic Matrix

| Courier Type  | Vehicle Step | Profile Photo | Documents Required                                 |
|---------------|-------------|---------------|----------------------------------------------------|
| Bicycle       | Skipped     | Required      | National ID                                        |
| Motorcycle    | Shown       | Optional      | National ID, Driver License, Carte Grise, Insurance|
| Vehicle/Car   | Shown       | Optional      | National ID, Driver License, Carte Grise, Insurance|

### Step Visibility Logic

```
function getVisibleSteps(courierType):
  if courierType == "bicycle":
    return [type, personal, documents, submit]   // 4 steps
  else:
    return [type, personal, vehicle, documents, submit]  // 5 steps
```

## Correctness Properties

### Property 1: Bicycle couriers never receive vehicle field requirements

For any courier with `delivery_vehicle_type = "bicycle"`:
- `_vehicle_info_complete()` returns `True` without checking vehicle fields
- The wizard skips the vehicle step (step index jumps from 1 to 3)
- Vehicle fields are cleared on the server side

### Property 2: Document requirements match courier type exactly

For any courier type `T`:
- `get_required_courier_document_types(T)` returns exactly the documents specified:
  - bicycle → `["national_id"]`
  - motorcycle → `["national_id", "license", "carte_grise", "insurance"]`
  - car → `["national_id", "license", "carte_grise", "insurance"]`
- The frontend renders upload cards only for these document types

### Property 3: Application cannot be submitted with incomplete data

For any call to `courier_profile_setup_submit`:
- If courier type is not set → 400 error
- If personal fields are incomplete → 400 error
- If vehicle info is incomplete (for motor vehicles) → 400 error
- If required documents are missing → 400 error
- If terms not accepted → 400 error

### Property 4: Auto-redirect preserves registration context

For any successful courier registration in the delivery app:
- The response includes `redirect_to: "/delivery/profile-setup"`
- The frontend navigates to this path immediately
- The profile setup page loads and identifies the user as authenticated

### Property 5: Step resume is idempotent

For any returning courier who loads the profile setup page:
- The wizard calculates the first incomplete step from the onboarding state
- The same incomplete step is reached regardless of how many times the page is loaded
- Completed steps remain complete between page loads

### Property 6: Courier type change resets dependent data

When a courier changes their type selection:
- The document requirements recalculate based on the new type
- The vehicle step visibility updates immediately
- The progress percentage adjusts for the new number of visible steps

## Error Handling

| Scenario | Response |
|----------|----------|
| Unauthenticated access to profile setup | Redirect to `/login?next=/delivery/profile-setup` |
| Duplicate phone number | 400 error with descriptive message |
| Duplicate plate number | 400 error with descriptive message |
| Document upload failure | Toast error with retry option |
| Network failure during step save | Error banner with message, user stays on current step |
| Terms not accepted on submit | Validation error preventing submission |
| Missing required documents | Disabled Continue button + list of missing documents |

## Performance Considerations

- Profile setup loads onboarding state, driver profile, cities, and documents in parallel (`Promise.all`)
- Step saves are individual API calls (no batch) to provide immediate feedback
- Document uploads show per-document loading state
- The wizard only renders the current step's content (not all steps at once)
