/**
 * YALA Admin — Rides Management API client (Phase 2).
 *
 * All calls go through the shared authenticated client built off API_URL
 * (Bearer token + refresh handled there). No base URLs or auth headers are
 * hardcoded here.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/rides/admin/rides`;

export function buildRidesQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /rides/admin/rides/ — paginated, filtered, sortable ride list. */
export async function fetchAdminRides(params = {}) {
  const response = await authenticatedApi.get(`${BASE}/${buildRidesQuery(params)}`);
  return response.data;
}

/** GET /rides/admin/rides/<id>/ — read-only ride detail for the drawer. */
export async function fetchAdminRideDetail(rideId) {
  const response = await authenticatedApi.get(`${BASE}/${rideId}/`);
  return response.data;
}

const ADMIN_BASE = `${API_URL}/rides/admin`;

/**
 * GET /rides/admin/financial-summary/ — optimized aggregate for the dashboard's financial
 * summary cards (Task 9A).
 *
 * Shape:
 *   window: {size, rides, city_id, ordering}      how the aggregate was scoped
 *   money:  {total_revenue, platform_commission, driver_earnings}   decimal strings
 *   counts: {total, completed, cancelled, rider_no_show, active, waiting,
 *            driver_arriving, in_progress, paid, unpaid}
 *   rates:  {completion_rate_pct, cancellation_rate_pct}
 *   average_fare: number
 *   dashboard_float_totals: float mirrors of `money` (never used for display)
 *
 * Money arrives as Django decimal strings, so it must be formatted with `formatMoney`
 * (decimal-safe) — never `Number()`.
 */
export async function fetchRidesFinancialSummary() {
  const response = await authenticatedApi.get(`${ADMIN_BASE}/financial-summary/`);
  return response.data;
}
