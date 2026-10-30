/**
 * YALA Admin — CEO Reporting API client (Phase 9).
 *
 * Read-only: both helpers are GETs. No financial mutation, no export trigger and
 * no approval helper lives here — reports are for oversight from New York, not
 * for moving money.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/ceo`;

export function buildReportQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * GET /operations/ceo/reports/cities/ — Nouakchott / Nouadhibou separated and
 * combined statistics for a period (rides, deliveries, revenue, commissions,
 * withdrawals, accounts).
 */
export async function fetchCeoCityReport(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/reports/cities/${buildReportQuery(params)}`
  );
  return response.data;
}

/** GET /operations/ceo/security/ — protected-CEO posture + strong-auth status. */
export async function fetchCeoSecurityPosture() {
  const response = await authenticatedApi.get(`${BASE}/security/`);
  return response.data;
}

export const REPORT_PERIOD_OPTIONS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "custom", label: "Custom range" },
];

export const REPORT_CITY_OPTIONS = [
  { value: "", label: "Nouakchott + Nouadhibou (both)" },
  { value: "Nouakchott", label: "Nouakchott only" },
  { value: "Nouadhibou", label: "Nouadhibou only" },
];
