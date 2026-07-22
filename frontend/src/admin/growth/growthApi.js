import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/growth`;

export async function fetchGrowthDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function exportGrowthReport(exportFormat = "csv") {
  const response = await authenticatedApi.get(`${BASE}/export/?export_format=${exportFormat}`, {
    responseType: "blob",
  });
  return response;
}
