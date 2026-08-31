import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/ceo-master`;

export async function fetchCeoMasterDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}${suffix}`);
  return response.data;
}

export async function fetchCeoMasterOverview(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/overview/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterFinance(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/finance/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterOperations(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/operations/${suffix}`);
  return response.data;
}

export async function fetchCeoMasterGrowth(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/growth/${suffix}`);
  return response.data;
}

export async function fetchExecutiveMap(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${API_URL}/operations/executive/map/${suffix}`);
  return response.data;
}

export async function fetchProductionHealth() {
  const response = await authenticatedApi.get(`${API_URL}/api/health/status/`);
  return response.data;
}

export {
  ceoMasterReportUrl,
  postCeoApproveOnboarding,
  postCeoApprovePayout,
} from "./ceoMasterApi";
