import { isDriverAssignedToRide } from '../components/RideTracker';

export const PRE_ASSIGNMENT_STATUSES = new Set(['requested', 'pending']);

/**
 * Whether the rider should see live driver tracking (vs. driver search UI).
 */
export function shouldEnterTrackingStep(ride, extras = {}) {
  if (!ride) return false;
  if (ride.status === 'cancelled' || ride.status === 'completed') return false;
  return isDriverAssignedToRide(ride, extras);
}

/**
 * Pick the reducer action for an active ride refresh.
 */
export function resolveActiveRideAction(ride, extras = {}) {
  if (!ride) return null;
  if (shouldEnterTrackingStep(ride, extras)) {
    return { type: 'RIDE_ACCEPTED', payload: ride };
  }
  if (PRE_ASSIGNMENT_STATUSES.has(ride.status)) {
    return { type: 'RIDE_REQUESTED', payload: ride };
  }
  return { type: 'RIDE_ACCEPTED', payload: ride };
}
