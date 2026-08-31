import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/bi`;

export async function fetchBiGrowthCenter(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/growth-center/${suffix}`);
  return response.data;
}

export async function exportBiGrowthReport(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  const response = await authenticatedApi.get(`${BASE}/reports/${reportType}/export/?${query}`, {
    responseType: "blob",
  });
  return response;
}

export { exportBiReport, fetchBiOverview } from "./biAnalyticsApi";
