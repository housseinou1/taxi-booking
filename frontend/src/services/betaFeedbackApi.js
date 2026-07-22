import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { getAppType, getPlatform } from "../native/platform";

const ENDPOINT = `${API_URL}/operations/support/`;

const TOPIC_CATEGORY_MAP = {
  ride: "ride",
  payment: "payment",
  lost: "other",
  contact: "contact",
  delivery: "delivery",
  driver: "driver",
  gps: "gps",
  bug: "bug",
  suggestion: "suggestion",
  emergency: "emergency",
};

export function mapUrgencyToSeverity(urgency) {
  if (urgency === "critical" || urgency === "emergency") return "P0";
  if (urgency === "high") return "P1";
  if (urgency === "low") return "P3";
  return "P2";
}

function buildDeviceLabel() {
  const platform = getPlatform();
  const agent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return `${platform} ${agent}`.trim().slice(0, 200);
}

function getAppVersion() {
  if (typeof window !== "undefined" && window.__YALA_APP_VERSION__) {
    return window.__YALA_APP_VERSION__;
  }
  return process.env.REACT_APP_BUILD_VERSION || "unknown";
}

export async function submitBetaFeedback({
  category = "other",
  severity = "P2",
  subject = "",
  description,
  screenshot = null,
  appType = null,
  isEmergency = false,
  metadata = null,
  ride_id = null,
  delivery_id = null,
  payment_method = null,
  phone = null,
}) {
  const token = localStorage.getItem("access");
  if (!token || token === "null" || token === "undefined") {
    return null;
  }

  const form = new FormData();
  form.append("category", category);
  form.append("severity", severity);
  form.append("description", description);
  form.append("app_type", appType || getAppType() || "rider");
  form.append("device", buildDeviceLabel());
  form.append("app_version", getAppVersion());
  if (subject) form.append("subject", subject);
  if (isEmergency) form.append("is_emergency", "true");
  if (metadata && typeof metadata === "object") {
    form.append("metadata", JSON.stringify(metadata));
  }
  if (ride_id) form.append("ride_id", ride_id);
  if (delivery_id) form.append("delivery_id", delivery_id);
  if (payment_method) form.append("payment_method", payment_method);
  if (phone) form.append("phone", phone);
  if (screenshot) {
    form.append("screenshot", screenshot);
  }

  const response = await authenticatedApi.post(ENDPOINT, form);
  return response.data;
}

export function mapSupportTopicToCategory(topic) {
  return TOPIC_CATEGORY_MAP[topic] || "other";
}

export function hasBetaFeedbackAuth() {
  const token = localStorage.getItem("access");
  return Boolean(token && token !== "null" && token !== "undefined");
}
