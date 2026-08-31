const STORAGE_KEY = "yala_rider_notification_prefs";

export const REQUIRED_NOTIFICATION_PREF_KEYS = [
  { id: "ride_updates", label: "Ride & trip updates", required: true },
  { id: "safety_alerts", label: "Safety alerts", required: true },
  { id: "payments_required", label: "Payment & refund status", required: true },
];

export const OPTIONAL_NOTIFICATION_PREF_KEYS = [
  { id: "promotions", label: "Promotions & offers", required: false },
  { id: "announcements", label: "Marketing announcements", required: false },
  { id: "receipts", label: "Email receipts", required: false },
  { id: "sms", label: "SMS updates", required: false },
];

export const NOTIFICATION_PREF_KEYS = [
  ...REQUIRED_NOTIFICATION_PREF_KEYS,
  ...OPTIONAL_NOTIFICATION_PREF_KEYS,
];

const DEFAULT_PREFS = {
  ride_updates: true,
  safety_alerts: true,
  payments_required: true,
  promotions: true,
  receipts: true,
  announcements: true,
  email: true,
  sms: true,
};

const CATEGORY_PREF_MAP = {
  ride: "ride_updates",
  arrival: "ride_updates",
  trip: "ride_updates",
  payments: "payments_required",
  refunds: "payments_required",
  safety: "safety_alerts",
  promotions: "promotions",
  announcements: "announcements",
  support: "ride_updates",
};

export function loadNotificationPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_PREFS, ...parsed };
  } catch (error) {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNotificationPrefs(prefs) {
  const next = { ...DEFAULT_PREFS, ...prefs };
  REQUIRED_NOTIFICATION_PREF_KEYS.forEach((item) => {
    next[item.id] = true;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function toggleNotificationPref(id, value) {
  const current = loadNotificationPrefs();
  if (REQUIRED_NOTIFICATION_PREF_KEYS.some((item) => item.id === id)) {
    return current;
  }
  const next = { ...current, [id]: value };
  saveNotificationPrefs(next);
  return next;
}

export function isMasterNotificationsEnabled() {
  return localStorage.getItem("sx_notifications") !== "off";
}

export function shouldDeliverRiderNotification(categoryOrType = "", notificationType = "") {
  if (!isMasterNotificationsEnabled()) {
    return false;
  }

  const prefs = loadNotificationPrefs();
  const category = String(categoryOrType || "").toLowerCase();
  const type = String(notificationType || "").toLowerCase();

  if (type.includes("safety") || type.includes("emergency") || type === "sos") {
    return true;
  }
  if (
    type.includes("ride") ||
    type.includes("driver") ||
    type.includes("trip") ||
    type === "chat_message"
  ) {
    return prefs.ride_updates !== false;
  }
  if (type.includes("payment") || type.includes("refund") || type.includes("receipt")) {
    return prefs.payments_required !== false;
  }
  if (type.includes("promo") || type.includes("offer") || type.includes("bonus")) {
    return prefs.promotions !== false;
  }
  if (type.includes("announcement") || type.includes("maintenance")) {
    return prefs.announcements !== false;
  }

  const prefKey = CATEGORY_PREF_MAP[category];
  if (!prefKey) return true;
  if (REQUIRED_NOTIFICATION_PREF_KEYS.some((item) => item.id === prefKey)) {
    return true;
  }
  return prefs[prefKey] !== false;
}

export function isRequiredNotificationPref(id) {
  return REQUIRED_NOTIFICATION_PREF_KEYS.some((item) => item.id === id);
}
