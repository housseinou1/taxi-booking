/**
 * Valid ride statuses in order of progression.
 */
const STATUS_STEPS = [
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
];

/**
 * Set of statuses where cancellation is allowed.
 */
const CANCELLABLE_STATUSES = new Set([
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
]);

/**
 * Get the step index for a given ride status.
 * Used to determine progress indicator position.
 *
 * @param {string} status - The ride status
 * @returns {number} The step index (0-based), or -1 if status is unknown
 */
export function getStatusStepIndex(status) {
  const index = STATUS_STEPS.indexOf(status);
  return index;
}

/**
 * Check if a ride with the given status can be cancelled.
 * Returns true only for: requested, pending, accepted, driver_arriving, driver_arrived.
 *
 * @param {string} status - The ride status
 * @returns {boolean} True if the ride is cancellable
 */
export function isCancellable(status) {
  return CANCELLABLE_STATUSES.has(status);
}

const EDITABLE_STOP_STATUSES = new Set([
  'requested',
  'accepted',
  'driver_arriving',
  'driver_arrived',
]);

/**
 * Riders can add or remove stops until the trip is in progress.
 */
export function canEditStops(status) {
  return EDITABLE_STOP_STATUSES.has(status);
}
