export const RIDER_NOTIFICATION_CATEGORIES = [
  { id: "all", label: "All", icon: "📬" },
  { id: "ride", label: "Ride updates", icon: "🚕" },
  { id: "arrival", label: "Driver arrival", icon: "📍" },
  { id: "trip", label: "Trip updates", icon: "🛣️" },
  { id: "payments", label: "Payments", icon: "💳" },
  { id: "refunds", label: "Refunds", icon: "↩️" },
  { id: "promotions", label: "Promotions", icon: "🎁" },
  { id: "safety", label: "Safety", icon: "⚠️" },
  { id: "support", label: "Support", icon: "💬" },
  { id: "announcements", label: "Announcements", icon: "📢" },
];

const RIDE_TYPES = new Set([
  "ride_request",
  "ride_accepted",
  "ride_cancelled",
  "ride_request_received",
]);

const ARRIVAL_TYPES = new Set(["driver_arriving", "driver_arrived"]);

const TRIP_TYPES = new Set(["ride_started", "ride_start", "ride_completed", "ride_status"]);

const PAYMENT_TYPES = new Set([
  "payment_successful",
  "payment_completed",
  "payment_pending",
  "receipt_ready",
  "payment_failed",
]);

const REFUND_TYPES = new Set(["refund_status", "refund_approved", "refund_rejected", "refund_requested"]);

const PROMOTION_TYPES = new Set(["promotion", "incentive", "bonus", "offer"]);

const SAFETY_TYPES = new Set([
  "emergency_broadcast",
  "safety_alert",
  "sos",
  "safety_notice",
]);

const ANNOUNCEMENT_TYPES = new Set([
  "announcement",
  "platform_announcement",
  "executive_broadcast",
  "command_broadcast",
  "command_broadcast_nearby",
  "ops_broadcast",
  "maintenance_notice",
  "service_interruption",
  "policy_change",
]);

const SUPPORT_TYPES = new Set(["support_ticket_update", "support_reply", "support_ticket"]);

const REQUIRED_TYPES = new Set([
  ...RIDE_TYPES,
  ...ARRIVAL_TYPES,
  ...TRIP_TYPES,
  ...PAYMENT_TYPES,
  ...REFUND_TYPES,
  ...SAFETY_TYPES,
  "chat_message",
]);

export function getRiderNotificationCategory(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (!normalized) return "announcements";
  if (RIDE_TYPES.has(normalized)) return "ride";
  if (ARRIVAL_TYPES.has(normalized)) return "arrival";
  if (TRIP_TYPES.has(normalized)) return "trip";
  if (PAYMENT_TYPES.has(normalized)) return "payments";
  if (REFUND_TYPES.has(normalized)) return "refunds";
  if (PROMOTION_TYPES.has(normalized)) return "promotions";
  if (SAFETY_TYPES.has(normalized)) return "safety";
  if (SUPPORT_TYPES.has(normalized)) return "support";
  if (ANNOUNCEMENT_TYPES.has(normalized)) return "announcements";
  if (normalized.includes("delivery")) return "trip";
  if (normalized.includes("payment")) return "payments";
  if (normalized.includes("refund")) return "refunds";
  if (normalized.includes("support")) return "support";
  if (normalized.includes("promo") || normalized.includes("offer")) return "promotions";
  if (normalized.includes("safety") || normalized.includes("emergency")) return "safety";
  return "ride";
}

export function getRiderNotificationIcon(type = "") {
  const category = getRiderNotificationCategory(type);
  return RIDER_NOTIFICATION_CATEGORIES.find((item) => item.id === category)?.icon || "📬";
}

export function getRiderNotificationPriority(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (SAFETY_TYPES.has(normalized) || normalized.includes("emergency")) return "high";
  if (ARRIVAL_TYPES.has(normalized) || normalized === "ride_accepted") return "high";
  if (PAYMENT_TYPES.has(normalized) || REFUND_TYPES.has(normalized)) return "medium";
  if (PROMOTION_TYPES.has(normalized)) return "low";
  return "normal";
}

export function isRequiredRiderNotificationType(type = "") {
  return REQUIRED_TYPES.has(String(type || "").toLowerCase());
}

export function getRiderNotificationCategoryLabel(categoryId) {
  return RIDER_NOTIFICATION_CATEGORIES.find((item) => item.id === categoryId)?.label || categoryId;
}
