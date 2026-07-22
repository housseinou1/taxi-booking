import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/compliance-governance`;

export async function fetchComplianceGovernanceSuite() {
  const response = await authenticatedApi.get(`${BASE}/`);
  return response.data;
}

export async function fetchComplianceDashboard() {
  const response = await authenticatedApi.get(`${BASE}/dashboard/`);
  return response.data;
}

export async function fetchComplianceAuditCenter() {
  const response = await authenticatedApi.get(`${BASE}/audits/`);
  return response.data;
}

export async function postComplianceAuditAction(auditId, payload) {
  const response = await authenticatedApi.post(`${BASE}/audits/${auditId}/action/`, payload);
  return response.data;
}

export async function fetchCompliancePolicies() {
  const response = await authenticatedApi.get(`${BASE}/policies/`);
  return response.data;
}

export async function postCompliancePolicyAction(policyId, payload) {
  const response = await authenticatedApi.post(`${BASE}/policies/${policyId}/action/`, payload);
  return response.data;
}

export async function fetchComplianceRiskRegister() {
  const response = await authenticatedApi.get(`${BASE}/risks/`);
  return response.data;
}

export async function postComplianceRiskAction(riskId, payload) {
  const response = await authenticatedApi.post(`${BASE}/risks/${riskId}/action/`, payload);
  return response.data;
}

export async function fetchComplianceCalendar(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/calendar/${suffix}`);
  return response.data;
}

export async function postComplianceCalendarAction(eventId, payload) {
  const response = await authenticatedApi.post(`${BASE}/calendar/${eventId}/action/`, payload);
  return response.data;
}

export async function fetchCeoGovernanceDashboard() {
  const response = await authenticatedApi.get(`${BASE}/ceo-governance/`);
  return response.data;
}

export async function exportComplianceReport(reportType, exportFormat = "csv") {
  const query = new URLSearchParams({ export_format: exportFormat }).toString();
  const response = await authenticatedApi.get(`${BASE}/reports/${reportType}/export/?${query}`, {
    responseType: "blob",
  });
  return response;
}

export function complianceReportExportUrl(reportType, exportFormat = "csv") {
  return `${BASE}/reports/${reportType}/export/?export_format=${exportFormat}`;
}
