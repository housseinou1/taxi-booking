# Implementation Plan: Airport Pickup & Drop-off

## Overview

This plan implements the Airport Pickup & Drop-off feature for the Yala platform. It creates a new `airport` Django app with zone-based flat-rate pricing, a FIFO driver queue at NKC airport, and real-time WebSocket notifications. The approach is incremental: models and migrations first, then the service layer, API endpoints, WebSocket integration, and finally admin CRUD — with property-based tests woven throughout.

## Tasks

- [ ] 1. Create airport app with data models and migrations
  - [ ] 1.1 Create the `airport` Django app and core models
    - Create `backend/taxi/airport/` app with `__init__.py`, `apps.py`, `admin.py`, `urls.py`
    - Implement `AirportZone` model: `name` (CharField, unique), `fare` (DecimalField), `is_active` (BooleanField, default=True), `created_at`, `updated_at`
    - Implement `AirportDriverQueue` model: `driver` (OneToOneField to AUTH_USER_MODEL), `joined_at` (DateTimeField, auto_now_add=True)
    - Define constants: `NKC_LATITUDE = 18.3107`, `NKC_LONGITUDE = -15.9697`, `NKC_QUEUE_RADIUS_KM = 3.0`
    - Add indexes: `airport_zone_active_idx` on (is_active, name), `airport_queue_fifo_idx` on (joined_at)
    - Register models in `admin.py`
    - _Requirements: 3.1, 3.2, 3.5, 4.1_

  - [ ] 1.2 Extend the existing Ride model with Airport ride type
    - Add `"Airport"` to `RIDE_TYPES` choices in `backend/taxi/taxi/rides/models/ride.py`
    - Add `airport_zone` ForeignKey (nullable) from Ride to `airport.AirportZone`
    - Generate and apply migrations for both apps
    - _Requirements: 1.1_

- [ ] 2. Implement airport service layer
  - [ ] 2.1 Implement AirportPricingService
    - Create `backend/taxi/airport/services.py`
    - Implement `calculate_fare(zone)` returning (fare, app_fee, driver_earning) with 30% commission
    - Implement `get_fare_estimate(zone_id)` returning fare breakdown dict or None for inactive/missing zones
    - Define `COMMISSION_RATE = Decimal("0.30")`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.2 Write property test for commission split correctness (Property 4)
    - **Property 4: Commission split correctness**
    - Use `hypothesis` to generate random Decimal fare amounts (0.01–100000) and verify `app_fee + driver_earning == fare` and `app_fee == round(fare * 0.30, 2)`
    - **Validates: Requirements 2.3**

  - [ ]* 2.3 Write property test for flat-rate fare equals zone fare (Property 3)
    - **Property 3: Flat-rate fare equals zone fare**
    - Use `hypothesis` to generate zones with random fares and verify the ride fare always equals the zone's configured fare
    - **Validates: Requirements 2.1, 2.2**

  - [ ] 2.4 Implement AirportQueueService - queue management
    - Implement `haversine_km(lat1, lng1, lat2, lng2)` for distance calculation
    - Implement `is_within_airport_radius(lat, lng)` checking distance ≤ NKC_QUEUE_RADIUS_KM
    - Implement `can_join_queue(driver_user)` checking: not already in queue, no active ride, within radius
    - Implement `join_queue(driver_user)` with atomic transaction, returns (success, message, position)
    - Implement `get_queue_position(driver_user)` returning position and total
    - _Requirements: 4.1, 5.1, 5.2, 5.3_

  - [ ] 2.5 Implement AirportQueueService - dispatch and removal
    - Implement `dispatch_next_driver()` with select_for_update, removes and returns front driver (FIFO)
    - Implement `return_to_front(driver_user)` placing driver at position 1 after cancellation
    - Implement `remove_from_queue(driver_user)` for voluntary leave or geofence exit
    - _Requirements: 4.2, 4.3, 4.4, 6.5_

  - [ ]* 2.6 Write property test for FIFO queue ordering (Property 8)
    - **Property 8: FIFO queue ordering and dispatch**
    - Use `hypothesis` to generate random driver join sequences and verify dispatched driver always has earliest `joined_at`
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ]* 2.7 Write property test for queue position accuracy (Property 9)
    - **Property 9: Queue position accuracy**
    - Use `hypothesis` to generate queue states and verify reported position = count(earlier joined_at) + 1, total = queue size
    - **Validates: Requirements 4.5**

  - [ ]* 2.8 Write property test for geofence eligibility (Property 10)
    - **Property 10: Geofence queue eligibility**
    - Use `hypothesis` to generate random coordinates and verify admission iff haversine distance ≤ NKC_QUEUE_RADIUS_KM
    - **Validates: Requirements 4.4, 5.3**

  - [ ]* 2.9 Write property test for no duplicate queue entries (Property 11)
    - **Property 11: No duplicate queue entries**
    - Use `hypothesis` to generate drivers already in queue and verify re-join is rejected, queue unchanged
    - **Validates: Requirements 5.1**

  - [ ]* 2.10 Write property test for active ride prevents queue join (Property 12)
    - **Property 12: Active ride prevents queue join**
    - Use `hypothesis` to generate drivers with rides in various active statuses and verify queue join is rejected
    - **Validates: Requirements 5.2**

- [ ] 3. Checkpoint - Models and services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement airport ride API endpoints
  - [ ] 4.1 Create airport serializers
    - Create `backend/taxi/airport/serializers.py`
    - Implement `AirportZoneSerializer` (admin, full fields), `AirportZoneListSerializer` (rider, id/name/fare only)
    - Implement `FareEstimateSerializer` (zone_name, fare, app_fee, driver_earning, currency)
    - Implement `AirportRideRequestSerializer` (zone_id, direction choices: to_airport/from_airport, optional pickup fields)
    - Implement `QueueStatusSerializer` (position, total, joined_at)
    - _Requirements: 1.3, 2.2, 4.5_

  - [ ] 4.2 Implement rider-facing API endpoints
    - Create `backend/taxi/airport/views.py` and wire URLs in `urls.py`
    - `GET /airport/zones/` — list active zones (rider auth)
    - `GET /airport/fare-estimate/{zone_id}/` — fare breakdown (rider auth)
    - `POST /airport/rides/` — create airport ride, validate direction/zone, dispatch driver from queue
    - `POST /airport/rides/{id}/cancel/` — cancel ride, return driver to queue front if assigned
    - Enforce NKC as one endpoint based on direction field
    - Return "no drivers available" with `available: false` when queue is empty
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 2.4, 4.6, 6.5, 8.1, 8.2_

  - [ ]* 4.3 Write property test for airport ride endpoint constraint (Property 1)
    - **Property 1: Airport ride endpoint constraint**
    - Use `hypothesis` to generate ride requests with various direction/zone combos and verify one endpoint is always NKC
    - **Validates: Requirements 1.2, 1.4**

  - [ ]* 4.4 Write property test for unconfigured zone rejection (Property 5)
    - **Property 5: Unconfigured zone rejection**
    - Use `hypothesis` to generate zone_ids that don't exist or are inactive and verify booking is rejected
    - **Validates: Requirements 2.4**

  - [ ] 4.5 Implement driver-facing API endpoints
    - `POST /airport/queue/join/` — join queue (driver auth, eligibility checks)
    - `DELETE /airport/queue/leave/` — leave queue voluntarily
    - `GET /airport/queue/status/` — get current position and total
    - `POST /airport/rides/{id}/accept/` — accept assigned ride, transition to driver_arriving
    - `POST /airport/rides/{id}/arrive/` — mark arrival at pickup, transition to driver_arrived
    - `POST /airport/rides/{id}/start/` — start ride, transition to in_progress
    - `POST /airport/rides/{id}/complete/` — complete ride, record completed_at
    - Enforce valid state transitions for each action
    - _Requirements: 4.1, 4.3, 4.5, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 4.6 Write property test for ride state machine validity (Property 13)
    - **Property 13: Airport ride state machine validity**
    - Use `hypothesis` to generate (current_status, attempted_transition) pairs and verify only valid transitions succeed per the state machine
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 4.7 Write property test for cancellation restores driver to front (Property 14)
    - **Property 14: Cancellation restores driver to queue front**
    - Use `hypothesis` to generate queues with drivers, cancel assigned ride, and verify the cancelled driver is now at position 1
    - **Validates: Requirements 6.5**

- [ ] 5. Implement admin zone management API
  - [ ] 5.1 Implement admin CRUD endpoints for Airport Zones
    - `GET /airport/admin/zones/` — list all zones including inactive (admin auth)
    - `POST /airport/admin/zones/` — create zone, validate unique name and required fields
    - `PUT /airport/admin/zones/{id}/` — update zone fare or status
    - `DELETE /airport/admin/zones/{id}/` — delete zone
    - New fare applies to subsequent bookings only
    - Deactivated zones excluded from rider-facing zone list
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Write property test for active zones availability (Property 2)
    - **Property 2: Active zones availability**
    - Use `hypothesis` to generate sets of zones with random active/inactive states and verify rider list contains exactly the active ones
    - **Validates: Requirements 1.3, 3.4**

  - [ ]* 5.3 Write property test for zone name uniqueness (Property 7)
    - **Property 7: Zone name uniqueness**
    - Use `hypothesis` to generate duplicate zone names (case-insensitive) and verify second creation is rejected
    - **Validates: Requirements 3.5**

  - [ ]* 5.4 Write property test for zone validation completeness (Property 6)
    - **Property 6: Zone validation completeness**
    - Use `hypothesis` to generate partial zone data with missing fields and verify rejection
    - **Validates: Requirements 3.2**

- [ ] 6. Checkpoint - API endpoints complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement WebSocket notifications and real-time updates
  - [ ] 7.1 Add airport queue WebSocket events to RideConsumer
    - Add `airport_queue_update` event type to existing RideConsumer, broadcasting to `driver_{id}` group
    - Add `airport_ride_request` event type sent to the dispatched driver's group
    - Trigger queue position broadcasts to all remaining drivers after each dispatch or queue change
    - _Requirements: 7.1, 7.2_

  - [ ] 7.2 Add airport ride status WebSocket events
    - Use existing `ride_status_update` event type for airport ride status changes (driver_arriving, driver_arrived, in_progress, completed)
    - Broadcast to `ride_{id}` group so rider receives real-time status
    - Include driver name and location in status update payload
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 7.3 Implement Celery periodic task for geofence queue cleanup
    - Create a Celery beat task that checks queued drivers' current locations
    - Remove drivers who have left the NKC airport radius
    - Send WebSocket notification to removed drivers
    - Handle shift-end removal: check queued drivers with expired shifts, remove and notify
    - _Requirements: 4.4, 5.4_

- [ ] 8. Integration and wiring
  - [ ] 8.1 Wire airport app into Django project configuration
    - Add `airport` to `INSTALLED_APPS` in settings
    - Include `airport.urls` in the project's root URL configuration
    - Register Celery periodic task in beat schedule
    - Verify all migrations apply cleanly
    - _Requirements: 1.1, 8.1_

  - [ ]* 8.2 Write integration tests for end-to-end airport ride flow
    - Test: rider books airport ride → driver dispatched from queue → status transitions → completion
    - Test: rider cancels after assignment → driver returned to queue front
    - Test: admin deactivates zone → zone excluded from rider list immediately
    - Test: empty queue → rider gets "no drivers available" response
    - _Requirements: 1.2, 2.1, 4.2, 4.6, 6.1, 6.5_

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using Python's `hypothesis` library
- Unit tests validate specific examples and edge cases
- Backend uses Python (Django REST + Django Channels) with `hypothesis` for property tests
- MVP scope is limited to NKC airport only (Requirement 8)
- The existing Ride model status flow is reused; no new status values are introduced
- WebSocket infrastructure from existing RideConsumer is extended, not replaced

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.4"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.5"] },
    { "id": 4, "tasks": ["2.6", "2.7", "2.8", "2.9", "2.10", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.5", "5.1"] },
    { "id": 6, "tasks": ["4.3", "4.4", "4.6", "4.7", "5.2", "5.3", "5.4"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2"] }
  ]
}
```
