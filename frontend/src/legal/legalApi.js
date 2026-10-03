import { API_URL } from "../apiConfig";
import { apiRequest } from "../delivery/DeliveryShared";
import authenticatedApi from "../auth/authenticatedApi";

const BASE = `${API_URL}/legal`;

/**
 * Normalize an axios/native-HTTP error into a plain Error whose `message`
 * carries the backend-provided detail. This preserves the real server error
 * for callers (e.g. rider Confirm Booking) instead of masking every failure
 * behind a generic connection-error string.
 */
function toLegalApiError(error) {
  const data = error?.response?.data;
  if (data) {
    const detailFromFields = Object.values(data)
      .flat()
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ");
    const message =
      data.detail ||
      data.error ||
      detailFromFields ||
      `Request failed (HTTP ${error.response.status}).`;
    return new Error(message);
  }
  if (error?.request) {
    return new Error("Network error — unable to reach server.");
  }
  return error instanceof Error ? error : new Error(String(error || "Request failed"));
}

export function fetchLegalVersions() {
  return apiRequest(`${BASE}/versions/`);
}

export function fetchLegalStatus() {
  return apiRequest(`${BASE}/status/`);
}

export function submitCourierESign(formData) {
  const token = localStorage.getItem("access");
  return fetch(`${BASE}/courier/e-sign/`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || "Could not submit signature.");
    return data;
  });
}

export function submitDriverESign(formData) {
  const token = localStorage.getItem("access");
  return fetch(`${BASE}/driver/e-sign/`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || "Could not submit signature.");
    return data;
  });
}

export function submitMerchantESign(formData) {
  const token = localStorage.getItem("access");
  return fetch(`${BASE}/merchant/e-sign/`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || "Could not submit signature.");
    return data;
  });
}

export function acceptCustomerLegal(payload) {
  return apiRequest(`${BASE}/customer/accept/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function acceptRiderLegal(payload) {
  // Use the native-HTTP-aware authenticated client (same path as rider ride
  // requests) so POST /legal/ride/accept/ works inside the Android Capacitor
  // WebView. authenticatedApi injects the Bearer token and handles 401 refresh.
  try {
    const response = await authenticatedApi.post(`${BASE}/ride/accept/`, {
      device_info: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 500),
      ...payload,
    });
    return response?.data;
  } catch (error) {
    throw toLegalApiError(error);
  }
}

export function acceptRideLegal(payload) {
  return acceptRiderLegal({
    ride_terms_accepted: true,
    privacy_accepted: true,
    device_info: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 500),
    ...payload,
  });
}

export function fetchComplianceLogs(type = "") {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  return apiRequest(`${BASE}/admin/logs/${query}`);
}

export function fetchSignedAgreements() {
  return apiRequest(`${BASE}/admin/agreements/`);
}
