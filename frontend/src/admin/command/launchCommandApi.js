import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/command`;

export async function fetchCommandDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function exportCeoSummary(exportFormat = "csv") {
  const response = await authenticatedApi.get(`${BASE}/ceo/export/?export_format=${exportFormat}`, {
    responseType: "blob",
  });
  return response;
}

export async function postCommandBroadcast(payload) {
  const response = await authenticatedApi.post(`${BASE}/broadcast/`, payload);
  return response.data;
}

export async function postCommandNotify(payload) {
  const response = await authenticatedApi.post(`${BASE}/notify/`, payload);
  return response.data;
}

export async function postOnboardingPause(payload) {
  const response = await authenticatedApi.post(`${BASE}/onboarding/pause/`, payload);
  return response.data;
}

export async function createCommandIncident(payload) {
  const response = await authenticatedApi.post(`${BASE}/incidents/`, payload);
  return response.data;
}

export async function postCommandIncidentAction(incidentId, payload) {
  const response = await authenticatedApi.post(`${BASE}/incidents/${incidentId}/action/`, payload);
  return response.data;
}

export async function postCommandAlertAction(alertId, action = "ack") {
  const response = await authenticatedApi.post(`${BASE}/alerts/${alertId}/action/`, { action });
  return response.data;
}
