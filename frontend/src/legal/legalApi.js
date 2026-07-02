import { API_URL } from "../apiConfig";
import { apiRequest } from "../delivery/DeliveryShared";

const BASE = `${API_URL}/legal`;

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

export function acceptRiderLegal(payload) {
  return apiRequest(`${BASE}/ride/accept/`, {
    method: "POST",
    body: JSON.stringify({
      device_info: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 500),
      ...payload,
    }),
  });
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
