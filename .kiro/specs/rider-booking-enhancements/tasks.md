# Rider Booking Enhancements — Task List

## Constraints
- Only modify `frontend/src/rider/RiderDashboard.js` (primary)
- Do NOT change Driver App, Admin Dashboard, or backend
- Do NOT redesign the whole Rider Dashboard — continue improving current version
- Do NOT rebuild APK until approved
- Keep current design direction intact

---

## Task 1: GPS Auto-fill for Pickup Location

- [x] Add `gpsPosition`, `gpsLoading`, and `gpsError` state variables
- [x] Add a `useEffect` on mount that calls `navigator.geolocation.getCurrentPosition()` with a 10-second timeout
- [x] On GPS success: find the nearest MARKET location within 500m using `calculateDistanceKm()`, set `pickup` to that label (or "Current Location" if no match)
- [x] On GPS error/denial: set `gpsError = true`, leave `pickup` empty so rider enters manually
- [x] While GPS is resolving (`gpsLoading = true`): show "Finding your location..." placeholder text in the pickup field
- [x] After GPS resolves: show a 📍 icon next to the pickup value to indicate auto-detected location
- [x] Ensure rider can still tap and edit the pickup field to override GPS (existing behavior preserved)

**Validates:** Requirement 1 (GPS Auto-fill)

---

## Task 2: Dedicated Drop-off Search Field with Autocomplete

- [x] Import the existing `LocationInput` component from `./components/LocationInput`
- [x] Replace the destination `<input list="mauritania-locations">` with `<LocationInput label="Drop-off" value={destination} city={city} savedPlaces={savedPlaces} onSelect={handleDropoffSelect} />`
- [x] Create `handleDropoffSelect` function that sets `destination` state and triggers route/fare calculation
- [x] Keep the pickup field as a simpler input (with GPS indicator) since users rarely change it
- [x] Maintain the existing green dot (pickup) → vertical line → red dot (drop-off) visual indicators
- [x] Ensure the "Add Another Stop" button still works below the drop-off field
- [x] Verify the `<datalist id="mauritania-locations">` is still rendered for the pickup field fallback

**Validates:** Requirement 2 (Separate Pickup and Drop-off Fields)

---

## Task 3: Hide Ride Type Prices Until Destination Selected

- [x] Wrap the entire `rideOptionsStyle` section (ride type buttons + fares) in a conditional: only render when `destination && destination !== pickup && distance > 0`
- [x] When no destination is selected: show only the fare hint message ("Select your destination to see fare estimates")
- [x] Move the fare hint outside the ride options section so it's always visible when appropriate
- [x] Ensure the fare hint disappears when a destination IS selected and ride types appear
- [x] Verify the "Request Ride" button still appears after ride type selection
- [x] Confirm that `fare` state is still correctly calculated when destination is set (for the ride request API call)

**Validates:** Requirement 3 (Conditional Ride Type Pricing Display)

---

## Task 4: Structured Profile Menu in Account Panel

- [x] Add a profile navigation menu section inside the `showAccountPanel` conditional block
- [x] Create menu items in order: Personal Information, Payment Methods, Trip History, Saved Places, Notifications, Support, Logout
- [x] Each item shows an icon + label + arrow indicator (→)
- [x] Wire navigation: Personal Information → `/rider-profile`, Payment Methods → `/payment-setup`, Trip History → `/rider-profile`, Saved Places → `/saved-places`, Notifications → `/notifications`, Support → `/support`
- [x] Implement Logout handler: clear `localStorage` tokens ("access", "refresh"), redirect to `/login`
- [x] Style the menu with consistent item height, padding, and separator lines
- [x] Keep existing account panel content (identity section) above the menu

**Validates:** Requirement 4 (Structured Profile Menu)

---

## Task 5: Payment Method Selector on Booking Screen

- [x] Add `paymentMethods` state (array) and fetch from `/payments/methods/` on mount
- [x] Add `selectedPaymentMethod` state — default to the method with `is_default: true`, or first method, or `{ payment_type: 'cash', display_name: 'Cash' }` fallback
- [x] Display selected payment method near the "Request Ride" button area: icon (💵/💳/👛) + method name + "Change" button
- [x] On "Change" tap: show a simple inline selector/modal listing available payment methods (Cash, Card, Wallet)
- [x] On selection: update `selectedPaymentMethod` state
- [x] Handle API failure gracefully: default to Cash, no error shown to user
- [x] Ensure payment method selection persists for the session (state-based, no extra API call needed)

**Validates:** Requirement 5 (Payment Method Management)

---

## Task 6: Driver Acceptance Info Verification

- [x] Verify the active ride panel (from rider-active-ride-fix) shows: driver photo, name, rating, vehicle make/model/color, plate number, live ETA
- [x] Confirm fallback avatar (first letter) renders when `driver_picture` is missing
- [x] Confirm vehicle category icon (🚗) renders as placeholder when no vehicle photo
- [x] No code changes expected — this is verification only against the existing rider-active-ride-fix implementation

**Validates:** Requirement 6 (Driver Acceptance Information Completeness)

---

## Task 7: Build Verification & Regression Check

- [x] Run `react-scripts build` and confirm zero errors
- [x] Verify booking form renders correctly when no GPS (fallback to manual entry)
- [x] Verify booking form renders correctly when GPS succeeds (auto-filled pickup)
- [x] Verify ride types hidden on initial load (no destination)
- [x] Verify ride types appear after selecting a destination
- [x] Verify profile menu opens with all 7 items
- [x] Verify logout clears tokens
- [x] Verify payment method shows near Request Ride button
- [x] Verify active ride panel still shows all driver/vehicle info (from rider-active-ride-fix)
- [x] Verify Cancel, SOS, Chat buttons still work
- [x] Verify WebSocket updates still function
- [x] Verify map markers and routes unchanged
