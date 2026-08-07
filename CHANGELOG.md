# Changelog

## [Unreleased]

### Fixed — Rider Cancellation Flow (2026-08-07)

**Bug:** After ride cancellation (by rider or driver), the "Ride cancelled" banner persisted
indefinitely, the route polyline remained visible on the map, and stale driver/ETA data
continued to display on the home screen.

**Resolution:**

- **3-second auto-dismiss banner:** Cancellation banners now auto-dismiss after 3 seconds
  for both rider-initiated and driver-initiated cancellations. No manual action required.

- **Complete rider state reset:** On cancellation, the following are all cleared:
  - `currentRide`, `driverPosition`, `animatedDriverPosition`
  - `routePath`, `routeInfo`, `liveDriverRoute`, `liveDriverRouteInfo`
  - `pickup`, `destination`, `stops`
  - `fare`, `discountedFare`, `promoCode`
  - `bookingStep` resets to `idle`

- **Driver cancellation handling via WebSocket:** When a driver cancels, the rider now sees
  "Your driver cancelled the ride" with a 3-second auto-dismiss, and all ride state is cleared.

- **Route/polyline cleanup:** The map polyline only renders when `routePath.length > 0`.
  Previously it fell back to drawing a line between pickup and destination even when no
  route was active.

- **New translation keys (en/fr/ar):**
  - `riderDashboard.cancel.driverCancelledTitle`
  - `riderDashboard.cancel.driverCancelledText`
  - `riderDashboard.timeline.findingDriverTitle`
  - `riderDashboard.timeline.findingDriverText`

### Fixed — Rider Trip Status Workflow (2026-08-07)

**Bug:** The progress stepper started at "Driver Arriving" immediately after requesting a ride,
before any driver had accepted. ETA and distance showed impossible values (2661 km, 4990 min).

**Resolution:**

- Added "Finding Driver" as the first step in the progress stepper:
  `Finding Driver → Driver Arriving → Arrived → In Progress → Completed`

- ETA and distance are only calculated after a driver has accepted (not during search phase).

- Maximum caps added: ETA ≤ 120 minutes, distance ≤ 200 km. Values beyond these are
  treated as data errors and not displayed.

- ETA/PIN section is hidden until a driver is assigned.

### Tests

- `RideTracker.test.js`: 40/40 passing (updated step indices for 5-step progress)
- `RiderCancellation.test.js`: 3/3 reducer unit tests passing, 5 integration tests
  skipped (blocked by pre-existing mock infrastructure — see TODO below)

---

## Known Issues / Test Infrastructure Debt

See `docs/TODO-test-infrastructure.md` for details on blocked integration tests.
