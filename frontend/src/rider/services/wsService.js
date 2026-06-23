/**
 * WebSocket subscription service for the rider app.
 *
 * Wraps the shared socket.js with typed subscription interfaces
 * for ride status updates and driver position tracking.
 */

import { WS_URL } from "../../apiConfig";

let ws = null;
let listeners = new Set();
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;
const BACKOFF_FACTOR = 1.5;
const joinedRideIds = new Set();

function buildWsUrl() {
  const token = typeof window !== "undefined" ? localStorage.getItem("access") : null;
  if (!token) {
    return WS_URL;
  }
  const separator = WS_URL.includes("?") ? "&" : "?";
  return `${WS_URL}${separator}token=${encodeURIComponent(token)}`;
}

function connect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    ws = new WebSocket(buildWsUrl());
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000;
    joinedRideIds.forEach((rideId) => {
      ws.send(JSON.stringify({ type: "join_ride", ride_id: rideId }));
    });
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
      // Invalid JSON — silently ignore
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

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function joinRideGroup(rideId) {
  if (!rideId) return;
  joinedRideIds.add(String(rideId));
  send({ type: "join_ride", ride_id: rideId });
}

function leaveRideGroup(rideId) {
  if (!rideId) return;
  joinedRideIds.delete(String(rideId));
  send({ type: "leave_ride", ride_id: rideId });
}

function subscribeRideUpdates(callback) {
  const handler = (data) => {
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

  return () => {
    listeners.delete(handler);
  };
}

function subscribeDriverPosition(rideId, callback) {
  const handler = (data) => {
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
  joinRideGroup(rideId);

  return () => {
    listeners.delete(handler);
    leaveRideGroup(rideId);
  };
}

connect();

const wsService = {
  subscribeRideUpdates,
  subscribeDriverPosition,
  joinRideGroup,
  leaveRideGroup,
};

export { subscribeRideUpdates, subscribeDriverPosition, joinRideGroup, leaveRideGroup };
export default wsService;
