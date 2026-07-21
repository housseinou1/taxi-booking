import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

export async function fetchExecutiveDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(
    `${API_URL}/operations/executive/dashboard${suffix}`
  );
  return response.data;
}

export async function exportExecutiveReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await authenticatedApi.get(
    `${API_URL}/operations/executive/reports/export/?${query}`,
    { responseType: "blob" }
  );
  return response;
}

export async function postExecutiveBroadcast(payload) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/executive/broadcast/`,
    payload
  );
  return response.data;
}

export async function setMaintenanceMode(payload) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/executive/maintenance-mode/`,
    payload
  );
  return response.data;
}

export async function fetchPendingWithdrawals() {
  const response = await authenticatedApi.get(`${API_URL}/payments/withdrawals/`);
  const items = Array.isArray(response.data) ? response.data : response.data?.withdrawals || [];
  return items.filter((item) => item.status === "pending");
}

export async function approveWithdrawal(id) {
  return authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/approve/`, {});
}

export async function rejectWithdrawal(id) {
  return authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/reject/`, {});
}

export async function postAccountAction(payload) {
  const response = await authenticatedApi.post(
    `${API_URL}/operations/executive/account-action/`,
    payload
  );
  return response.data;
}
