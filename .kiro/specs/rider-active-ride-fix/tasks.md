# Rider Active Ride Fix — Task List

## Constraints
- Only modify the Rider Active Ride screen (bottom sheet panel in `RiderDashboard.js`)
- Do NOT change Driver App, Admin Dashboard, or backend
- Do NOT redesign the whole Rider Dashboard — only the active ride section
- Preserve: Cancel button, Chat, SOS, WebSocket updates, Pay & Rate, cancellation notices
- Show screenshots/verification before rebuilding APK

---

## Task 1: Restructure Active Ride Panel Layout (Scrollable Container)

- [x] In `frontend/src/rider/RiderDashboard.js`, wrap the active ride sections (`sx-live-trip-card`, `sx-status-timeline`, `sx-driver-info-card`, SOS button) in a single scrollable container div
- [x] Set `overflow-y: auto` and `max-height` based on viewport to eliminate blank space
- [x] Reorder sections inside the container to match the design: Status Hero → Trip Route → PIN → ETA/Fare → Driver Card → Vehicle Card → Actions
- [x] Ensure the booking form, history section, and all non-active-ride content remain untouched outside this container
- [x] Verify Cancel button, SOS button, and Chat button still render and function within the new layout

**Validates:** Requirement 2.8 (compact, information-dense layout eliminating blank space)

---

## Task 2: Enhance Status Hero with Descriptive Label

- [x] Replace the raw `currentRide.status` pill in the `sx-live-trip-card` section with a descriptive status label using the existing `getStatusLabel()` helper
- [x] Style the status label larger with contextual detail (e.g., "Driver Arriving — 3 min away" when ETA is available)
- [x] Show ride type (Regular/Premium) inline with the status
- [x] Add ETA context when `liveTrackingEta` is available

**Validates:** Requirement 2.7 (descriptive ride status label)

---

## Task 3: Add Trip Route Section (Pickup + Drop-off)

- [x] Add a new section below the Status Hero showing pickup and drop-off locations
- [x] Render pickup address with a green dot indicator (using `currentRide.pickup` or `currentRide.pickup_address`)
- [x] Render drop-off address with a red dot indicator (using `currentRide.destination` or `currentRide.destination_address`)
- [x] Connect the dots with a vertical line for visual route indication
- [x] Only render this section when `currentRide` exists and has active status

**Validates:** Requirement 2.1 (pickup and drop-off displayed prominently)

---

## Task 4: Enhance Pickup PIN Section (Prominent Display)

- [x] Restyle the pickup PIN to be large, prominent, and card-based with a colored background
- [x] Display each PIN digit in its own box (e.g., 4 separate digit boxes for a 4-digit PIN)
- [x] Add safety instruction text below PIN: "Share this PIN with your driver at pickup"
- [x] Only show PIN section when `currentRide.status` ∈ {`driver_arriving`, `driver_arrived`} AND `currentRide.pickup_pin` exists
- [x] Hide PIN for other statuses (requested, in_progress, completed)

**Validates:** Requirement 2.4 (ride PIN prominently displayed for driver_arriving/arrived)

---

## Task 5: Add Live ETA & Distance + Fare Section

- [x] Create an inline row with two cards: ETA/Distance and Fare
- [x] ETA card: Show minutes from `liveTrackingEta` or `routeInfo.etaMinutes`, and distance from `liveTrackingDistance` or `distance`
- [x] Fare card: Show fare estimate (from `fare` state or `currentRide.fare`) with "Estimate" label when status ≠ completed
- [x] Fare card: Show total fare with "Total" label when status = completed
- [x] Use existing `formatMoney()` utility for currency formatting
- [x] Values update automatically via existing WebSocket/polling state changes (no new subscriptions needed)

**Validates:** Requirements 2.5 (live ETA and distance) and 2.6 (fare estimate/total)

---

## Task 6: Enhance Driver Information Card

- [x] Restructure the existing `sx-driver-info-card` section into a more complete card layout
- [x] Driver photo: Use `getDriverPhoto(currentRide)` with existing fallback avatar (first letter of name)
- [x] Full name: `currentRide.driver_name`
- [x] Rating: `currentRide.driver_avg_rating` with star icon + trip count (`currentRide.completed_trips`)
- [x] Driver category/level: `currentRide.driver_category_label` (e.g., "Silver Driver")
- [x] Member since: `currentRide.driver_member_since_year`
- [x] Contact actions: Keep existing Call button (`driver_phone`), Chat button (`setShowChat(true)`), Share button (`shareTrip`)
- [x] Keep private call number hint
- [x] Render only when `currentRide?.driver_name` is truthy (existing guard)

**Validates:** Requirement 2.2 (driver information card with photo, name, rating, code, level)

---

## Task 7: Add Dedicated Vehicle Information Card

- [x] Create a new section below the Driver Card for vehicle details
- [x] Vehicle description: Use `getVehicleLabel(currentRide)` — shows color + make + model
- [x] Plate number: Use `getPlateNumber(currentRide)` in prominent styling
- [x] Vehicle category: Show `currentRide.ride_type` (e.g., "Regular", "Premium")
- [x] Vehicle icon/placeholder: Show a car emoji or category icon (API doesn't provide vehicle photo)
- [x] Only render when `currentRide?.driver_name` is truthy (vehicle is associated with driver)

**Validates:** Requirement 2.3 (vehicle information card with make, model, color, plate, category)

---

## Task 8: Reorganize Action Buttons (SOS, Cancel, Share)

- [x] Move SOS, Cancel Ride, and Share Trip buttons into a single "Actions Row" at the bottom of the active ride panel
- [x] Keep all existing onClick handlers unchanged: Cancel → `setCancelModalOpen(true)`, SOS → `setShowSafetyPanel(true)`, Share → `shareTrip()`
- [x] Preserve `canCancelCurrentRide` guard for the Cancel button
- [x] Preserve `activeRideStatuses.has(currentRide.status)` guard for SOS
- [x] Style as a horizontal row of action buttons with consistent sizing

**Validates:** Requirements 3.2, 3.3 (preserve cancel and SOS functionality)

---

## Task 9: Enhance Driver Marker Styling on Map

- [x] In `frontend/src/maps/GoogleTripMap.js`, verify the driver marker uses the car SVG path icon with yellow stroke (already implemented)
- [x] Ensure the driver marker has `zIndex: 999` so it renders above other markers
- [x] Confirm marker rotation based on travel direction works correctly
- [x] No changes needed to pickup marker (green circle, label "P") or destination marker (red circle, label "D")
- [x] No changes needed to route polylines (rider-route and live-driver-route)

**Validates:** Requirement 2.9 (map shows driver live location with proper styling)

---

## Task 10: Status Transition Verification

- [x] Verify panel updates correctly when ride transitions through all statuses: `requested` → `accepted` → `driver_arriving` → `driver_arrived` → `in_progress` → `completed`
- [x] Verify PIN section appears for `driver_arriving`/`driver_arrived` and hides for other statuses
- [x] Verify ETA/distance updates when `liveTrackingEta`/`liveTrackingDistance` state changes
- [x] Verify "Pay & Rate" button still appears on `completed` status
- [x] Verify cancellation notice still displays after cancel action
- [x] No new WebSocket subscriptions or API endpoints — all data comes from existing `currentRide` state and `fetchCurrentRide()` polling

**Validates:** Requirements 2.10 (real-time status transitions) and 3.5, 3.6, 3.7 (preservation)

---

## Task 11: Regression & Preservation Testing

- [x] Verify booking form renders unchanged when no active ride exists (city selector, pickup/destination, ride type, fare, request button)
- [x] Verify Cancel flow: button → modal → reason selection → API call → cancellation notice
- [x] Verify SOS: button → SafetyEmergencyPanel opens
- [x] Verify Chat: button → RideChat overlay opens with correct rideId
- [x] Verify WebSocket subscriptions (`subscribeRideUpdates`, `joinRideUpdates`) still called with correct params
- [x] Verify map polylines still render with animation
- [x] Verify language switching still works on the active ride panel
- [x] Verify account panel, saved places, ride history sections unchanged

**Validates:** Requirements 3.1–3.8 (all preservation requirements)

---

## Task 12: Visual Verification & Screenshots

- [x] Take screenshots of the active ride panel in each status: `accepted`, `driver_arriving`, `driver_arrived`, `in_progress`, `completed`
- [x] Confirm no excessive blank space in the left-side panel
- [x] Confirm all required information is visible: trip route, driver card, vehicle card, PIN (when applicable), ETA, fare, status
- [x] Confirm map shows all markers and routes correctly
- [ ] Present screenshots for user review BEFORE rebuilding the APK

**Validates:** User requirement for visual verification before APK build
