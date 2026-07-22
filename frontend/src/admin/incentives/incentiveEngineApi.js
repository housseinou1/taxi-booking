import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/incentive-engine`;

export async function fetchIncentiveEngineDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchIncentiveCampaigns(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await authenticatedApi.get(`${BASE}/campaigns/?${query}`);
  return response.data;
}

export async function createIncentiveCampaign(payload) {
  const response = await authenticatedApi.post(`${BASE}/campaigns/`, payload);
  return response.data;
}

export async function updateIncentiveCampaign(campaignId, payload) {
  const response = await authenticatedApi.patch(`${BASE}/campaigns/${campaignId}/`, payload);
  return response.data;
}

export async function fetchIncentiveOpsDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/ops/${suffix}`);
  return response.data;
}

export async function fetchIncentiveCeoDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/ceo/${suffix}`);
  return response.data;
}

export async function fetchIncentiveFinanceDashboard() {
  const response = await authenticatedApi.get(`${BASE}/finance/`);
  return response.data;
}

export async function payoutAction(paymentId, payload) {
  const response = await authenticatedApi.post(`${BASE}/payouts/${paymentId}/action/`, payload);
  return response.data;
}

export function bonusExportUrl(days = 30) {
  return `${BASE}/export/?days=${days}`;
}
