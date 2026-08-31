import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const GROWTH = `${API_URL}/operations/customer-growth`;
const LAUNCH = `${API_URL}/operations/launch-growth`;

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
];

export const CHANNELS = [
  { value: "push", label: "Push" },
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "promo", label: "Promo" },
];

export const AUDIENCES = [
  { value: "all_riders", label: "All riders" },
  { value: "all_drivers", label: "All drivers" },
  { value: "all_couriers", label: "All couriers" },
  { value: "vip", label: "VIP customers" },
  { value: "city", label: "City segment" },
  { value: "custom", label: "Custom" },
];

export async function fetchMarketingDashboard(params = {}) {
  const [growth, launch] = await Promise.all([
    authenticatedApi.get(`${GROWTH}/`, { params }),
    authenticatedApi.get(`${LAUNCH}/`, { params }).catch(() => ({ data: null })),
  ]);
  return { growth: growth.data, launch: launch.data };
}

export async function fetchCampaigns(params = {}) {
  const response = await authenticatedApi.get(`${GROWTH}/campaigns/`, { params });
  return response.data;
}

export async function createCampaign(payload) {
  const response = await authenticatedApi.post(`${GROWTH}/campaigns/`, payload);
  return response.data;
}

export async function updateCampaign(id, payload) {
  const response = await authenticatedApi.patch(`${GROWTH}/campaigns/${id}/`, payload);
  return response.data;
}

export async function createPromo(payload) {
  const response = await authenticatedApi.post(`${GROWTH}/promos/`, payload);
  return response.data;
}
