import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/partner-platform`;

export async function fetchPartnerPlatformDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchPartnerCeoDashboard() {
  const response = await authenticatedApi.get(`${BASE}/ceo/`);
  return response.data;
}

export async function fetchPartnerFinanceDashboard() {
  const response = await authenticatedApi.get(`${BASE}/finance/`);
  return response.data;
}

export async function fetchPartnerDetail(partnerId) {
  const response = await authenticatedApi.get(`${BASE}/partners/${partnerId}/`);
  return response.data;
}

export async function registerPartner(payload) {
  const response = await authenticatedApi.post(`${BASE}/register/`, payload);
  return response.data;
}

export async function partnerPlatformAction(partnerId, payload) {
  const response = await authenticatedApi.post(`${BASE}/partners/${partnerId}/action/`, payload);
  return response.data;
}

export async function assignPartnerTerritory(partnerId, payload) {
  const response = await authenticatedApi.post(`${BASE}/partners/${partnerId}/territories/`, payload);
  return response.data;
}

export async function generatePartnerSettlement(partnerId, periodType = "weekly") {
  const response = await authenticatedApi.post(`${BASE}/partners/${partnerId}/settlements/generate/`, {
    period_type: periodType,
  });
  return response.data;
}

export async function approvePartnerSettlement(settlementId) {
  const response = await authenticatedApi.post(`${BASE}/settlements/${settlementId}/approve/`);
  return response.data;
}
