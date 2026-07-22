import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/beta/feedback`;

export function fetchBetaFeedbackList(params = {}) {
  return authenticatedApi.get(BASE + "/", { params });
}

export function fetchBetaFeedbackDashboard() {
  return authenticatedApi.get(`${BASE}/dashboard/`);
}

export function updateBetaFeedback(id, payload) {
  return authenticatedApi.patch(`${BASE}/${id}/`, payload);
}
