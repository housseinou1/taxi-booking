const STORAGE_KEY = "yala_rider_notification_dedup";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function loadStore() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveStore(store) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function buildNotificationEventKey({
  type = "",
  rideId = null,
  backendId = null,
  id = "",
  deliveryId = null,
} = {}) {
  if (backendId) return `history:${backendId}`;
  if (id) return `local:${id}`;
  const parts = [String(type || "event"), rideId || "", deliveryId || ""].filter(Boolean);
  return parts.join(":");
}

export function shouldShowRiderNotification(eventKey, ttlMs = DEFAULT_TTL_MS) {
  if (!eventKey) return true;

  const now = Date.now();
  const store = loadStore();
  const lastSeen = Number(store[eventKey] || 0);

  if (lastSeen && now - lastSeen < ttlMs) {
    return false;
  }

  store[eventKey] = now;
  Object.keys(store).forEach((key) => {
    if (now - Number(store[key]) > ttlMs * 4) {
      delete store[key];
    }
  });
  saveStore(store);
  return true;
}

export function clearRiderNotificationDedup() {
  sessionStorage.removeItem(STORAGE_KEY);
}
