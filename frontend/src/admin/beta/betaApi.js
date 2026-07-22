import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/beta`;

export function fetchBetaDashboard() {
  return authenticatedApi.get(`${BASE}/dashboard/`);
}

export function fetchBetaCeoReport() {
  return authenticatedApi.get(`${BASE}/ceo-report/`);
}
