import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/multi-city`;

export async function fetchMultiCityDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchMultiCityList() {
  const response = await authenticatedApi.get(`${BASE}/cities/`);
  return response.data;
}

export async function updateMultiCityProfile(cityId, payload) {
  const response = await authenticatedApi.patch(`${BASE}/cities/${cityId}/`, payload);
  return response.data;
}

export async function exportMultiCityReport(exportFormat = "csv") {
  const response = await authenticatedApi.get(`${BASE}/export/?export_format=${exportFormat}`, {
    responseType: "blob",
  });
  return response;
}
