import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/fleet`;

export function fetchFleetDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/dashboard/`, { params });
}

export function fetchFleetDrivers(params = {}) {
  return authenticatedApi.get(`${BASE}/drivers/`, { params });
}

export function fetchFleetDocuments() {
  return authenticatedApi.get(`${BASE}/documents/`);
}

export function fetchFleetCeo(params = {}) {
  return authenticatedApi.get(`${BASE}/ceo/`, { params });
}

export function exportFleetReport(type, exportFormat = "csv") {
  return authenticatedApi.get(`${BASE}/reports/export/`, {
    params: { type, export_format: exportFormat },
    responseType: "blob",
  });
}

export function approveFleetDocument(documentId) {
  return authenticatedApi.post(`${BASE}/documents/${documentId}/approve/`);
}

export function rejectFleetDocument(documentId, reason) {
  return authenticatedApi.post(`${BASE}/documents/${documentId}/reject/`, { reason });
}

export function suspendFleetDriver(driverId) {
  return authenticatedApi.post(`${BASE}/drivers/${driverId}/suspend/`);
}

export function reactivateFleetDriver(driverId) {
  return authenticatedApi.post(`${BASE}/drivers/${driverId}/reactivate/`);
}

export function notifyFleetDriver(driverId, payload) {
  return authenticatedApi.post(`${BASE}/drivers/${driverId}/notify/`, payload);
}

export function assignFleetTraining(driverId, payload) {
  return authenticatedApi.post(`${BASE}/drivers/${driverId}/training/`, payload);
}

export const BADGE_LABELS = {
  top_performer: "⭐ Top Performer",
  low_acceptance: "⚠ Low Acceptance",
  high_cancellation: "⚠ High Cancellation",
  document_expiring: "📄 Document Expiring",
  suspended: "🚫 Suspended",
};

export const REPORT_TYPES = [
  { id: "daily_fleet", label: "Daily Fleet Report" },
  { id: "weekly_driver", label: "Weekly Driver Report" },
  { id: "monthly_revenue", label: "Monthly Revenue Report" },
  { id: "document_expiration", label: "Document Expiration Report" },
  { id: "performance_rankings", label: "Performance Rankings" },
];
