import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/bi`;

export async function fetchBiOverview(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchBiSubjectAreas(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/subject-areas/${suffix}`);
  return response.data;
}

export async function fetchBiSubjectArea(area, params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/subject-areas/${area}/${suffix}`);
  return response.data;
}

export async function fetchBiExecutiveAnalytics(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/executive-analytics/${suffix}`);
  return response.data;
}

export async function fetchBiGeographicIntelligence(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/geographic-intelligence/${suffix}`);
  return response.data;
}

export async function fetchBiPredictiveAnalytics(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/predictive-analytics/${suffix}`);
  return response.data;
}

export async function exportBiReport(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  const response = await authenticatedApi.get(`${BASE}/reports/${reportType}/export/?${query}`, {
    responseType: "blob",
  });
  return response;
}

export function biReportExportUrl(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  return `${BASE}/reports/${reportType}/export/?${query}`;
}
