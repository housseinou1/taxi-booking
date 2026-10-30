import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Canonical executive metrics (Phase 5).
 *
 * ``GET /operations/executive-metrics/`` is the **single authoritative** source for platform
 * KPIs. It is deliberately self-documenting: every figure ships with a ``definitions`` entry
 * explaining exactly what it counts, so a dashboard never has to guess.
 *
 * Key properties this client must preserve:
 *   * ``fleet.total_drivers`` counts **ride-hailing drivers only** (couriers excluded) and
 *     ``fleet.total_couriers`` counts delivery couriers — the two are never added together,
 *     which is what previously double-counted the fleet.
 *   * ``money.platform_revenue`` is Yala income from the **settled** payment ledger only.
 *   * every ``liabilities.*`` entry carries ``is_revenue: false`` and must never be presented
 *     as revenue.
 *
 * Reporting periods: today, last_7_days, last_30_days, this_month, custom.
 */
export async function fetchExecutiveMetrics(params = {}) {
  const response = await authenticatedApi.get(`${API_URL}/operations/executive-metrics/`, {
    params,
  });
  return response.data;
}

export const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
];
