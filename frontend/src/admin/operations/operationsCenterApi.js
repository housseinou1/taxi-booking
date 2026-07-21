import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

export async function fetchOperationsCenter(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(
    `${API_URL}/operations/center/dashboard${suffix}`
  );
  return response.data;
}

export async function fetchOperationsFleet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(
    `${API_URL}/operations/center/fleet${suffix}`
  );
  return response.data;
}

export async function postForceAssign(rideId, driverId) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/rides/${rideId}/force-assign/`,
    { driver_id: driverId }
  );
  return response.data;
}

export async function postReassignRide(rideId, driverId = null) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/rides/${rideId}/reassign/`,
    driverId ? { driver_id: driverId } : {}
  );
  return response.data;
}

export async function postCancelRide(rideId, reason = "ops_center_cancel") {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/rides/${rideId}/cancel/`,
    { reason }
  );
  return response.data;
}

export async function postReassignDelivery(deliveryId, driverId = null) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/deliveries/${deliveryId}/reassign/`,
    driverId ? { driver_id: driverId } : {}
  );
  return response.data;
}

export async function postCancelDelivery(deliveryId, reason = "ops_center_cancel") {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/deliveries/${deliveryId}/cancel/`,
    { reason }
  );
  return response.data;
}

export async function postPauseDriver(driverId, paused = true) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/drivers/${driverId}/pause/`,
    { paused }
  );
  return response.data;
}

export async function postIncidentAction(incidentId, action, payload = {}) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/incidents/${incidentId}/action/`,
    { action, ...payload }
  );
  return response.data;
}

export async function postBroadcastNearby(payload) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/center/broadcast-nearby/`,
    payload
  );
  return response.data;
}

export async function exportIncidentReport(incidentId) {
  const response = await authenticatedApi.get(
    `${API_URL}/operations/center/incidents/${incidentId}/export/`,
    { responseType: "blob" }
  );
  return response;
}
