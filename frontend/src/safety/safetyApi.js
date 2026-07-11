import { API_URL } from "../apiConfig";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access")}`,
  "Content-Type": "application/json",
});

async function safetyRequest(path, options = {}) {
  const response = await fetch(`${API_URL}/safety${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || "Safety request failed.");
  }
  return data;
}

export function fetchTrustedContacts() {
  return safetyRequest("/contacts/");
}

export function saveTrustedContact(payload) {
  return safetyRequest("/contacts/", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteTrustedContact(contactId) {
  return safetyRequest(`/contacts/${contactId}/`, { method: "DELETE" });
}

export function triggerSos(payload) {
  return safetyRequest("/sos/", { method: "POST", body: JSON.stringify(payload) });
}

export function createTripShare(rideId) {
  return safetyRequest("/trip-share/", {
    method: "POST",
    body: JSON.stringify({ ride_id: rideId }),
  });
}

export function sendMonitoringPing(payload) {
  return safetyRequest("/monitoring/ping/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchMonitoringStatus(rideId) {
  return safetyRequest(`/monitoring/status/?ride_id=${rideId}`);
}

export function respondToSafetyCheck(payload) {
  return safetyRequest("/monitoring/respond/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminActiveTrips() {
  return safetyRequest("/admin/active-trips/");
}

export function fetchAdminTripReplay(rideId) {
  return safetyRequest(`/admin/trip-replay/${rideId}/`);
}

export function fetchAdminResponseLog(incidentId) {
  const query = incidentId ? `?incident_id=${incidentId}` : "";
  return safetyRequest(`/admin/response-log/${query}`);
}

export const MAX_TRUSTED_CONTACTS = 5;
