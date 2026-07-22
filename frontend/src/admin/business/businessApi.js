import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/business`;

export function fetchBusinessHub() {
  return authenticatedApi.get(`${BASE}/hub/`);
}

export function fetchFinanceCenter(params = {}) {
  return authenticatedApi.get(`${BASE}/finance/`, { params });
}

export function exportFinanceCenter(exportFormat = "csv", params = {}) {
  return authenticatedApi.get(`${BASE}/finance/export/`, {
    params: { export_format: exportFormat, ...params },
    responseType: "blob",
  });
}

export function fetchCrmDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/crm/`, { params });
}

export function fetchCrmProfile(userId) {
  return authenticatedApi.get(`${BASE}/crm/profiles/${userId}/`);
}

export function updateCrmProfile(userId, payload) {
  return authenticatedApi.patch(`${BASE}/crm/profiles/${userId}/`, payload);
}

export function fetchMarketingDashboard() {
  return authenticatedApi.get(`${BASE}/marketing/`);
}

export function fetchMarketingAnalytics() {
  return authenticatedApi.get(`${BASE}/marketing/analytics/`);
}

export function createMarketingCampaign(payload) {
  return authenticatedApi.post(`${BASE}/marketing/campaigns/`, payload);
}

export function fetchIncentivesDashboard() {
  return authenticatedApi.get(`${BASE}/incentives/`);
}

export function fetchPartnersDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/partners/`, { params });
}

export function fetchPartnerDetail(partnerId) {
  return authenticatedApi.get(`${BASE}/partners/${partnerId}/`);
}

export function fetchCorporateDashboard() {
  return authenticatedApi.get(`${BASE}/corporate/`);
}

export function fetchCorporateDetail(accountType, accountId) {
  return authenticatedApi.get(`${BASE}/corporate/${accountType}/${accountId}/`);
}

export function generateCorporateInvoice(payload) {
  return authenticatedApi.post(`${BASE}/corporate/invoices/generate/`, payload);
}

export function fetchCorporateInvoices() {
  return authenticatedApi.get(`${BASE}/corporate/invoices/`);
}

export function updateCorporateInvoice(invoiceId, payload) {
  return authenticatedApi.patch(`${BASE}/corporate/invoices/${invoiceId}/`, payload);
}

export function exportCorporateInvoice(invoiceId, exportFormat = "csv") {
  return authenticatedApi.get(`${BASE}/corporate/invoices/${invoiceId}/export/`, {
    params: { export_format: exportFormat },
    responseType: "blob",
  });
}

export function corporateAccountAction(accountType, accountId, payload) {
  return authenticatedApi.post(`${BASE}/corporate/${accountType}/${accountId}/action/`, payload);
}

export function fetchComplianceDashboard() {
  return authenticatedApi.get(`${BASE}/compliance/`);
}

export function exportComplianceReport(exportFormat = "csv") {
  return authenticatedApi.get(`${BASE}/compliance/export/`, {
    params: { export_format: exportFormat },
    responseType: "blob",
  });
}

export function fetchBiDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/bi/`, { params });
}
