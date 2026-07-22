/**
 * Shared WebSocket connection for real-time ride updates.
 * Uses native WebSocket (matches Django Channels backend).
 *
 * Usage:
 *   import { subscribeRideUpdates, sendRideUpdate } from "./socket";
 *   const unsub = subscribeRideUpdates((data) => { ... });
 *   // later: unsub();
 */
import { WS_URL, getWsCandidates } from "./apiConfig";

let ws = null;
let listeners = new Set();
let reconnectTimer = null;
let reconnectDelay = 1000;
let pendingMessages = [];
let joinedRideIds = new Set();
let wsCandidateIndex = 0;

function buildWsUrl(baseUrl) {
  const token = localStorage.getItem("access");
  const separator = baseUrl.includes("?") ? "&" : "?";
  return token ? `${baseUrl}${separator}token=${encodeURIComponent(token)}` : baseUrl;
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const candidates = getWsCandidates("rides");
  const baseUrl = candidates[wsCandidateIndex] || WS_URL;
  const wsUrl = buildWsUrl(baseUrl);

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000;
    wsCandidateIndex = 0;
    joinedRideIds.forEach((rideId) =>
      ws.send(JSON.stringify({ type: "join_ride", ride_id: rideId }))
    );
    pendingMessages.splice(0).forEach((message) => ws.send(JSON.stringify(message)));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach((fn) => {
        try { fn(data); } catch (e) { /* listener error */ }
      });
    } catch (e) { /* invalid JSON */ }
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = () => {
    const candidates = getWsCandidates("rides");
    if (wsCandidateIndex < candidates.length - 1) {
      wsCandidateIndex += 1;
    }
    if (ws) ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    connect();
  }, reconnectDelay);
}

/**
 * Subscribe to ride update messages.
 * Returns an unsubscribe function.
 */
export function subscribeRideUpdates(callback) {
  listeners.add(callback);
  connect(); // ensure connection is open
  return () => listeners.delete(callback);
}

/**
 * Broadcast a ride update to all connected clients.
 */
export function sendRideUpdate(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  pendingMessages.push(data);
  connect();
  return false;
}

export const joinRideUpdates = (rideId) => {
  if (!rideId) return false;
  joinedRideIds.add(rideId);
  connect();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join_ride", ride_id: rideId }));
    return true;
  }
  return false;
};

export const leaveRideUpdates = (rideId) => {
  if (!rideId) return false;
  joinedRideIds.delete(rideId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "leave_ride", ride_id: rideId }));
    return true;
  }
  return false;
};

export const sendDriverLocation = (rideId, latitude, longitude) => {
  if (!rideId || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return false;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingMessages = pendingMessages.filter(
      (message) => !(message.type === "location_update" && message.ride_id === rideId)
    );
  }

  return sendRideUpdate({
    type: "location_update",
    ride_id: rideId,
    lat: Number(latitude),
    lng: Number(longitude),
  });
};

export default {
  subscribeRideUpdates,
  sendRideUpdate,
  joinRideUpdates,
  leaveRideUpdates,
  sendDriverLocation,
};
