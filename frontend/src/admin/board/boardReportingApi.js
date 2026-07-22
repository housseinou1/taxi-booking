import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/board-reports`;

export async function fetchBoardReportingSuite(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchBoardExecutiveSummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/executive-summary/${suffix}`);
  return response.data;
}

export async function fetchBoardBusinessKpis(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/business-kpis/${suffix}`);
  return response.data;
}

export async function fetchBoardFinancialReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/financial/${suffix}`);
  return response.data;
}

export async function fetchBoardOperationalReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/operational/${suffix}`);
  return response.data;
}

export async function fetchBoardGrowthReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/growth/${suffix}`);
  return response.data;
}

export async function fetchBoardRiskDashboard() {
  const response = await authenticatedApi.get(`${BASE}/risk/`);
  return response.data;
}

export async function fetchBoardStrategicPlanning(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/strategic/${suffix}`);
  return response.data;
}

export function boardReportExportUrl(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  return `${BASE}/${reportType}/export/?${query}`;
}
