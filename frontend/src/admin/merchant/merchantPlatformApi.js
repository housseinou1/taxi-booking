import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/merchant-platform`;

export async function fetchMerchantPlatformDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchMerchantCeoDashboard() {
  const response = await authenticatedApi.get(`${BASE}/ceo/`);
  return response.data;
}

export async function fetchMerchantFinanceDashboard() {
  const response = await authenticatedApi.get(`${BASE}/finance/`);
  return response.data;
}

export async function merchantPlatformAction(merchantId, payload) {
  const response = await authenticatedApi.post(`${BASE}/merchants/${merchantId}/action/`, payload);
  return response.data;
}

export async function updateMerchantCommission(merchantId, commissionRate) {
  const response = await authenticatedApi.patch(`${BASE}/merchants/${merchantId}/commission/`, {
    commission_rate: commissionRate,
  });
  return response.data;
}

export async function generateMerchantSettlement(merchantId) {
  const response = await authenticatedApi.post(`${BASE}/merchants/${merchantId}/settlements/generate/`);
  return response.data;
}

export async function approveMerchantSettlement(settlementId) {
  const response = await authenticatedApi.post(`${BASE}/settlements/${settlementId}/approve/`);
  return response.data;
}
