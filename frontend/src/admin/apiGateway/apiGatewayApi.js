import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/api-gateway`;

export async function fetchPartnerOrganizations() {
  const response = await authenticatedApi.get(`${BASE}/developer/organizations/`);
  return response.data;
}

export async function createPartnerOrganization(payload) {
  const response = await authenticatedApi.post(`${BASE}/developer/organizations/`, payload);
  return response.data;
}

export async function approvePartnerOrganization(id, status) {
  const response = await authenticatedApi.post(`${BASE}/developer/organizations/${id}/approve/`, { status });
  return response.data;
}

export async function fetchPartnerApplications() {
  const response = await authenticatedApi.get(`${BASE}/developer/applications/`);
  return response.data;
}

export async function createPartnerApplication(payload) {
  const response = await authenticatedApi.post(`${BASE}/developer/applications/`, payload);
  return response.data;
}

export async function fetchApiKeys(applicationId) {
  const query = applicationId ? `?application=${applicationId}` : "";
  const response = await authenticatedApi.get(`${BASE}/developer/api-keys/${query}`);
  return response.data;
}

export async function createApiKey(payload) {
  const response = await authenticatedApi.post(`${BASE}/developer/api-keys/create/`, payload);
  return response.data;
}

export async function rotateApiKey(id) {
  const response = await authenticatedApi.post(`${BASE}/developer/api-keys/${id}/rotate/`);
  return response.data;
}

export async function revokeApiKey(id) {
  const response = await authenticatedApi.post(`${BASE}/developer/api-keys/${id}/revoke/`);
  return response.data;
}

export async function fetchWebhooks() {
  const response = await authenticatedApi.get(`${BASE}/developer/webhooks/`);
  return response.data;
}

export async function createWebhook(payload) {
  const response = await authenticatedApi.post(`${BASE}/developer/webhooks/`, payload);
  return response.data;
}

export async function fetchUsage() {
  const response = await authenticatedApi.get(`${BASE}/developer/usage/`);
  return response.data;
}

export async function fetchGatewayDocs(type = "integration") {
  const response = await authenticatedApi.get(`${BASE}/developer/docs/?type=${type}`);
  return response.data;
}

export async function fetchGatewayAnalytics(days = 30) {
  const response = await authenticatedApi.get(`${BASE}/admin/analytics/?days=${days}`);
  return response.data;
}

export async function fetchGatewayCeoDashboard(days = 30) {
  const response = await authenticatedApi.get(`${BASE}/admin/ceo-dashboard/?days=${days}`);
  return response.data;
}

export async function fetchGatewayLogs() {
  const response = await authenticatedApi.get(`${BASE}/admin/logs/`);
  return response.data;
}

export async function triggerWebhookEvent(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/webhooks/trigger/`, payload);
  return response.data;
}
