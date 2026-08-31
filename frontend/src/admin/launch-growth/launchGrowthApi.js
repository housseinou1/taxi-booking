import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/launch-growth`;

export const PARTNERSHIP_CATEGORIES = [
  { id: "hotel", label: "Hotel" },
  { id: "airport", label: "Airport" },
  { id: "restaurant", label: "Restaurant" },
  { id: "shopping_center", label: "Shopping Center" },
  { id: "university", label: "University" },
  { id: "business", label: "Business" },
];

export async function fetchLaunchGrowthCenter(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchScalingReadiness(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/scaling/${suffix}`);
  return response.data;
}

export async function savePartnership(payload) {
  const response = await authenticatedApi.post(`${BASE}/partnerships/`, payload);
  return response.data;
}

export async function createLaunchPromo(payload) {
  const response = await authenticatedApi.post(`${BASE}/promos/`, payload);
  return response.data;
}

export async function createLaunchCampaign(payload) {
  const response = await authenticatedApi.post(`${BASE}/campaigns/`, payload);
  return response.data;
}
