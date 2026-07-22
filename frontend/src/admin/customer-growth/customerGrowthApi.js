import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/customer-growth`;

export async function fetchCustomerGrowthDashboard() {
  const response = await authenticatedApi.get(`${BASE}/`);
  return response.data;
}

export async function fetchCustomerGrowthCeo() {
  const response = await authenticatedApi.get(`${BASE}/ceo/`);
  return response.data;
}

export async function fetchCustomerGrowthFinance() {
  const response = await authenticatedApi.get(`${BASE}/finance/`);
  return response.data;
}

export async function updateCustomerGrowthFlags(flags) {
  const response = await authenticatedApi.patch(`${BASE}/flags/`, flags);
  return response.data;
}

export async function createGrowthPromo(payload) {
  const response = await authenticatedApi.post(`${BASE}/promos/`, payload);
  return response.data;
}

export async function createGrowthCampaign(payload) {
  const response = await authenticatedApi.post(`${BASE}/campaigns/`, payload);
  return response.data;
}
