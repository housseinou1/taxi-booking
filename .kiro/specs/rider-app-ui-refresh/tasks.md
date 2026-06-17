# Implementation Plan: Rider App UI Refresh

## Overview

This plan decomposes the rider app UI refresh into incremental coding tasks that migrate the monolithic `RiderDashboard.js` into a component-driven, map-first architecture. Tasks proceed bottom-up: design tokens → service layer → context/state → individual components → integration wiring. Each task builds on previous outputs so there is no orphaned code.

## Tasks

- [x] 1. Set up design tokens and project structure
  - [x] 1.1 Create design tokens CSS file and rider component directory structure
    - Create `frontend/src/rider/tokens.css` with all CSS custom properties (colors, spacing, typography, radii, shadows, transitions, layout)
    - Create directory structure: `frontend/src/rider/components/`, `frontend/src/rider/services/`, `frontend/src/rider/context/`
    - Import `tokens.css` into the rider app entry point
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 14.1_

- [x] 2. Implement service layer modules
  - [x] 2.1 Create apiService.js — centralized API client
    - Create `frontend/src/rider/services/apiService.js`
    - Implement functions: `getToken()`, `requestRide()`, `cancelRide()`, `getRideHistory()`, `validatePromo()`, `getActiveRide()`, `getRiderProfile()`
    - Use existing `API_URL` from apiConfig and JWT token from localStorage
    - Handle HTTP errors with structured error responses
    - _Requirements: 14.3, 4.2, 6.3, 8.4, 15.2_

  - [x] 2.2 Create wsService.js — WebSocket subscription service
    - Create `frontend/src/rider/services/wsService.js`
    - Wrap existing `socket.js` with typed subscription interface
    - Implement `subscribeRideUpdates(callback)` and `subscribeDriverPosition(rideId, callback)`
    - Handle reconnection with exponential backoff (1s → 10s max)
    - Return unsubscribe functions for cleanup
    - _Requirements: 14.4, 5.2, 5.3, 9.4_

  - [x] 2.3 Create routeService.js — OSRM routing service
    - Create `frontend/src/rider/services/routeService.js`
    - Extract OSRM route fetching logic from existing `RiderDashboard.js`
    - Implement `getRoute(points)` returning `{ points, distanceKm, etaMinutes }` or null on failure
    - Fallback to haversine distance calculation when OSRM fails
    - _Requirements: 3.6, 1.4_

- [x] 3. Implement RideContext state management
  - [x] 3.1 Create RideContext with reducer and provider
    - Create `frontend/src/rider/context/RideContext.js`
    - Define initial state matching the RideState interface (city, pickup, destination, stops, rideType, fare, routePath, currentRide, driverPosition, bookingStep, bottomSheetState, loading, error)
    - Implement reducer handling all RideAction types (SET_PICKUP, SET_DESTINATION, ADD_STOP, REMOVE_STOP, SET_RIDE_TYPE, SET_ROUTE, SET_FARE, SET_PROMO, REQUEST_RIDE, RIDE_ACCEPTED, RIDE_UPDATE, DRIVER_POSITION, RIDE_COMPLETED, RIDE_CANCELLED, SET_BOOKING_STEP, SET_ERROR, RESET_BOOKING)
    - Enforce stops max-3 invariant in ADD_STOP handler
    - Export context, provider component, and `useRide()` hook
    - _Requirements: 14.2, 2.4_

  - [x]* 3.2 Write property test for stops constraint invariant
    - **Property 2: Stops constraint invariant**
    - Use fast-check to generate arbitrary sequences of ADD_STOP actions
    - Verify stops array length never exceeds 3 regardless of input sequence
    - **Validates: Requirements 2.4**

  - [x]* 3.3 Write property test for ride status to UI state mapping
    - **Property 6: Ride status to UI state mapping**
    - Use fast-check to generate all valid RideStatus values
    - Verify `getStatusStepIndex(status)` returns deterministic index
    - Verify cancel button visibility matches the cancellable status set
    - **Validates: Requirements 5.4, 6.1**

- [x] 4. Implement utility functions and fare calculation
  - [x] 4.1 Create fare calculation and utility functions
    - Create `frontend/src/rider/utils/fareCalculator.js` with `calculateFare(rideType, distanceKm)` using market config base + perKm rates
    - Create `frontend/src/rider/utils/profileCheck.js` with `isProfileComplete(profile)` checking profile_picture and phone_number
    - Create `frontend/src/rider/utils/discountCalculator.js` with `applyDiscount(fare, discountPercent, discountAmount)`
    - Create `frontend/src/rider/utils/locationFilter.js` with `filterLocations(query, city, locations)` for autocomplete
    - Create `frontend/src/rider/utils/rideStatus.js` with `getStatusStepIndex(status)` and `isCancellable(status)`
    - Create `frontend/src/rider/utils/buildRideRequest.js` to transform booking state to API payload
    - _Requirements: 3.5, 4.3, 15.4, 2.2, 5.4, 6.1, 4.1_

  - [x]* 4.2 Write property test for fare calculation correctness
    - **Property 3: Fare calculation correctness**
    - Use fast-check to generate random ride types and positive distances
    - Verify `calculateFare` returns `round((base + distance * perKm) * 100) / 100`
    - **Validates: Requirements 3.5**

  - [x]* 4.3 Write property test for location autocomplete filter correctness
    - **Property 1: Location autocomplete filter correctness**
    - Use fast-check to generate random query strings and city data
    - Verify all returned locations contain the query as case-insensitive substring
    - Verify no matching location from the dataset is excluded
    - **Validates: Requirements 2.2**

  - [x]* 4.4 Write property test for profile completeness guard
    - **Property 5: Profile completeness guard**
    - Use fast-check to generate random profile objects with nullable picture/phone
    - Verify blocking behavior when either is null/empty, proceeding when both present
    - **Validates: Requirements 4.3**

  - [x]* 4.5 Write property test for booking state to API payload transformation
    - **Property 4: Booking state to API payload transformation**
    - Use fast-check to generate valid booking states (coordinates, 0-3 stops, ride type, distance, fare)
    - Verify payload contains all required fields with correct values
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 4.6 Write property test for discount fare computation
    - **Property 9: Discount fare computation**
    - Use fast-check to generate random fares and valid discount values
    - Verify discounted fare matches formula and both original/discounted values are present
    - **Validates: Requirements 15.2, 15.4**

- [x] 5. Checkpoint - Core utilities and state
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement MapView component
  - [x] 6.1 Create MapView component with Leaflet integration
    - Create `frontend/src/rider/components/MapView.js` and `MapView.css`
    - Render full-screen `react-leaflet` MapContainer with TileLayer
    - Accept props: center, zoom, markers, routePath, fitBounds, onMapClick
    - Render markers with type-based icons (pickup=green, destination=red, stop=blue, driver=animated)
    - Render route polyline from routePath coordinates
    - Auto-fit bounds when fitBounds is true and multiple markers present
    - Animate driver marker position with CSS transitions
    - Use design tokens for all styling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.6, 13.1_

- [x] 7. Implement BottomSheet component
  - [x] 7.1 Create BottomSheet component with gesture handling
    - Create `frontend/src/rider/components/BottomSheet.js` and `BottomSheet.css`
    - Implement three snap positions: collapsed (80px), half (50vh), full (90vh)
    - Implement touch/pointer gesture detection for swipe up/down
    - Use `transform: translateY()` with `transition: transform 300ms ease-out`
    - Pass pointer events through to map when collapsed
    - Manage content visibility based on current state
    - Accept props: state, onStateChange, children
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 13.4_

  - [x]* 7.2 Write property test for bottom sheet state machine transitions
    - **Property 7: Bottom sheet state machine transitions**
    - Use fast-check to generate random state + gesture sequences
    - Verify swipe-up transitions to next higher state, swipe-down to next lower
    - Verify result is always one of the three valid states
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 8. Implement LocationInput component
  - [x] 8.1 Create LocationInput component with autocomplete
    - Create `frontend/src/rider/components/LocationInput.js` and `LocationInput.css`
    - Implement text input with debounced filtering using `filterLocations()`
    - Display autocomplete dropdown sorted by relevance (starts-with first, then contains)
    - Show saved places (Home, Work) as quick-select chips above results
    - Emit selected location to parent via onSelect callback
    - Expand bottom sheet to full on focus
    - Use design tokens and 44px minimum tap targets
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 13.2_

- [x] 9. Implement ride type and fare components
  - [x] 9.1 Create FareCard component
    - Create `frontend/src/rider/components/FareCard.js` and `FareCard.css`
    - Display ride type icon, name, fare (with strikethrough if discounted), ETA, and capacity
    - Visual highlight with brand green border when selected
    - Apply `scroll-snap-align: start` for scroll snapping
    - Use design tokens for all colors and spacing
    - _Requirements: 3.2, 3.3, 12.2, 15.4_

  - [x] 9.2 Create RideTypeSelector component
    - Create `frontend/src/rider/components/RideTypeSelector.js` and `RideTypeSelector.css`
    - Horizontal scroll container with `overflow-x: auto` and `scroll-snap-type: x mandatory`
    - Render FareCard for each ride type (Regular, XL, Comfort, Share)
    - Calculate fare per type using `calculateFare()` with route distance
    - Highlight selected card, dispatch SET_RIDE_TYPE on selection
    - _Requirements: 3.1, 3.4, 3.5, 3.6_

- [x] 10. Implement BookingConfirmation component
  - [x] 10.1 Create BookingConfirmation and PromoCodeInput components
    - Create `frontend/src/rider/components/BookingConfirmation.js` and `BookingConfirmation.css`
    - Create `frontend/src/rider/components/PromoCodeInput.js`
    - Display booking summary: pickup, destination, stops, ride type, fare
    - Include PromoCodeInput for discount application
    - Confirm button with loading spinner and duplicate-submission prevention
    - Profile completeness check using `isProfileComplete()` — block and prompt if incomplete
    - Show error notification on API failure
    - Build ride request payload using `buildRideRequest()` and submit via `apiService.requestRide()`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 15.1, 15.2, 15.3_

- [x] 11. Implement RideTracker component
  - [x] 11.1 Create RideTracker component with live tracking
    - Create `frontend/src/rider/components/RideTracker.js` and `RideTracker.css`
    - Display driver info: name, photo, vehicle, plate number
    - Step-by-step progress indicator (Driver Arriving → Arrived → In Progress → Completed)
    - Live ETA display updated from WebSocket via wsService
    - Ride PIN code display
    - Cancel button visible only when `isCancellable(status)` is true
    - Cancel modal requiring reason selection before API call
    - Chat button and SOS button access
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 10.1_

  - [x] 11.2 Create SOSButton and ChatButton components
    - Create `frontend/src/rider/components/SOSButton.js` — visually distinct emergency button (contrasting red)
    - Create `frontend/src/rider/components/ChatButton.js` — notification badge for unread messages
    - SOS opens existing SafetyEmergencyPanel on tap
    - Chat opens existing RideChat component on tap
    - Both use 44px minimum tap targets
    - _Requirements: 10.1, 10.2, 10.4, 9.1, 9.2, 9.3, 13.2_

- [x] 12. Implement ServiceHub and RideHistory
  - [x] 12.1 Create ServiceHub component
    - Create `frontend/src/rider/components/ServiceHub.js` and `ServiceHub.css`
    - Three service tiles: Delivery, Intercity, Schedule
    - 44x44px minimum tap targets with icon and label
    - Horizontal layout fitting within 360px viewport without scroll
    - Navigate to respective flows on tap using router
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 12.2 Create TripCard and RideHistory components
    - Create `frontend/src/rider/components/TripCard.js` and `TripCard.css`
    - Create `frontend/src/rider/components/RideHistory.js` and `RideHistory.css`
    - TripCard displays: date, pickup address, destination address, fare, ride type, status
    - Expandable detail view with route map, driver info, rating
    - RideHistory fetches from apiService.getRideHistory() with JWT auth
    - List ordered by most recent first
    - Empty state message when no history
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 12.3 Write property test for ride history sort order
    - **Property 8: Ride history sort order**
    - Use fast-check to generate random trip lists with date fields
    - Verify rendered order is strictly descending chronological
    - **Validates: Requirements 8.1**

  - [x]* 12.4 Write property test for trip card content completeness
    - **Property 10: Trip card content completeness**
    - Use fast-check to generate random trip summary objects
    - Verify rendered TripCard includes all six required data fields
    - **Validates: Requirements 8.2**

- [x] 13. Checkpoint - All components built
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Wire components into RiderApp router and integrate
  - [x] 14.1 Refactor RiderApp.js to use new component architecture
    - Replace monolithic RiderDashboard import with new component composition
    - Wrap app with RideContext provider
    - Compose home screen: MapView (background) + BottomSheet (foreground) + ServiceHub (collapsed state)
    - Wire BottomSheet content based on bookingStep state: idle→ServiceHub, location→LocationInput, rideType→RideTypeSelector, confirm→BookingConfirmation, tracking→RideTracker
    - Set up WebSocket subscriptions in RideContext provider for ride updates and driver position
    - Implement responsive breakpoint (768px+) with side panel layout
    - Ensure i18n is applied to all user-facing strings via react-i18next
    - _Requirements: 14.1, 14.2, 14.5, 13.3, 1.1, 11.5_

  - [x] 14.2 Wire ride history route and navigation
    - Add /history route rendering RideHistory component
    - Add navigation link/button to ride history from main interface
    - Ensure auth guards are in place for protected routes
    - _Requirements: 8.1, 8.4_

  - [x]* 14.3 Write integration tests for full booking flow
    - Test location selection → ride type → confirm → tracking transition
    - Test WebSocket ride status updates flowing through to RideTracker UI
    - Test driver position updates animating marker on MapView
    - Test API error responses displaying in notification component
    - _Requirements: 4.1, 4.5, 5.2, 4.6_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing RiderDashboard.js can remain as a fallback during migration — it should be removed once all flows are verified working through the new components
- All components use design tokens from `tokens.css` — no hardcoded color values

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 5, "tasks": ["7.2", "9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "12.1"] },
    { "id": 7, "tasks": ["11.1", "12.2"] },
    { "id": 8, "tasks": ["11.2", "12.3", "12.4"] },
    { "id": 9, "tasks": ["14.1"] },
    { "id": 10, "tasks": ["14.2", "14.3"] }
  ]
}
```
