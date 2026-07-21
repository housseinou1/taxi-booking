import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

export async function fetchAIDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${API_URL}/operations/ai/dashboard${suffix}`);
  return response.data;
}

export async function fetchHotspotMap(period = "hour") {
  const response = await authenticatedApi.get(
    `${API_URL}/operations/ai/hotspots/?period=${period}`
  );
  return response.data;
}

export async function postRecommendationAction(recommendationId, action) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/ai/recommendations/${recommendationId}/action/`,
    { action }
  );
  return response.data;
}

export async function refreshRecommendations() {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/ai/recommendations/refresh/`,
    {}
  );
  return response.data;
}
