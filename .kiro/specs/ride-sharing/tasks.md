# Implementation Plan: Yala Share Ride

## Overview

This plan implements the Yala Share Ride feature following the existing Django REST Framework + Django Channels backend and React frontend architecture. The implementation extends the existing Ride model (which already has ride_type="Share") with new models for session management, matching, pricing, and route optimization. The existing WebSocket infrastructure (RideConsumer, channel layer) and DriverProfile model extensions from the premium-driver-app spec are leveraged.

## Tasks

- [ ] 1. Backend models and migrations
  - [ ] 1.1 Create ShareRideSession model and ShareSessionStop model
    - Create `backend/taxi/rides/models/share_session.py` with `ShareRideSession` model (status, driver FK, total_fare, platform_commission, driver_earnings, commission_rate, route_similarity_score, created_at, completed_at)
    - Create `ShareSessionStop` model (session FK, ride FK, stop_type, stop_order, location_name, latitude, longitude, eta_minutes, completed_at)
    - Add `SHARE_PASSENGER_STATUS_CHOICES` for per-passenger tracking
    - Add indexes: share_session_status_idx, share_session_driver_idx, share_session_created_idx, share_stop_order_idx
    - _Requirements: 3.3, 3.7, 5.1, 7.1_

  - [ ] 1.2 Extend existing Ride model with Share fields
    - Add `share_session` FK (nullable) to ShareRideSession with related_name='rides'
    - Add `economy_fare` DecimalField (nullable) for savings calculation
    - Add `seats` IntegerField (default=1) for seat count
    - Add `share_status` CharField for per-passenger status within a session
    - Register new fields in existing Ride serializers
    - _Requirements: 2.2, 2.6, 8.2_

  - [ ] 1.3 Generate and apply database migrations
    - Run `makemigrations` for the new models and Ride model extensions
    - Verify migration applies cleanly to the existing database
    - _Requirements: 1.1, 1.2_

- [ ] 2. Share Ride APIs
  - [ ] 2.1 Implement PricingEngine service
    - Create `backend/taxi/rides/services/pricing_engine.py`
    - Implement `calculate_share_fare(economy_fare, similarity_score, seats)` — 30-50% discount based on similarity, multiplied by seats, rounded to whole MRU
    - Implement `calculate_savings(economy_fare, share_fare)` — returns positive difference
    - Implement `calculate_driver_earnings(session)` — sum of fares minus commission
    - Implement `calculate_platform_commission(total_fares, rate)` — total × rate
    - Implement `recalculate_on_cancellation(session, cancelled_ride)` — update remaining fares
    - Implement `validate_driver_earnings_protection(session, economy_fare)` — ensure driver earns >= Economy equivalent
    - _Requirements: 1.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 2.2 Write property tests for PricingEngine
    - **Property 1: Share fare discount range and monotonicity**
    - **Property 3: Seat count multiplier**
    - **Property 13: Driver earnings protection**
    - **Property 14: Platform commission calculation**
    - **Property 15: Fare rounding to whole MRU**
    - **Property 16: Savings calculation correctness**
    - **Validates: Requirements 1.3, 2.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**

  - [ ] 2.3 Implement RideStatusService
    - Create `backend/taxi/rides/services/ride_status_service.py`
    - Define `SHARE_RIDE_STATUSES` list and `VALID_TRANSITIONS` map
    - Implement `transition(session, new_status)` — validate transition, update status, save
    - Implement `broadcast_status_update(session)` — send to all session participants via channel layer
    - Implement `notify_passenger(ride, message)` — targeted WebSocket notification
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.4 Write property tests for RideStatusService
    - **Property 6: Share ride state machine enforces valid transitions**
    - **Property 12: Session completes when all passengers dropped off**
    - **Validates: Requirements 5.1, 7.7**

  - [ ] 2.5 Implement Share Ride request and detail API views
    - Create `backend/taxi/rides/views/share_views.py`
    - Implement `POST /api/rides/share/request/` — validate service area, create Ride with ride_type="Share", trigger matching
    - Implement `GET /api/rides/share/{id}/` — return ride details with fare, savings, session info, stops, other passengers (first name only)
    - Implement `POST /api/rides/share/{id}/cancel/` — enforce cancellation rules by status, recalculate fares
    - Implement `POST /api/rides/share/{id}/rate/` — accept 1-5 stars + optional review (max 500 chars)
    - Create serializers for request/response payloads
    - Register URL routes
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3_

  - [ ]* 2.6 Write property tests for cancellation and validation
    - **Property 2: Service area validation accepts/rejects correctly**
    - **Property 18: Cancellation eligibility by ride state**
    - **Property 19: Session cancellation when last passenger leaves**
    - **Property 20: Text length validation (reviews)**
    - **Validates: Requirements 2.4, 2.5, 10.1, 10.2, 10.6, 10.5, 11.2**

  - [ ] 2.7 Implement Share Ride session API views (driver-facing)
    - Implement `POST /api/rides/share/session/{id}/accept/` — driver accepts session, transition to driver_assigned
    - Implement `POST /api/rides/share/session/{id}/pickup/` — confirm passenger pickup, advance stop
    - Implement `POST /api/rides/share/session/{id}/dropoff/` — confirm drop-off, advance stop
    - Implement `POST /api/rides/share/session/{id}/complete/` — complete session when all dropped off
    - Implement `GET /api/rides/share/session/{id}/stops/` — return optimized stop sequence
    - Register URL routes
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7_

  - [ ]* 2.8 Write property tests for session stop logic
    - **Property 10: Route optimizer produces pickups before drop-offs**
    - **Property 11: Passenger count in vehicle is correct**
    - **Property 22: Stop advancement on completion**
    - **Validates: Requirements 7.1, 7.6, 7.3**

- [ ] 3. Checkpoint - Backend core APIs
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Driver share-ride acceptance flow
  - [ ] 4.1 Implement RouteOptimizer service
    - Create `backend/taxi/rides/services/route_optimizer.py`
    - Implement `calculate_optimal_order(session)` — all pickups before drop-offs, ordered by proximity
    - Implement `recalculate_on_change(session)` — update stop order after passenger add/remove
    - Implement `calculate_eta_for_stops(driver_location, stops)` — ETA for each remaining stop
    - Create/update ShareSessionStop records with computed order
    - _Requirements: 7.1, 7.3, 7.4_

  - [ ] 4.2 Implement driver notification and session acceptance logic
    - Extend existing driver notification flow to send `share_ride_request` event with session details, stops, total_earnings, and 30s countdown
    - Handle driver acceptance: assign driver to session, transition status, notify all passengers with driver details
    - Handle driver rejection/timeout: re-queue session for next available driver
    - _Requirements: 5.3, 7.2, 7.5_

  - [ ]* 4.3 Write property test for driver assignment notification
    - **Property 7: Driver assignment notification contains all required fields**
    - **Validates: Requirements 5.3, 6.1**

- [ ] 5. Share Ride matching engine
  - [ ] 5.1 Implement MatchingService
    - Create `backend/taxi/rides/services/matching_service.py`
    - Implement `calculate_route_similarity(ride_a, ride_b)` — route overlap score 0.0-1.0
    - Implement `find_compatible_passengers(ride)` — search rides with score >= 0.6, pickup distance <= 1.5km, destination distance <= 2km
    - Implement `calculate_eta_impact(session, new_ride)` — verify <= 8 min impact on all existing passengers
    - Implement `create_session(rides)` — group matched rides into ShareRideSession
    - Implement `add_to_session(session, ride)` — add passenger if constraints met, max 3 passengers
    - Implement 120-second matching timeout with auto-proceed to driver assignment
    - Use Redis cache for active matching state
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 5.2 Write property tests for MatchingService
    - **Property 4: Matching compatibility enforces all constraints**
    - **Property 5: Session passenger limit invariant**
    - **Validates: Requirements 3.1, 3.2, 3.7, 3.8**

  - [ ] 5.3 Implement matching status API endpoint
    - Implement `GET /api/rides/share/{id}/matching-status/` — return current matching state and countdown
    - Register URL route
    - _Requirements: 3.4, 3.6_

- [ ] 6. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. WebSocket real-time updates
  - [ ] 7.1 Extend RideConsumer for Share session groups
    - Add `join_session` and `leave_session` handlers to existing RideConsumer
    - Add `session_{id}` channel group management
    - Implement session-level broadcast: share_matched, share_driver_assigned, share_status_update, share_passenger_added, share_passenger_removed, share_session_completed
    - Implement passenger-specific events: share_your_pickup, share_your_dropoff, share_fare_updated
    - Implement driver-specific events: share_ride_request, share_stops_updated
    - Reuse existing `location_update` and `chat_message` handlers
    - _Requirements: 4.2, 5.2, 5.3, 5.4, 5.5, 5.6, 7.5, 8.7, 12.2_

  - [ ] 7.2 Implement driver location broadcasting for Share sessions
    - Extend existing location_update handler to broadcast to session group
    - Ensure updates are sent at intervals no greater than 5 seconds
    - Include driver lat/lng in broadcast payload
    - _Requirements: 4.2_

- [ ] 8. Rider share booking UI (React frontend)
  - [ ] 8.1 Create ShareBookingFlow component
    - Create `frontend/src/components/share/ShareBookingFlow.js`
    - Implement step-by-step flow: location selection → ride type → review → confirm
    - Display Yala Share card with fare, savings percentage, additional travel time range, "up to 2 additional passengers" label
    - Implement seat selector (1 or 2 seats) with fare multiplier display
    - Validate pickup and destination within service area (show error if outside)
    - Apply dark theme (Dark Navy #0B1220 background), Green (#00A651) accents, Gold (#D4AF37) for savings
    - Apply smooth CSS transitions (200-400ms) for step changes
    - Mobile-first responsive design (320px-428px)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.4, 2.5, 2.6, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 8.2 Create ShareMatchingStatus component
    - Create `frontend/src/components/share/ShareMatchingStatus.js`
    - Display "Finding riders..." overlay with countdown timer (120s)
    - Show match notification when passenger is matched
    - Auto-dismiss on match or timeout
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ] 8.3 Create ShareRideScreen component
    - Create `frontend/src/components/share/ShareRideScreen.js`
    - Display driver card: photo, name, vehicle make/model, plate, rating
    - Display ride details: individual fare, savings, other passengers count, updated ETA
    - Display other passengers' first names
    - Implement Call Driver and Chat Driver buttons (visible only in driver_arriving/driver_arrived status)
    - Implement Emergency button (always visible, shares GPS within 5s)
    - Implement Share Trip button (shareable link)
    - Apply Yala branding and dark theme
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 13.1, 13.2, 13.3_

  - [ ]* 8.4 Write property tests for frontend Share components
    - **Property 8: Communication controls visibility by ride state**
    - **Property 9: Other passengers display first name only**
    - **Property 20: Text length validation (chat messages)**
    - **Property 21: WebSocket reconnection exponential backoff**
    - **Validates: Requirements 6.3, 6.4, 6.8, 12.1, 12.4, 12.5, 5.7**

  - [ ] 8.5 Create ShareRideMap component
    - Create `frontend/src/components/share/ShareRideMap.js`
    - Display interactive map with driver marker, passenger markers ("You" vs others), destination markers
    - Display route polyline connecting all stops in optimized order
    - Update driver location every 5 seconds via WebSocket
    - Remove markers on pickup/drop-off completion, update route line
    - Use distinct icons for driver, current passenger, other passengers, destinations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 8.6 Create ShareRideComplete component
    - Create `frontend/src/components/share/ShareRideComplete.js`
    - Display savings summary ("You saved X MRU by choosing Yala Share")
    - Display 1-5 star rating prompt
    - Allow optional text review (max 500 chars with character count)
    - Submit rating to API
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 8.7 Implement WebSocket reconnection with exponential backoff
    - Implement auto-reconnect on WebSocket disconnect: 1s → 2s → 4s → 8s → 16s max
    - After 30s of failed reconnection, show connection error banner with stale-data indicator
    - Display last known ride status during disconnection
    - _Requirements: 5.7, 5.8_

  - [ ] 8.8 Implement Share ride cancellation UI
    - Add cancel button visible in statuses: requested, matching, driver_assigned, driver_arriving
    - Show cancellation fee confirmation for driver_arriving status
    - Hide cancel button during in_progress status
    - Handle cancellation response and update UI
    - _Requirements: 10.1, 10.2, 10.6_

- [ ] 9. Checkpoint - Frontend booking and ride screens
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Fare splitting and dynamic pricing integration
  - [ ] 10.1 Wire PricingEngine into booking and completion flows
    - Call `calculate_share_fare` during ride request to set initial fare
    - Call `recalculate_on_cancellation` when a passenger cancels mid-session
    - Send `share_fare_updated` WebSocket event to affected passengers
    - Display updated fare with animation in frontend
    - Ensure all fares displayed in whole MRU (no decimals)
    - _Requirements: 8.1, 8.2, 8.6, 8.7_

  - [ ] 10.2 Implement driver earnings calculation on session completion
    - Calculate total_fare, platform_commission, and driver_earnings on session complete
    - Store values in ShareRideSession record
    - Display earnings summary to driver
    - Validate driver earnings protection (>= Economy equivalent)
    - _Requirements: 8.3, 8.4, 8.5_

- [ ] 11. Share Ride Admin Dashboard
  - [ ] 11.1 Implement admin analytics API endpoints
    - Create `backend/taxi/rides/views/share_admin_views.py`
    - Implement `GET /api/admin/share/analytics/` — aggregated metrics with date_from/date_to params
    - Compute: total rides, total savings, platform revenue, average occupancy, driver earnings, route efficiency
    - Implement `GET /api/admin/share/analytics/chart/` — Share vs Economy volume comparison data
    - Support date presets: today, this_week, this_month, custom
    - Register URL routes with admin permission
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 11.2 Write property test for admin analytics aggregation
    - **Property 17: Admin analytics date-range aggregation**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**

  - [ ] 11.3 Create ShareAdminDashboard React component
    - Create `frontend/src/components/admin/ShareAdminDashboard.js`
    - Display metrics cards: total rides, savings, revenue, occupancy, driver earnings, route efficiency
    - Implement date range filter with presets (today, this week, this month, custom)
    - Display Share vs Economy volume comparison chart
    - Apply Yala admin branding
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 12. Driver Share ride UI
  - [ ] 12.1 Create DriverShareView component
    - Create `frontend/src/components/driver/DriverShareView.js`
    - Display total session earnings, passenger count, ordered stop list
    - Show turn-by-turn navigation for current stop
    - Auto-advance to next stop on pickup/drop-off confirmation
    - Display passenger count indicator (currently in vehicle)
    - Show new passenger notification when added to active session
    - Display earnings summary on session completion
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 13. Checkpoint - Full feature integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Integration testing and production readiness
  - [ ]* 14.1 Write integration tests for full Share ride flow
    - Test complete flow: Request → Match → Assign → Pickup → Drop-off → Complete
    - Test concurrent matching with multiple simultaneous requests
    - Test cancellation mid-ride with fare recalculation propagation
    - Test WebSocket event delivery to all session participants
    - Test driver location broadcasting at 5-second intervals
    - _Requirements: 2.3, 3.3, 5.2, 7.3, 7.7, 8.7_

  - [ ]* 14.2 Write unit tests for edge cases
    - Test matching timeout (120s) proceeds with single passenger
    - Test session full (3 passengers) rejection
    - Test cancellation fee logic by status
    - Test rating submission (1-5 stars, optional review)
    - Test service area boundary validation
    - Test ETA impact exceeding 8 minutes rejection
    - _Requirements: 3.6, 3.7, 10.1, 10.2, 11.1, 2.4, 3.8_

  - [ ] 14.3 Performance and loading optimization
    - Ensure Share ride booking screen renders within 3 seconds on 3G (1 Mbps)
    - Optimize API response payloads (select only needed fields)
    - Add database query optimization (select_related, prefetch_related for session queries)
    - Verify WebSocket status updates delivered within 2 seconds
    - _Requirements: 13.6, 5.2_

- [ ] 15. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing Ride model already supports ride_type="Share" — we extend it with session FK and Share-specific fields
- The existing WebSocket infrastructure (RideConsumer, channel layer) is reused and extended for session groups
- The premium-driver-app spec provides DriverProfile extensions, WebSocket consumer enhancements, and ride workflow engine that this feature builds upon
- Backend uses Python with `hypothesis` for property-based tests
- Frontend uses JavaScript with `fast-check` for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.5", "2.7"] },
    { "id": 4, "tasks": ["2.6", "2.8", "4.1"] },
    { "id": 5, "tasks": ["4.2", "5.1"] },
    { "id": 6, "tasks": ["4.3", "5.2", "5.3"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.5", "8.6", "8.7", "8.8"] },
    { "id": 9, "tasks": ["8.3", "8.4"] },
    { "id": 10, "tasks": ["10.1", "10.2"] },
    { "id": 11, "tasks": ["11.1", "11.3", "12.1"] },
    { "id": 12, "tasks": ["11.2"] },
    { "id": 13, "tasks": ["14.1", "14.2", "14.3"] }
  ]
}
```
