import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/center`;

function withQuery(path, params = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  const query = new URLSearchParams(cleaned).toString();
  return query ? `${path}?${query}` : path;
}

export async function fetchOpsDashboard(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/dashboard/`, params));
  return response.data;
}

export async function fetchOpsTrips(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/trips/`, params));
  return response.data;
}

export async function fetchOpsFleet(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/fleet/`, params));
  return response.data;
}

export async function fetchOpsMap(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/map/`, params));
  return response.data;
}

export async function fetchOpsAlerts(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/alerts/`, params));
  return response.data;
}

export async function fetchOpsHandovers(params = {}) {
  const response = await authenticatedApi.get(withQuery(`${BASE}/handovers/`, params));
  return response.data;
}

export async function postOpsHandover(payload) {
  const response = await authenticatedApi.post(`${BASE}/handovers/`, payload);
  return response.data;
}

export async function postOpsHandoverAcknowledge(id, payload = {}) {
  const response = await authenticatedApi.post(`${BASE}/handovers/${id}/acknowledge/`, payload);
  return response.data;
}

export {
  postForceAssign,
  postReassignRide,
  postCancelRide,
  postPauseDriver,
  postIncidentAction,
  postBroadcastNearby,
  exportIncidentReport,
} from "./operationsCenterApi";
