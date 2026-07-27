export const DRIVER_NOTIFICATION_CATEGORIES = [
  { id: "all", label: "All", icon: "📬" },
  { id: "ride", label: "Ride Requests", icon: "🚕" },
  { id: "earnings", label: "Earnings", icon: "💰" },
  { id: "documents", label: "Documents", icon: "📄" },
  { id: "safety", label: "Safety", icon: "⚠" },
  { id: "announcements", label: "Announcements", icon: "📢" },
  { id: "promotions", label: "Promotions", icon: "🎁" },
  { id: "support", label: "Support", icon: "💬" },
];

const RIDE_TYPES = new Set([
  "ride_request",
  "ride_cancelled",
  "chat_message",
  "ride_request_expired",
]);

const EARNINGS_TYPES = new Set(["payment_completed", "weekly_summary", "driver_payout"]);

const DOCUMENT_TYPES = new Set([
  "document_status",
  "document_expiry_renewal_30d",
  "document_expiry_renewal_15d",
  "document_expiry_renewal_7d",
  "document_expiry_renewal_1d",
]);

const SAFETY_TYPES = new Set(["emergency_broadcast", "safety_alert", "sos"]);

const ANNOUNCEMENT_TYPES = new Set([
  "announcement",
  "platform_announcement",
  "executive_broadcast",
  "command_broadcast",
  "command_broadcast_nearby",
  "ops_broadcast",
  "fleet_ops_message",
  "maintenance_notice",
]);

const PROMOTION_TYPES = new Set([
  "promotion",
  "incentive",
  "bonus",
  "achievement_unlocked",
  "level_change",
]);

const SUPPORT_TYPES = new Set(["support_ticket_update", "support_reply"]);

export function getDriverNotificationCategory(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (!normalized) return "announcements";
  if (normalized.startsWith("document_expiry_renewal_")) return "documents";
  if (RIDE_TYPES.has(normalized)) return "ride";
  if (EARNINGS_TYPES.has(normalized)) return "earnings";
  if (DOCUMENT_TYPES.has(normalized)) return "documents";
  if (normalized === "driver_approved") return "documents";
  if (SAFETY_TYPES.has(normalized)) return "safety";
  if (ANNOUNCEMENT_TYPES.has(normalized)) return "announcements";
  if (PROMOTION_TYPES.has(normalized)) return "promotions";
  if (SUPPORT_TYPES.has(normalized)) return "support";
  return "announcements";
}

export function getDriverNotificationIcon(type = "") {
  const category = getDriverNotificationCategory(type);
  return DRIVER_NOTIFICATION_CATEGORIES.find((item) => item.id === category)?.icon || "📬";
}

export function getDriverNotificationDeepLink(item = {}) {
  if (item.url) return item.url;
  if (item.deep_link) return item.deep_link;
  const type = item.rawType || item.type || item.data?.type || "";
  const category = getDriverNotificationCategory(type);
  switch (category) {
    case "ride":
      return "/driver";
    case "earnings":
      return "/driver/earnings";
    case "documents":
      return "/driver/documents";
    case "support":
      return "/driver/support";
    case "promotions":
      return "/driver/earnings";
    case "safety":
      return "/driver/support";
    default:
      return "/driver";
  }
}
