import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/support`;

export const QUEUE_TABS = ["open", "assigned", "waiting", "resolved", "closed"];
export const STATUS_OPTIONS = QUEUE_TABS;
export const SEVERITY_OPTIONS = ["P0", "P1", "P2", "P3"];
export const APP_OPTIONS = ["rider", "driver", "delivery"];

export { RIDER_REPORT_OPTIONS, DRIVER_REPORT_OPTIONS, DELIVERY_REPORT_OPTIONS } from "../../support/supportCategories";

export function fetchSupportList(params = {}) {
  return authenticatedApi.get(`${BASE}/`, { params });
}

export function fetchSupportDashboard() {
  return authenticatedApi.get(`${BASE}/dashboard/`);
}

export function updateSupportTicket(id, payload) {
  return authenticatedApi.patch(`${BASE}/${id}/`, payload);
}

// Backward-compatible aliases
export const fetchBetaFeedbackList = fetchSupportList;
export const fetchBetaFeedbackDashboard = fetchSupportDashboard;
export const updateBetaFeedback = updateSupportTicket;
