import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/admin/system`;

export async function fetchSystemDashboard() {
  const response = await authenticatedApi.get(`${BASE}/`);
  return response.data;
}

export async function fetchSystemHealth() {
  const response = await authenticatedApi.get(`${BASE}/health/`);
  return response.data;
}

export async function fetchStaffUsers(params = {}) {
  const response = await authenticatedApi.get(`${BASE}/users/`, { params });
  return response.data;
}

export async function inviteStaffUser(payload) {
  const response = await authenticatedApi.post(`${BASE}/users/`, payload);
  return response.data;
}

export async function updateStaffUser(userId, payload) {
  const response = await authenticatedApi.patch(`${BASE}/users/${userId}/`, payload);
  return response.data;
}

export async function fetchSecurityCenter() {
  const response = await authenticatedApi.get(`${BASE}/security/`);
  return response.data;
}

export async function fetchSystemAudit(params = {}) {
  const response = await authenticatedApi.get(`${BASE}/audit/`, { params });
  return response.data;
}

export async function fetchPlatformSettings() {
  const response = await authenticatedApi.get(`${BASE}/settings/`);
  return response.data;
}

export async function updatePlatformSetting(payload) {
  const response = await authenticatedApi.patch(`${BASE}/settings/`, payload);
  return response.data;
}

export async function fetchBackupStatus() {
  const response = await authenticatedApi.get(`${BASE}/backup/`);
  return response.data;
}

export async function queueBackupAction(payload) {
  const response = await authenticatedApi.post(`${BASE}/backup/`, payload);
  return response.data;
}

export async function fetchIntegrations() {
  const response = await authenticatedApi.get(`${BASE}/integrations/`);
  return response.data;
}

export async function fetchFeatureFlags() {
  const response = await authenticatedApi.get(`${BASE}/feature-flags/`);
  return response.data;
}

export async function updateFeatureFlag(payload) {
  const response = await authenticatedApi.patch(`${BASE}/feature-flags/`, payload);
  return response.data;
}

export async function fetchReleases() {
  const response = await authenticatedApi.get(`${BASE}/releases/`);
  return response.data;
}

export async function fetchDisasterRecovery() {
  const response = await authenticatedApi.get(`${BASE}/disaster-recovery/`);
  return response.data;
}

export function auditToCsv(logs) {
  const headers = ["id", "created_at", "actor_email", "action", "entity_type", "entity_id", "summary", "ip_address"];
  const lines = [headers.join(",")];
  (logs || []).forEach((row) => {
    lines.push(
      headers
        .map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  });
  return lines.join("\n");
}
