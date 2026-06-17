/**
 * WebSocket subscription service for the rider app.
 *
 * Wraps the existing shared socket.js with typed subscription interfaces
 * for ride status updates and driver position tracking. Supports:
 * - Ride status updates (status_change, ride_update, ride_status_update)
 * - Driver location tracking (location_update) with ride-specific filtering
 * - Automatic reconnection with exponential backoff (1s → 10s max)
 * - Clean unsubscribe functions for component cleanup
 *
 * Usage:
 *   import wsService from './wsService';
 *
 *   // Subscribe to ride updates
 *   const unsub = wsService.subscribeRideUpdates((data) => { ... });
 *
 *   // Subscribe to driver position for a specific ride
 *   const unsubPos = wsService.subscribeDriverPosition(rideId, (pos) => { ... });
 *
 *   // Cleanup on unmount
 *   unsub();
 *   unsubPos();
 */

import { WS_URL } from "../../apiConfig";

// ─── Connection state ────────────────────────────────────────────────────────

let ws = null;
let listeners = new Set();
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;
const BACKOFF_FACTOR = 1.5;

// ─── Connection management ───────────────────────────────────────────────────

function connect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    // Reset backoff on successful connection
    reconnectDelay = 1000;
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          // Listener error — don't break other listeners
        }
      });
    } catch (e) {
      // Invalid JSON — silently ignore (per design doc error handling)
    }
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = () => {
    if (ws) ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * BACKOFF_FACTOR, MAX_RECONNECT_DELAY);
    connect();
  }, reconnectDelay);
}

/**
 * Send a JSON message through the WebSocket connection.
 * Used internally for join_ride/leave_ride protocol messages.
 */
function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Typed subscription interfaces ──────────────────────────────────────────

/**
 * Subscribe to ride status updates.
 *
 * Receives messages when a ride's status changes (e.g., accepted, driver_arriving,
 * in_progress, completed, cancelled). Also receives generic ride_update events
 * for backward compatibility with the shared rides group.
 *
 * Message types handled:
 * - { type: "ride_status_update", ride_id, status, ... }
 * - { type: "ride_update", ride_id, status, ... }
 * - Messages with a `status` or `ride_id` field (legacy format)
 *
 * @param {function} callback - Called with the full message data on each update
 * @returns {function} Unsubscribe function — call to stop receiving updates
 */
function subscribeRideUpdates(callback) {
  const handler = (data) => {
    // Filter to ride-relevant messages only
    const isRideUpdate =
      data.type === "ride_status_update" ||
      data.type === "ride_update" ||
      data.status !== undefined ||
      data.ride_id !== undefined;

    if (isRideUpdate) {
      callback(data);
    }
  };

  listeners.add(handler);
  connect();

  // Return unsubscribe function
  return () => {
    listeners.delete(handler);
  };
}

/**
 * Subscribe to driver position updates for a specific ride.
 *
 * Joins the ride-specific WebSocket group (via join_ride message) so the server
 * sends driver location updates for that ride. Filters incoming messages to only
 * pass through location updates matching the ride.
 *
 * The callback receives a [lat, lng] tuple on each position update.
 *
 * Message format from backend:
 * - { type: "location_update", driver_id, lat, lng }
 *
 * @param {number|string} rideId - The ride ID to track driver position for
 * @param {function} callback - Called with [lat, lng] array on each position update
 * @returns {function} Unsubscribe function — call to stop tracking and leave ride group
 */
function subscribeDriverPosition(rideId, callback) {
  const handler = (data) => {
    // Match driver location updates
    const matchesRide =
      data.ride_id == null || String(data.ride_id) === String(rideId);
    if (
      matchesRide &&
      (data.type === "location_update" || data.type === "driver_location") &&
      data.lat != null &&
      data.lng != null
    ) {
      callback([Number(data.lat), Number(data.lng)]);
    }
  };

  listeners.add(handler);
  connect();

  // Join the ride group so the server sends us driver location updates
  send({ type: "join_ride", ride_id: rideId });

  // Return unsubscribe function that also leaves the ride group
  return () => {
    listeners.delete(handler);
    send({ type: "leave_ride", ride_id: rideId });
  };
}

// ─── Initialize connection ───────────────────────────────────────────────────

connect();

// ─── Public API ──────────────────────────────────────────────────────────────

const wsService = {
  subscribeRideUpdates,
  subscribeDriverPosition,
};

export { subscribeRideUpdates, subscribeDriverPosition };
export default wsService;
