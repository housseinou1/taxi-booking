/**
 * Shared WebSocket connection for real-time ride updates.
 * Uses native WebSocket (matches Django Channels backend).
 *
 * Usage:
 *   import { subscribeRideUpdates, sendRideUpdate } from "./socket";
 *   const unsub = subscribeRideUpdates((data) => { ... });
 *   // later: unsub();
 */
import { WS_URL } from "./apiConfig";

let ws = null;
let listeners = new Set();
let reconnectTimer = null;
let reconnectDelay = 1000;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000; // reset backoff on success
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
  }
}

// Start connection immediately
connect();

export default { subscribeRideUpdates, sendRideUpdate };
