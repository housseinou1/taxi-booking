# Rider Active Ride Fix — Bugfix Design

## Overview

The rider's active ride screen (bottom sheet panel in `RiderDashboard.js`) fails to display critical trip, driver, and vehicle information when a ride is active. Although the backend API (via `RideSerializer`) already provides all required data fields (driver name, photo, vehicle details, pickup PIN, fare, etc.), the frontend renders only a minimal status timeline, a chat button, SOS button, and a cancel button — leaving large blank space and making it impossible for riders to verify their driver, track ETA, or see fare details.

The fix restructures the active ride section of the bottom sheet into an information-dense, scrollable panel with clearly separated cards for: trip route, driver info, vehicle info, ride PIN, live ETA/distance, fare, and descriptive status. The map must also clearly show pickup marker, destination marker, driver live location, and route polylines.

## Glossary

- **Bug_Condition (C)**: The rider has an active ride (status ∈ {requested, accepted, driver_arriving, driver_arrived, in_progress}) AND the active ride panel does not display all required information (trip route, driver card, vehicle card, PIN, ETA, fare, status label)
- **Property (P)**: When C holds, the panel SHALL render all required sections with data from the ride API response in a compact, organized layout
- **Preservation**: Existing behaviors (booking form when no ride, cancel button, SOS button, chat button, WebSocket subscriptions, Pay & Rate flow, map polylines) must remain unchanged
- **RiderDashboard**: The main React component in `frontend/src/rider/RiderDashboard.js` that renders both the booking form and the active ride panel
- **RideSerializer**: The Django REST serializer in `backend/taxi/taxi/rides/serializers.py` that provides ride data including driver/vehicle details
- **currentRide**: The state variable in RiderDashboard holding the active ride object from the `/rides/history/` API
- **wsService**: The WebSocket service (`frontend/src/rider/services/wsService.js`) providing real-time ride status and driver position updates

## Bug Details

### Bug Condition

The bug manifests when a rider has an active ride and the bottom sheet panel displays only a status timeline, chat button, SOS button, and cancel button. The `RiderDashboard` component has the data available in `currentRide` state (populated from the API) but does not render it in dedicated, clearly visible sections.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { currentRide: Ride | null, panelSections: RenderedSections }
  OUTPUT: boolean

  RETURN input.currentRide IS NOT NULL
         AND input.currentRide.status IN ['requested', 'accepted', 'driver_arriving', 'driver_arrived', 'in_progress']
         AND (
           NOT panelSections.hasTripRouteSection
           OR NOT panelSections.hasDriverInfoCard
           OR NOT panelSections.hasVehicleInfoCard
           OR NOT panelSections.hasPickupPinSection (when status IN ['driver_arriving', 'driver_arrived'])
           OR NOT panelSections.hasLiveEtaSection
           OR NOT panelSections.hasFareSection
           OR NOT panelSections.hasDescriptiveStatusLabel
           OR panelSections.hasExcessiveBlankSpace
         )
END FUNCTION
```

### Examples

- **Example 1**: Rider has a ride in `driver_arriving` status. Driver name is "Amadou Diallo", vehicle is "White Toyota Corolla", plate "4532 MR". Panel shows only "Driver Arriving" text and timeline dots — no driver photo, vehicle details, or plate number visible.
- **Example 2**: Ride in `driver_arrived` status with pickup PIN "4821". PIN section exists but is small and easy to miss. No prominent PIN card with safety instructions.
- **Example 3**: Ride `in_progress`. Live ETA and distance are shown only in a tiny floating overlay on the map, not in the main panel. Fare estimate not visible at all in the panel body.
- **Example 4**: Map shows pickup and destination markers but the driver marker is only visible when `shouldTrackDriver` is true and even then uses a plain "C" label without clear driver icon styling.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When no active ride exists, the booking form (pickup/destination inputs, city selector, ride type selector, fare estimates, quick links) MUST continue to display exactly as before
- Cancel ride button with reason selection modal and confirmation flow MUST continue to work for cancellable statuses
- SOS emergency button MUST continue to open the SafetyEmergencyPanel
- Chat button MUST continue to open the RideChat overlay
- WebSocket subscription for ride status updates and driver position MUST continue to function (2-second polling + WebSocket events)
- "Pay & Rate" button on completed rides MUST continue to navigate to `/rider-payments`
- Cancellation fee notice and refund status information MUST continue to display after cancellation
- Map polylines (rider-route and live-driver-route) with animation MUST continue to render

**Scope:**
All inputs that do NOT involve an active ride screen layout should be completely unaffected by this fix. This includes:
- The booking form flow
- Ride history / spending analytics section
- Account/identity profile panel
- Language switching
- Saved places navigation
- Logout flow

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **Incomplete Panel Rendering**: The active ride section in the bottom sheet only renders a minimal `sx-live-trip-card` section with status + cancel button, and a `sx-status-timeline` section. The driver info card exists but only shows when `currentRide?.driver_name` is truthy — it lacks vehicle-specific and fare sections.

2. **No Dedicated Trip Route Section**: There is no section that displays pickup and drop-off addresses in a visual route format (origin dot → line → destination dot) within the active ride panel.

3. **No Dedicated Vehicle Card**: Vehicle info is merged into the driver card as a single line (`getVehicleLabel · Plate getPlateNumber`). There's no separate card with vehicle photo, color, make, model, and category.

4. **No Fare Section in Active Ride**: Fare is only shown in the `bookingFarePillStyle` at the top (hero section) which doesn't update between estimate and final fare, and doesn't clearly indicate whether it's an estimate or final.

5. **Weak Status Labels**: The status is shown as a raw status code pill (`currentRide.status`) rather than a user-friendly descriptive label like "Driver is on the way — 4 min away".

6. **ETA/Distance Only in Floating Overlay**: Live tracking info appears only in a small floating HUD over the map, not in the main panel content.

## Correctness Properties

Property 1: Bug Condition - Active Ride Panel Displays All Required Information

_For any_ active ride where the rider has a currentRide with status in {requested, accepted, driver_arriving, driver_arrived, in_progress}, the fixed RiderDashboard SHALL render a compact, scrollable panel containing: (a) trip route section with pickup and destination addresses, (b) driver info card with photo, name, rating, code, and level when a driver is assigned, (c) vehicle info card with make, model, color, plate, and category when a driver is assigned, (d) ride PIN prominently displayed for driver_arriving/driver_arrived statuses, (e) live ETA and distance section, (f) fare estimate or total fare, and (g) descriptive status label.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

Property 2: Preservation - Non-Active-Ride Behavior Unchanged

_For any_ state where no active ride exists OR the rider interacts with preserved features (booking form, cancel modal, SOS panel, chat overlay, WebSocket subscriptions, Pay & Rate navigation), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for booking, cancellation, safety, chat, and payment flows.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/rider/RiderDashboard.js`

**Section**: Active ride rendering within the bottom sheet (lines ~1220–1320)

**Specific Changes**:

1. **Add Trip Route Section**: Insert a new section below the booking hero when `currentRide` exists, showing pickup address (green dot) and destination address (red dot) in a vertical route format with address text pulled from `currentRide.pickup` / `currentRide.destination` (or `currentRide.pickup_address` / `currentRide.destination_address`).

2. **Enhance Driver Info Card**: Restructure the existing `sx-driver-info-card` section to include:
   - Driver photo (from `currentRide.driver_picture`) with fallback avatar
   - Full name (`currentRide.driver_name`)
   - Rating (`currentRide.driver_avg_rating`) with star indicator
   - Driver code/ID
   - Driver category/level (`currentRide.driver_category_label`)
   - Member since year (`currentRide.driver_member_since_year`)
   - Contact/chat button inline

3. **Add Dedicated Vehicle Info Card**: Create a new section showing:
   - Vehicle description (`currentRide.vehicle` — color + make + model from serializer)
   - Plate number (`currentRide.plate_number`)
   - Vehicle category (ride_type)
   - Vehicle photo placeholder (API doesn't provide vehicle photo yet — show category icon)

4. **Enhance Pickup PIN Section**: Restyle the existing PIN section to be larger, more prominent with:
   - Large PIN digits in a card with colored background
   - Safety instruction text
   - Only visible when status ∈ {driver_arriving, driver_arrived}

5. **Add Live ETA & Distance Section**: Create an inline section within the panel (not just floating overlay) showing:
   - ETA in minutes from `liveTrackingEta` or `routeInfo.etaMinutes`
   - Distance from `liveTrackingDistance` or `distance`
   - Auto-refresh via existing WebSocket + polling mechanism

6. **Add Fare Section**: Add a dedicated card showing:
   - Fare estimate (from `fare` state or `currentRide.fare`) when status ≠ completed
   - Total fare (from `currentRide.fare`) when status = completed
   - Currency formatting via existing `formatMoney()` utility

7. **Enhance Status Label**: Replace raw status pill with descriptive text from the existing `getStatusLabel()` function, styled larger with contextual detail (e.g., "Driver Arriving — 3 min away").

8. **Layout Restructure**: Wrap all active ride sections in a scrollable container that eliminates blank space. Order: Status Hero → Trip Route → PIN (conditional) → ETA/Distance + Fare (inline row) → Driver Card → Vehicle Card → Actions (Chat, SOS, Cancel, Share).

### Data Fields from Ride API

The `RideSerializer` already provides all needed fields. No backend changes required:

| Field | Source | Usage |
|-------|--------|-------|
| `pickup` / `pickup_address` | Ride model | Trip route display |
| `destination` / `destination_address` | Ride model | Trip route display |
| `driver_name` | SerializerMethodField | Driver card |
| `driver_picture` | DriverProfile.driver_photo | Driver card photo |
| `driver_avg_rating` | Aggregated from completed rides | Driver card rating |
| `completed_trips` | Count of completed rides | Driver card experience |
| `driver_category_label` | DriverProfile.driver_category | Driver level/tier |
| `driver_member_since_year` | User.date_joined.year | Driver tenure |
| `vehicle` | DriverProfile (color + make + model) | Vehicle card |
| `plate_number` | DriverProfile.plate_number | Vehicle card |
| `ride_type` | Ride model | Vehicle category |
| `pickup_pin` | Ride model (rider-only) | PIN section |
| `fare` | Ride model | Fare display |
| `status` | Ride model | Status label |
| `distance_km` | Ride model | Distance display |
| `private_call_number` | Market config | Driver contact |

### UI Layout Plan for Active Ride Panel

```
┌─────────────────────────────────────────┐
│  [Status Hero]                          │
│  "Driver Arriving" · Regular · 4 min    │
├─────────────────────────────────────────┤
│  [Trip Route]                           │
│  ● Pickup: Tevragh Zeina               │
│  │                                      │
│  ◉ Drop-off: Ksar, Centre Ville        │
├─────────────────────────────────────────┤
│  [Pickup PIN]  (driver_arriving/arrived)│
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐              │
│  │ 4 │ │ 8 │ │ 2 │ │ 1 │              │
│  └───┘ └───┘ └───┘ └───┘              │
│  "Share with your driver at pickup"     │
├─────────────────────────────────────────┤
│  [ETA & Fare Row]                       │
│  ┌──────────┐  ┌──────────┐            │
│  │ 4 min    │  │ 1,200 MRU│            │
│  │ 2.3 km   │  │ Estimate │            │
│  └──────────┘  └──────────┘            │
├─────────────────────────────────────────┤
│  [Driver Card]                          │
│  ┌──────┐  Amadou Diallo               │
│  │ PHOTO│  ★ 4.8 · 234 trips           │
│  └──────┘  Silver Driver · Since 2022  │
│            [Call] [Chat]                │
├─────────────────────────────────────────┤
│  [Vehicle Card]                         │
│  🚗 White Toyota Corolla               │
│  Plate: 4532 MR · Regular              │
├─────────────────────────────────────────┤
│  [Actions Row]                          │
│  [SOS] [Cancel Ride] [Share Trip]       │
└─────────────────────────────────────────┘
```

### WebSocket / Status Update Handling

The existing WebSocket infrastructure is adequate. The fix maintains:

1. **Ride status subscription** (via `subscribeRideUpdates` in `socket.js`): Updates `currentRide` via `fetchCurrentRide()` on every `ride_update` or `ride_status_update` message. The enhanced panel re-renders automatically via React state.

2. **Driver position subscription** (via `joinRideUpdates` / `subscribeRideUpdates` for `location_update`): Continues to set `driverPosition` state. The panel's ETA/distance section reads from `liveTrackingEta` and `liveTrackingDistance` which are already computed from driver position.

3. **Polling fallback** (2-second `setInterval` calling `fetchCurrentRide` + `fetchDriverLocation`): Continues unchanged as backup for WebSocket drops.

4. **Status transition handling**: When status changes (e.g., `driver_arriving` → `driver_arrived`), the panel must:
   - Update the status hero label
   - Show/hide PIN section (visible only for `driver_arriving`/`driver_arrived`)
   - Update ETA/distance values
   - Trigger route recalculation (already handled by `useEffect` on `displayedDriverPosition`)

No new WebSocket events or API endpoints are required.

### Map Marker / Route Handling

The existing map rendering in `GoogleTripMap` already supports the required markers and polylines. The fix ensures:

1. **Pickup marker** (label "P"): Already rendered — keep as-is with green styling
2. **Destination marker** (label "D"): Already rendered — keep as-is with red styling
3. **Driver live location marker** (label "C", type "driver"): Already rendered when `shouldTrackDriver && displayedDriverPosition`. Enhance styling in `GoogleTripMap` to use a car icon or distinct color for the driver marker.
4. **Route: pickup → destination** (id "rider-route"): Already rendered as dark polyline with animation
5. **Route: driver → rider/destination** (id "live-driver-route"): Already rendered as blue polyline when tracking

**Enhancement needed**: The driver marker should use a more distinctive visual (car icon or colored circle) rather than plain "C" label. This is a CSS/marker style change in `GoogleTripMap.js`.

### Regression Risks

| Risk | Mitigation |
|------|-----------|
| Breaking booking form layout when no active ride | Conditional rendering: active ride sections only render when `currentRide` is truthy with active status |
| Cancel button disappearing or moving | Keep cancel button in the Actions Row; verify `canCancelCurrentRide` logic unchanged |
| WebSocket subscription leaks | No new subscriptions added; existing cleanup in useEffect return functions preserved |
| PIN visible to wrong user/status | PIN visibility guard already in serializer (`request.user == obj.rider` + status check); frontend adds `status ∈ {driver_arriving, driver_arrived}` guard |
| Performance degradation from added DOM | Use existing compact inline styles; no heavy new components; sections are conditionally rendered |
| Mobile scroll issues | Wrap active ride content in a single scrollable container with `overflow-y: auto` and `max-height` based on viewport |
| Breaking existing CSS classes | New sections use inline styles (matching project convention) or new class names that don't conflict with existing `sx-*` classes |

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the active ride panel is missing required information sections.

**Test Plan**: Write React component tests that render `RiderDashboard` with a mocked `currentRide` in various statuses and assert the presence of required DOM elements. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Driver Info Missing Test**: Render with `currentRide.status = 'driver_arriving'` and `driver_name = 'Test Driver'`. Assert driver photo, name, rating, category are rendered (will fail on unfixed code)
2. **Vehicle Info Missing Test**: Render with active ride having vehicle data. Assert vehicle make/model/color and plate number are in a visible card (will fail on unfixed code)
3. **PIN Not Prominent Test**: Render with `status = 'driver_arrived'` and `pickup_pin = '1234'`. Assert PIN is displayed in a prominent card with large text (will fail on unfixed code — PIN exists but is small)
4. **Fare Not Displayed Test**: Render with active ride. Assert fare amount is visible in the panel body (will fail on unfixed code)
5. **ETA Not In Panel Test**: Assert live ETA value appears inside the bottom sheet panel content (will fail — currently only in map HUD)

**Expected Counterexamples**:
- Vehicle card section not found in DOM
- Fare section not found in panel body
- ETA section not found within bottom sheet
- Possible causes: conditional rendering blocks, missing JSX sections, data available but not rendered

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  renderedPanel := renderRiderDashboard(input.currentRide)
  ASSERT renderedPanel.contains(TripRouteSection)
  ASSERT renderedPanel.contains(DriverInfoCard) WHEN input.currentRide.driver_name
  ASSERT renderedPanel.contains(VehicleInfoCard) WHEN input.currentRide.vehicle
  ASSERT renderedPanel.contains(PickupPinCard) WHEN status IN ['driver_arriving', 'driver_arrived']
  ASSERT renderedPanel.contains(LiveEtaSection)
  ASSERT renderedPanel.contains(FareSection)
  ASSERT renderedPanel.contains(DescriptiveStatusLabel)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderRiderDashboard_original(input) = renderRiderDashboard_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of ride state (null ride, various statuses, with/without driver) automatically
- It catches edge cases like race conditions between status transitions
- It provides strong guarantees that booking form, cancel flow, and chat remain unchanged

**Test Plan**: Observe behavior on UNFIXED code first for booking form rendering and cancel flow, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Booking Form Preservation**: Verify that when `currentRide` is null, the booking form renders identically (city selector, pickup/destination inputs, ride type, fare, request button)
2. **Cancel Flow Preservation**: Verify cancel button opens modal, reason selection works, API call with correct payload succeeds
3. **SOS Button Preservation**: Verify SOS opens SafetyEmergencyPanel in all active ride statuses
4. **Chat Button Preservation**: Verify chat opens RideChat overlay with correct rideId
5. **WebSocket Subscription Preservation**: Verify `subscribeRideUpdates` and `joinRideUpdates` are called with correct parameters
6. **Map Polyline Preservation**: Verify route polylines continue to render with correct paths and styling

### Unit Tests

- Test each new panel section renders correctly given various `currentRide` states
- Test PIN visibility logic: shown only for `driver_arriving` / `driver_arrived`
- Test fare display: estimate vs. total based on status
- Test status label: correct descriptive text for each status value
- Test driver card: handles missing driver photo gracefully (fallback avatar)
- Test vehicle card: handles missing vehicle data gracefully

### Property-Based Tests

- Generate random ride objects with varying statuses, driver presence, and data completeness; verify all required sections render when expected
- Generate random non-active states (null ride, completed, cancelled); verify booking form renders identically to unfixed code
- Generate random status transitions and verify panel updates correctly without breaking

### Integration Tests

- Test full flow: request ride → driver accepts → panel updates with driver info → driver arrives → PIN visible → ride starts → ETA updates → ride completes → Pay & Rate shown
- Test WebSocket status update triggers panel re-render with new data
- Test driver position update causes ETA/distance recalculation in panel
- Test cancel during active ride removes panel and returns to booking form
