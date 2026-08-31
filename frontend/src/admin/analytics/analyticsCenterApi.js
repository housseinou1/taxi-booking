import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { exportBiReport, fetchBiOverview, fetchBiSubjectArea } from "../bi/biAnalyticsApi";
import { fetchBiGrowthCenter } from "../bi/biGrowthApi";

export async function fetchAnalyticsCenter(params = {}) {
  const [overview, growth, riders, drivers, rides, finance] = await Promise.all([
    fetchBiOverview(params),
    fetchBiGrowthCenter(params).catch(() => null),
    fetchBiSubjectArea("customers", params).catch(() => null),
    fetchBiSubjectArea("drivers", params).catch(() => null),
    fetchBiSubjectArea("rides", params).catch(() => null),
    fetchBiSubjectArea("finance", params).catch(() => null),
  ]);
  return { overview, growth, riders, drivers, ops: rides, finance };
}

export { exportBiReport };

export function approvedMetricsCatalog() {
  return [
    { id: "gross_bookings", label: "Gross bookings", area: "finance" },
    { id: "net_revenue", label: "Net revenue", area: "finance" },
    { id: "completed_rides", label: "Completed rides", area: "operations" },
    { id: "completed_deliveries", label: "Completed deliveries", area: "operations" },
    { id: "active_riders", label: "Active riders", area: "customers" },
    { id: "active_drivers", label: "Active drivers", area: "drivers" },
    { id: "acceptance_rate", label: "Acceptance rate", area: "drivers" },
    { id: "cancellation_rate", label: "Cancellation rate", area: "operations" },
    { id: "retention", label: "Retention", area: "customers" },
    { id: "payment_success", label: "Payment success", area: "finance" },
  ];
}

export const REPORT_PRESETS = [
  { id: "executive", label: "Executive summary", reportType: "executive" },
  { id: "finance", label: "Finance trends", reportType: "finance" },
  { id: "operations", label: "Operations", reportType: "operations" },
  { id: "growth", label: "Growth", reportType: "growth" },
];

export function saveReportConfig(config) {
  const key = "yala.analytics.savedReports";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  const next = [{ ...config, savedAt: new Date().toISOString() }, ...existing].slice(0, 20);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

export function loadReportConfigs() {
  try {
    return JSON.parse(localStorage.getItem("yala.analytics.savedReports") || "[]");
  } catch {
    return [];
  }
}

/** Soft ping to ensure analytics endpoints stay within IsAnalyticsStaff — no write side effects. */
export async function pingAnalyticsAccess() {
  return authenticatedApi.get(`${API_URL}/operations/bi/`, { params: { period: "daily" } });
}
