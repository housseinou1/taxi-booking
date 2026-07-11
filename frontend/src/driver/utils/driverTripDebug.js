const TAG = "[driver-trip]";

/**
 * Structured debug logging for driver trip / GPS workflow.
 * Logs to console; keeps a rolling buffer on window.__YALA_DRIVER_TRIP_LOG__ for device QA.
 */
export function driverTripDebug(event, payload = {}) {
  if (typeof window === "undefined") return;

  const line = { event, ts: new Date().toISOString(), ...payload };
  console.warn(TAG, event, line);

  if (!window.__YALA_DRIVER_TRIP_LOG__) {
    window.__YALA_DRIVER_TRIP_LOG__ = [];
  }
  window.__YALA_DRIVER_TRIP_LOG__.push(line);
  if (window.__YALA_DRIVER_TRIP_LOG__.length > 200) {
    window.__YALA_DRIVER_TRIP_LOG__.shift();
  }
}

export function getDriverTripLog() {
  if (typeof window === "undefined") return [];
  return window.__YALA_DRIVER_TRIP_LOG__ || [];
}
