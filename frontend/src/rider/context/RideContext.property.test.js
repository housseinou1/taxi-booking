import * as fc from 'fast-check';
import { rideReducer, initialState } from './RideContext';
import { getStatusStepIndex, isCancellable } from '../utils/rideStatus';

/**
 * Property-Based Tests for RideContext and Ride Status Utilities
 *
 * Feature: rider-app-ui-refresh
 */

// -- Arbitraries --

/** Arbitrary location object */
const locationArb = fc.record({
  label: fc.string({ minLength: 1, maxLength: 50 }),
  position: fc.tuple(
    fc.double({ min: 14, max: 22, noNaN: true }),
    fc.double({ min: -18, max: -5, noNaN: true })
  ),
  city: fc.constantFrom('Nouakchott', 'Nouadhibou', 'Rosso', 'Atar', 'Kiffa'),
});

/** Arbitrary ADD_STOP action */
const addStopActionArb = locationArb.map((loc) => ({
  type: 'ADD_STOP',
  payload: loc,
}));

/** All valid ride statuses */
const ALL_STATUSES = [
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
];

/** Cancellable statuses set */
const CANCELLABLE_SET = new Set([
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
]);

/** Arbitrary valid ride status */
const rideStatusArb = fc.constantFrom(...ALL_STATUSES);

// -- Property 2: Stops constraint invariant --

describe('Property 2: Stops constraint invariant', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any sequence of ADD_STOP actions applied to the booking state,
   * the stops array length SHALL never exceed 3, and any attempt to add
   * a 4th stop SHALL be rejected without modifying the existing stops.
   */
  it('stops array length never exceeds 3 regardless of input sequence', () => {
    fc.assert(
      fc.property(
        fc.array(addStopActionArb, { minLength: 1, maxLength: 50 }),
        (actions) => {
          let state = initialState;

          for (const action of actions) {
            const prevState = state;
            state = rideReducer(state, action);

            // Invariant: stops never exceeds 3
            expect(state.stops.length).toBeLessThanOrEqual(3);

            // If we were already at 3, state should be unchanged (rejected)
            if (prevState.stops.length >= 3) {
              expect(state).toBe(prevState);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding a 4th stop returns the same state reference (rejection)', () => {
    fc.assert(
      fc.property(
        fc.tuple(locationArb, locationArb, locationArb, locationArb),
        ([stop1, stop2, stop3, stop4]) => {
          let state = initialState;
          state = rideReducer(state, { type: 'ADD_STOP', payload: stop1 });
          state = rideReducer(state, { type: 'ADD_STOP', payload: stop2 });
          state = rideReducer(state, { type: 'ADD_STOP', payload: stop3 });

          expect(state.stops.length).toBe(3);

          const stateBeforeReject = state;
          const stateAfterReject = rideReducer(state, { type: 'ADD_STOP', payload: stop4 });

          // The 4th stop is rejected — state unchanged
          expect(stateAfterReject).toBe(stateBeforeReject);
          expect(stateAfterReject.stops.length).toBe(3);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 6: Ride status to UI state mapping --

describe('Property 6: Ride status to UI state mapping', () => {
  /**
   * **Validates: Requirements 5.4, 6.1**
   *
   * For any ride status value, getStatusStepIndex(status) SHALL return a
   * deterministic step index, AND the cancel button SHALL be visible if and
   * only if the status is in the set {requested, pending, accepted,
   * driver_arriving, driver_arrived}.
   */
  it('getStatusStepIndex returns a deterministic index for all valid statuses', () => {
    fc.assert(
      fc.property(rideStatusArb, (status) => {
        const index1 = getStatusStepIndex(status);
        const index2 = getStatusStepIndex(status);

        // Deterministic: same input always produces same output
        expect(index1).toBe(index2);

        // Index is a valid non-negative number for known statuses
        expect(typeof index1).toBe('number');
        expect(index1).toBeGreaterThanOrEqual(0);
        expect(index1).toBeLessThan(ALL_STATUSES.length);
      }),
      { numRuns: 100 }
    );
  });

  it('getStatusStepIndex returns -1 for unknown statuses', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !ALL_STATUSES.includes(s)),
        (unknownStatus) => {
          const index = getStatusStepIndex(unknownStatus);
          expect(index).toBe(-1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cancel button visibility matches the cancellable status set', () => {
    fc.assert(
      fc.property(rideStatusArb, (status) => {
        const cancellable = isCancellable(status);

        if (CANCELLABLE_SET.has(status)) {
          // Status is in the cancellable set — button SHOULD be visible
          expect(cancellable).toBe(true);
        } else {
          // Status is NOT in the cancellable set — button SHOULD be hidden
          expect(cancellable).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('isCancellable returns false for unknown/invalid statuses', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !ALL_STATUSES.includes(s)),
        (unknownStatus) => {
          expect(isCancellable(unknownStatus)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each valid status maps to a unique step index', () => {
    // This is an example-based check that validates the mapping is injective
    const indices = ALL_STATUSES.map(getStatusStepIndex);
    const uniqueIndices = new Set(indices);
    expect(uniqueIndices.size).toBe(ALL_STATUSES.length);
  });
});
