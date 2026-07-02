import { API_URL } from "../apiConfig";
import { apiRequest } from "../delivery/DeliveryShared";

const BASE = `${API_URL}/security`;

export async function getCustomerVerification() {
  return apiRequest(`${BASE}/customer/verification/`);
}

export async function uploadCustomerProfilePhoto(file) {
  const form = new FormData();
  form.append("profile_picture", file);
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${BASE}/customer/profile-photo/`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || "Upload failed");
  return data;
}

export async function listSavedAddresses() {
  return apiRequest(`${BASE}/customer/addresses/`);
}

export async function createSavedAddress(payload) {
  return apiRequest(`${BASE}/customer/addresses/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSavedAddress(id, payload) {
  return apiRequest(`${BASE}/customer/addresses/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSavedAddress(id) {
  return apiRequest(`${BASE}/customer/addresses/${id}/`, { method: "DELETE" });
}

export async function getDeliveryInstructionDefaults() {
  return apiRequest(`${BASE}/customer/delivery-defaults/`);
}

export async function saveDeliveryInstructionDefaults(payload) {
  return apiRequest(`${BASE}/customer/delivery-defaults/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getCourierVerification() {
  return apiRequest(`${BASE}/courier/verification/`);
}

export async function getMerchantVerification() {
  return apiRequest(`${BASE}/merchant/verification/`);
}

export async function triggerDeliverySos(deliveryId, payload = {}) {
  return apiRequest(`${API_URL}/safety/sos/`, {
    method: "POST",
    body: JSON.stringify({ delivery_id: deliveryId, ...payload }),
  });
}

export async function reportDeliveryProblem(deliveryId, payload) {
  return apiRequest(`${API_URL}/deliveries/${deliveryId}/report/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function confirmPickupByCustomer(deliveryId) {
  return apiRequest(`${API_URL}/deliveries/${deliveryId}/confirm-pickup/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Admin
export async function getAuditLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(`${BASE}/admin/audit-logs/${qs ? `?${qs}` : ""}`);
}

export async function getFraudFlags(all = false) {
  return apiRequest(`${BASE}/admin/fraud-flags/${all ? "?all=1" : ""}`);
}

export async function reviewFraudFlag(flagId, status, notes = "") {
  return apiRequest(`${BASE}/admin/fraud-flags/${flagId}/review/`, {
    method: "POST",
    body: JSON.stringify({ status, notes }),
  });
}

export async function getPendingCouriers(queue = "review") {
  const data = await apiRequest(`${BASE}/admin/couriers/?queue=${encodeURIComponent(queue)}`);
  return data.results || data;
}

export async function courierDocumentReview(documentId, action, reason = "") {
  const endpoint =
    action === "approve"
      ? `${API_URL}/admin/documents/${documentId}/approve/`
      : `${API_URL}/admin/documents/${documentId}/reject/`;
  return apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(action === "reject" ? { reason } : {}),
  });
}

export async function courierAdminAction(driverId, action, reason = "") {
  return apiRequest(`${BASE}/admin/couriers/${driverId}/action/`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

export async function getPendingMerchants() {
  return apiRequest(`${BASE}/admin/merchants/`);
}

export async function merchantDocumentReview(merchantId, document, status, notes = "") {
  return apiRequest(`${BASE}/admin/merchants/${merchantId}/documents/`, {
    method: "POST",
    body: JSON.stringify({ document, status, notes }),
  });
}

export async function merchantAdminAction(merchantId, action, reason = "") {
  return apiRequest(`${BASE}/admin/merchants/${merchantId}/action/`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}
