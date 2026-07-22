import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/trust-safety`;

export async function fetchTrustSafetyDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchIncidentQueue(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await authenticatedApi.get(`${BASE}/incidents/?${query}`);
  return response.data;
}

export async function updateIncident(incidentId, payload) {
  const response = await authenticatedApi.patch(`${BASE}/incidents/${incidentId}/`, payload);
  return response.data;
}

export async function fetchMonitoringPanel(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/monitoring/${suffix}`);
  return response.data;
}

export async function runMonitoringScan(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.post(`${BASE}/monitoring/${suffix}`);
  return response.data;
}

export async function fetchDriverSafetyProfile(userId) {
  const response = await authenticatedApi.get(`${BASE}/drivers/${userId}/`);
  return response.data;
}

export async function fetchRiderSafetyProfile(userId) {
  const response = await authenticatedApi.get(`${BASE}/riders/${userId}/`);
  return response.data;
}

export async function fetchCeoSafetyDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/ceo/${suffix}`);
  return response.data;
}

export async function fetchSafetyReport(type = "kpi", params = {}) {
  const query = new URLSearchParams({ type, ...params }).toString();
  const response = await authenticatedApi.get(`${BASE}/reports/?${query}`);
  return response.data;
}

export async function fetchTrustSafetyAudit(limit = 50) {
  const response = await authenticatedApi.get(`${BASE}/audit/?limit=${limit}`);
  return response.data;
}
