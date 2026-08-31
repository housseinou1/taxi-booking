import { resolveActiveRideAction, shouldEnterTrackingStep } from './rideFlowUtils';

describe('rideFlowUtils', () => {
  it('keeps requested rides in searching until a driver is matched', () => {
    const ride = { id: 1, status: 'requested' };
    expect(shouldEnterTrackingStep(ride)).toBe(false);
    expect(resolveActiveRideAction(ride)).toEqual({
      type: 'RIDE_REQUESTED',
      payload: ride,
    });
  });

  it('enters tracking when driver identity is present on a requested ride', () => {
    const ride = { id: 2, status: 'requested', driver_name: 'Ahmed' };
    expect(
      shouldEnterTrackingStep(ride, { driverName: 'Ahmed', eta: 4 })
    ).toBe(true);
    expect(resolveActiveRideAction(ride, { driverName: 'Ahmed', eta: 4 }).type).toBe(
      'RIDE_ACCEPTED'
    );
  });

  it('enters tracking for accepted rides', () => {
    const ride = { id: 3, status: 'accepted' };
    expect(shouldEnterTrackingStep(ride)).toBe(true);
  });
});
