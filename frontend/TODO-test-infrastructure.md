# TODO: Fix Test Infrastructure for Rider Integration Tests

**Created:** 2026-08-07  
**Priority:** Medium  
**Affects:** `RiderHome.test.js` (6 tests), `RiderCancellation.test.js` (5 tests)

## Problem

The RiderHome integration tests and the new RiderCancellation end-to-end tests are
blocked by mock infrastructure issues that predate the cancellation fix. All 11 tests
fail with the same root causes.

## Blocking Dependencies

### 1. `useFareEstimates` / `estimateFare` Named Import

**File:** `frontend/src/rider/hooks/useFareEstimates.js`  
**Error:** `TypeError: (0 , _apiService.estimateFare) is not a function`

The `useFareEstimates` hook imports `estimateFare` as a named export:
```js
import { estimateFare } from '../services/apiService';
```

The current test mock uses `jest.mock('../services/apiService', () => ({ ... }))` but
the hook resolves the import at module load time before the mock factory can override it.

**Fix options:**
1. Add a dedicated module mock: `jest.mock('../hooks/useFareEstimates')` that returns
   a no-op or pre-resolved fare list.
2. Ensure `estimateFare` is exported as a named export in the apiService mock factory.
3. Create a `__mocks__/apiService.js` manual mock file that includes all named exports.

### 2. `joinRideGroup` WebSocket Mock

**File:** `frontend/src/rider/components/RiderHome.js` (line 405)  
**Error:** `TypeError: _wsService.default.joinRideGroup is not a function`

The `wsService` mock in `RiderHome.test.js` does not include `joinRideGroup` in the
mock factory. This function was added to the component after the test was written.

**Fix:**
Add to the wsService mock factory:
```js
jest.mock('../services/wsService', () => ({
  __esModule: true,
  default: {
    subscribeRideUpdates: (...args) => mockSubscribeRideUpdates(...args),
    subscribeDriverPosition: (...args) => mockSubscribeDriverPosition(...args),
    leaveRideGroup: jest.fn(),
    joinRideGroup: jest.fn(),  // ← add this
  },
  // ... same for named exports
}));
```

### 3. `cancelRide` Named Import in RideTracker

The `RideTracker` component imports `cancelRide` from `../services/apiService`:
```js
import { cancelRide } from '../services/apiService';
```

For integration tests that test the full cancellation flow through RideTracker, this
named import also needs to be included in the mock factory.

## Files to Update

1. `frontend/src/rider/components/RiderHome.test.js` — Add `joinRideGroup` to wsService mock, add `estimateFare` or mock `useFareEstimates` hook
2. `frontend/src/rider/components/RiderCancellation.test.js` — Same fixes, then remove `it.skip`

## Acceptance Criteria

- [ ] All 6 tests in `RiderHome.test.js` pass
- [ ] All 5 skipped tests in `RiderCancellation.test.js` pass (remove `it.skip`)
- [ ] No new test regressions
- [ ] `RideTracker.test.js` continues to pass (40/40)
