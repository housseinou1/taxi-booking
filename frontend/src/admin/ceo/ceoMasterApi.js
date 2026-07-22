import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/ceo-master`;

export async function fetchCeoMasterDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterOverview(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/overview/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterFinance(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/finance/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterOperations(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/operations/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterGrowth(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/growth/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterFleet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/fleet/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterAiInsights(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/ai-insights/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterReadiness() {
  const response = await authenticatedApi.get(`${BASE}/readiness/`);
  return response.data;
}

export async function postCeoBroadcast(payload) {
  const response = await authenticatedApi.post(`${BASE}/actions/broadcast/`, payload);
  return response.data;
}

export async function postCeoFreeze(payload) {
  const response = await authenticatedApi.post(`${BASE}/actions/freeze/`, payload);
  return response.data;
}

export async function postCeoApprovePayout(payload) {
  const response = await authenticatedApi.post(`${BASE}/actions/approve-payout/`, payload);
  return response.data;
}

export async function postCeoApproveOnboarding(payload) {
  const response = await authenticatedApi.post(`${BASE}/actions/approve-onboarding/`, payload);
  return response.data;
}

export async function postCeoApproveIncentive(payload) {
  const response = await authenticatedApi.post(`${BASE}/actions/approve-incentive/`, payload);
  return response.data;
}

export function ceoMasterReportUrl(reportType, params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  return `${BASE}/reports/${reportType}/export/${suffix}`;
}
