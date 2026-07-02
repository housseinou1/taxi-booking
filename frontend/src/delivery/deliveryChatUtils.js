export const DELIVERY_CHAT_ACTIVE_STATUSES = new Set([
  "accepted",
  "courier_arriving",
  "picked_up",
  "in_transit",
  "delivering",
]);

export const DELIVERY_CHAT_CLOSED_STATUSES = new Set([
  "delivered",
  "cancelled",
  "delivery_exception",
]);

export const COURIER_QUICK_REPLIES = [
  "I'm on my way",
  "I arrived",
  "Please come outside",
  "I need your PIN",
  "I cannot find your location",
];

export const CUSTOMER_QUICK_REPLIES = [
  "I'm coming",
  "Wait 2 minutes",
  "Use side entrance",
  "I sent the PIN",
  "Call me",
];

export const CHAT_REPORT_REASONS = [
  { key: "harassment", label: "Harassment" },
  { key: "inappropriate_message", label: "Inappropriate message" },
  { key: "wrong_address", label: "Wrong address" },
  { key: "unsafe_situation", label: "Unsafe situation" },
  { key: "fraud_attempt", label: "Fraud attempt" },
];

export function isDeliveryChatAvailable(status) {
  return DELIVERY_CHAT_ACTIVE_STATUSES.has(status);
}

export function quickRepliesForRole(role) {
  return role === "courier" ? COURIER_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;
}

export function formatChatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
