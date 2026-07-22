import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/business/finance/operations`;

export const REPORT_TYPES = [
  { id: "daily", label: "Daily Financial Report" },
  { id: "weekly", label: "Weekly Report" },
  { id: "monthly", label: "Monthly Report" },
  { id: "cash_flow", label: "Cash Flow Report" },
  { id: "outstanding", label: "Outstanding Balances" },
  { id: "commission", label: "Commission Report" },
];

export async function fetchFinanceOperations(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function exportFinanceReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await authenticatedApi.get(`${BASE}/export/?${query}`, {
    responseType: "blob",
  });
  return response;
}

export async function approveWithdrawal(id) {
  return authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/approve/`, {});
}

export async function rejectWithdrawal(id) {
  return authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/reject/`, {});
}

export async function markWithdrawalPaid(id, payload = {}) {
  return authenticatedApi.post(`${API_URL}/payments/withdrawals/${id}/mark-paid/`, payload);
}
