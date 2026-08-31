import axios from "axios";
import { API_URL } from "../../apiConfig";
import { clearAuthSession } from "../../auth/session";

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function fetchRiderProfile(token = localStorage.getItem("access")) {
  const response = await axios.get(`${API_URL}/auth/me/`, authHeaders(token));
  return response.data;
}

export async function updateRiderIdentity(formData, token = localStorage.getItem("access")) {
  const response = await axios.post(`${API_URL}/auth/identity/update/`, formData, {
    ...authHeaders(token),
    headers: {
      ...authHeaders(token).headers,
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function fetchActiveDeviceSessions(token = localStorage.getItem("access")) {
  const response = await axios.get(`${API_URL}/auth/devices/`, authHeaders(token));
  return Array.isArray(response.data) ? response.data : [];
}

export async function logoutAllDevices(token = localStorage.getItem("access")) {
  await axios.post(`${API_URL}/auth/logout-all-devices/`, {}, authHeaders(token));
  clearAuthSession();
}

export async function fetchSavedPaymentMethods(token = localStorage.getItem("access")) {
  const response = await axios.get(`${API_URL}/payments/methods/`, authHeaders(token));
  return Array.isArray(response.data) ? response.data : [];
}

export async function setDefaultPaymentMethod(method, token = localStorage.getItem("access")) {
  const payload = {
    payment_type: method.payment_type,
    is_default: true,
    card_holder_name: method.card_holder_name || "",
    card_type: method.card_type || "none",
    card_last4: method.card_last4 || "",
    expiry_month: method.expiry_month || "",
    expiry_year: method.expiry_year || "",
    bank_name: method.bank_name || "",
    account_reference: method.account_reference || "",
    phone_number: method.phone_number || "",
    wallet_id: method.wallet_id || "",
  };
  const response = await axios.post(`${API_URL}/payments/methods/save/`, payload, authHeaders(token));
  return response.data;
}

export function formatMemberSince(dateJoined) {
  if (!dateJoined) return "—";
  const date = new Date(dateJoined);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getVerificationLabel(user) {
  if (!user) return "Unknown";
  if (user.rider_status === "approved") return "Verified";
  if (user.phone_verified) return "Phone verified";
  if (user.rider_status === "rejected") return "Action required";
  return "Pending verification";
}
