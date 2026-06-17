import { getStatusStepIndex, isCancellable } from './rideStatus';

describe('getStatusStepIndex', () => {
  it('returns 0 for requested', () => {
    expect(getStatusStepIndex('requested')).toBe(0);
  });

  it('returns 1 for pending', () => {
    expect(getStatusStepIndex('pending')).toBe(1);
  });

  it('returns 2 for accepted', () => {
    expect(getStatusStepIndex('accepted')).toBe(2);
  });

  it('returns 3 for driver_arriving', () => {
    expect(getStatusStepIndex('driver_arriving')).toBe(3);
  });

  it('returns 4 for driver_arrived', () => {
    expect(getStatusStepIndex('driver_arrived')).toBe(4);
  });

  it('returns 5 for in_progress', () => {
    expect(getStatusStepIndex('in_progress')).toBe(5);
  });

  it('returns 6 for completed', () => {
    expect(getStatusStepIndex('completed')).toBe(6);
  });

  it('returns 7 for cancelled', () => {
    expect(getStatusStepIndex('cancelled')).toBe(7);
  });

  it('returns -1 for unknown status', () => {
    expect(getStatusStepIndex('unknown')).toBe(-1);
  });

  it('returns deterministic index for each status', () => {
    const statuses = ['requested', 'pending', 'accepted', 'driver_arriving',
      'driver_arrived', 'in_progress', 'completed', 'cancelled'];
    statuses.forEach((status, i) => {
      expect(getStatusStepIndex(status)).toBe(i);
    });
  });
});

describe('isCancellable', () => {
  it('returns true for requested', () => {
    expect(isCancellable('requested')).toBe(true);
  });

  it('returns true for pending', () => {
    expect(isCancellable('pending')).toBe(true);
  });

  it('returns true for accepted', () => {
    expect(isCancellable('accepted')).toBe(true);
  });

  it('returns true for driver_arriving', () => {
    expect(isCancellable('driver_arriving')).toBe(true);
  });

  it('returns true for driver_arrived', () => {
    expect(isCancellable('driver_arrived')).toBe(true);
  });

  it('returns false for in_progress', () => {
    expect(isCancellable('in_progress')).toBe(false);
  });

  it('returns false for completed', () => {
    expect(isCancellable('completed')).toBe(false);
  });

  it('returns false for cancelled', () => {
    expect(isCancellable('cancelled')).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isCancellable('unknown')).toBe(false);
  });
});
