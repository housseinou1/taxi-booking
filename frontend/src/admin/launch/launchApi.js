import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/launch`;

export function fetchLaunchHub() {
  return authenticatedApi.get(`${BASE}/hub/`);
}

export function fetchLaunchControl() {
  return authenticatedApi.get(`${BASE}/control/`);
}

export function fetchLaunchAlerts() {
  return authenticatedApi.get(`${BASE}/alerts/`);
}

export function postAlertAck(alertId) {
  return authenticatedApi.post(`${BASE}/alerts/${alertId}/ack/`);
}

export function postAlertResolve(alertId) {
  return authenticatedApi.post(`${BASE}/alerts/${alertId}/resolve/`);
}

export function fetchIncidents(params = {}) {
  return authenticatedApi.get(`${BASE}/incidents/`, { params });
}

export function createIncident(payload) {
  return authenticatedApi.post(`${BASE}/incidents/`, payload);
}

export function updateIncident(incidentId, payload) {
  return authenticatedApi.patch(`${BASE}/incidents/${incidentId}/`, payload);
}

export function exportIncidentReport(incidentId, exportFormat = "csv") {
  return authenticatedApi.get(`${BASE}/incidents/${incidentId}/export/`, {
    params: { export_format: exportFormat },
    responseType: "blob",
  });
}

export function fetchSupportQueue(params = {}) {
  return authenticatedApi.get(`${BASE}/support/`, { params });
}

export function fetchOnboarding() {
  return authenticatedApi.get(`${BASE}/onboarding/`);
}

export function fetchFinanceReconciliation(params = {}) {
  return authenticatedApi.get(`${BASE}/finance/`, { params });
}

export function exportReconciliation(exportFormat = "csv", params = {}) {
  return authenticatedApi.get(`${BASE}/finance/export/`, {
    params: { export_format: exportFormat, ...params },
    responseType: "blob",
  });
}

export function fetchLaunchKpis() {
  return authenticatedApi.get(`${BASE}/kpis/`);
}

export function fetchLaunchChecklist() {
  return authenticatedApi.get(`${BASE}/checklist/`);
}
