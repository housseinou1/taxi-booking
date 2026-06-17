import * as fc from 'fast-check';
import { computeNextState, getNextStateUp, getNextStateDown } from './BottomSheet';

/**
 * Property 7: Bottom sheet state machine transitions
 *
 * For any current bottom sheet state (collapsed, half, full), a swipe-up gesture
 * SHALL transition to the next higher state (collapsed→half, half→full, full→full),
 * and a swipe-down gesture SHALL transition to the next lower state
 * (full→half, half→collapsed, collapsed→collapsed). The resulting state SHALL
 * always be one of the three valid states.
 *
 * Validates: Requirements 11.1, 11.2, 11.3
 */

const VALID_STATES = ['collapsed', 'half', 'full'];
const DIRECTIONS = ['up', 'down'];

const stateArb = fc.constantFrom(...VALID_STATES);
const directionArb = fc.constantFrom(...DIRECTIONS);

describe('Feature: rider-app-ui-refresh, Property 7: Bottom sheet state machine transitions', () => {
  it('swipe-up transitions to next higher state (collapsed→half, half→full, full→full)', () => {
    fc.assert(
      fc.property(stateArb, (currentState) => {
        const nextState = getNextStateUp(currentState);

        if (currentState === 'collapsed') {
          expect(nextState).toBe('half');
        } else if (currentState === 'half') {
          expect(nextState).toBe('full');
        } else if (currentState === 'full') {
          expect(nextState).toBe('full');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('swipe-down transitions to next lower state (full→half, half→collapsed, collapsed→collapsed)', () => {
    fc.assert(
      fc.property(stateArb, (currentState) => {
        const nextState = getNextStateDown(currentState);

        if (currentState === 'full') {
          expect(nextState).toBe('half');
        } else if (currentState === 'half') {
          expect(nextState).toBe('collapsed');
        } else if (currentState === 'collapsed') {
          expect(nextState).toBe('collapsed');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('computeNextState with direction "up" matches getNextStateUp', () => {
    fc.assert(
      fc.property(stateArb, (currentState) => {
        expect(computeNextState(currentState, 'up')).toBe(getNextStateUp(currentState));
      }),
      { numRuns: 100 }
    );
  });

  it('computeNextState with direction "down" matches getNextStateDown', () => {
    fc.assert(
      fc.property(stateArb, (currentState) => {
        expect(computeNextState(currentState, 'down')).toBe(getNextStateDown(currentState));
      }),
      { numRuns: 100 }
    );
  });

  it('result is always one of the three valid states for any state + direction combination', () => {
    fc.assert(
      fc.property(stateArb, directionArb, (currentState, direction) => {
        const nextState = computeNextState(currentState, direction);
        expect(VALID_STATES).toContain(nextState);
      }),
      { numRuns: 100 }
    );
  });

  it('applying random sequences of gestures always produces a valid state', () => {
    const gestureSequenceArb = fc.array(directionArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(stateArb, gestureSequenceArb, (initialState, gestures) => {
        let currentState = initialState;

        for (const direction of gestures) {
          currentState = computeNextState(currentState, direction);
          expect(VALID_STATES).toContain(currentState);
        }
      }),
      { numRuns: 100 }
    );
  });
});
