import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/smart-engine`;

export async function fetchSmartEngineDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchCeoDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/ceo/${suffix}`);
  return response.data;
}

export async function updateEngineFlags(payload) {
  const response = await authenticatedApi.patch(`${BASE}/flags/`, payload);
  return response.data;
}

export async function updateDispatchRules(payload, cityId) {
  const params = cityId ? { city_id: cityId } : {};
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.patch(`${BASE}/dispatch-rules/${suffix}`, payload);
  return response.data;
}

export async function updatePricingRules(payload, cityId, rideType) {
  const params = {};
  if (cityId) params.city_id = cityId;
  if (rideType) params.ride_type = rideType;
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.patch(`${BASE}/pricing-rules/${suffix}`, payload);
  return response.data;
}

export async function updateSurgeConfig(payload) {
  const response = await authenticatedApi.patch(`${BASE}/surge/`, payload);
  return response.data;
}

export async function runPricingSimulation(payload) {
  const response = await authenticatedApi.post(`${BASE}/simulate/`, payload);
  return response.data;
}

export async function fetchDispatchAnalytics(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await authenticatedApi.get(`${BASE}/analytics/?${query}`);
  return response.data;
}

export async function fetchAuditTrail(limit = 50) {
  const response = await authenticatedApi.get(`${BASE}/audit/?limit=${limit}`);
  return response.data;
}
