import { DELIVERY_WS_URL } from "../apiConfig";

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let listeners = new Set();
let pendingMessages = [];
let joinedDeliveryChatIds = new Set();

function buildDeliveryWsUrl() {
  const token = localStorage.getItem("access");
  const separator = DELIVERY_WS_URL.includes("?") ? "&" : "?";
  return token ? `${DELIVERY_WS_URL}${separator}token=${encodeURIComponent(token)}` : DELIVERY_WS_URL;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    connectDeliverySocket();
  }, reconnectDelay);
}

function connectDeliverySocket() {
  if (!DELIVERY_WS_URL) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(buildDeliveryWsUrl());
  } catch (_) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000;
    joinedDeliveryChatIds.forEach((deliveryId) => {
      ws.send(JSON.stringify({ type: "join_delivery_chat", delivery_id: deliveryId }));
    });
    pendingMessages.splice(0).forEach((message) => ws.send(JSON.stringify(message)));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (_) {
          // One bad listener should not break delivery realtime updates.
        }
      });
    } catch (_) {
      // Ignore malformed websocket payloads.
    }
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = () => {
    if (ws) ws.close();
  };
}

export function subscribeDeliveryUpdates(callback) {
  listeners.add(callback);
  connectDeliverySocket();
  return () => listeners.delete(callback);
}

export function sendDeliverySocketMessage(data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  pendingMessages.push(data);
  connectDeliverySocket();
  return false;
}

export function joinDeliveryChat(deliveryId) {
  if (!deliveryId) return false;
  joinedDeliveryChatIds.add(deliveryId);
  connectDeliverySocket();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join_delivery_chat", delivery_id: deliveryId }));
    return true;
  }
  return false;
}

export function leaveDeliveryChat(deliveryId) {
  if (!deliveryId) return false;
  joinedDeliveryChatIds.delete(deliveryId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "leave_delivery_chat", delivery_id: deliveryId }));
    return true;
  }
  return false;
}

export function sendDeliveryChatTyping(deliveryId, isTyping = true) {
  if (!deliveryId) return false;
  return sendDeliverySocketMessage({
    type: "delivery_chat_typing",
    delivery_id: deliveryId,
    is_typing: Boolean(isTyping),
  });
}
