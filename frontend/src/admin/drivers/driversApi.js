/**
 * Drivers Management admin API client (Stage 1 + Stage 2).
 *
 * The table feed comes from AdminDashboard props (it already fetches
 * GET /drivers/list/ via fetchDrivers and passes the taxi-driver rows down).
 *
 * Stage 2 adds four read-only, admin-only (IsAdminUser) per-driver helpers used
 * by the details drawer: ride history, earnings, payout history, and activity.
 * The `driverId` argument is ALWAYS the DriverProfile id (the driver dict `id`);
 * the backend resolves it to the underlying User id. Every call goes through the
 * shared `apiRequest` (Bearer token + refresh) built off `API_URL` — no base URLs
 * or auth headers are hardcoded here, and apiConfig.js is never touched.
 */
import { API_URL } from "../../apiConfig";
import { apiRequest } from "../../delivery/DeliveryShared";

/** Drop null/undefined/empty params and return a "?a=b" string (or ""). */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.append(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * GET /drivers/list/ (admin). Optional helper kept for parity with the riders
 * module; the module itself normally receives rows from AdminDashboard props.
 * Supported param: type = "taxi" | "courier" | "all".
 */
export async function getDriverList(params = {}) {
  return apiRequest(`${API_URL}/drivers/list/${buildQuery(params)}`);
}

/**
 * GET /rides/admin/driver/<driver_id>/history/
 * Returns { count, page, page_size, total_pages, results: [...], summary: {...} }.
 * Supported params: page, page_size, status, date_from, date_to.
 */
export async function getDriverRideHistory(driverId, params = {}) {
  return apiRequest(`${API_URL}/rides/admin/driver/${driverId}/history/${buildQuery(params)}`);
}

/**
 * GET /rides/admin/driver/<driver_id>/earnings/
 * Returns { total, today, week, month, currency } where each bucket is
 * { earnings_mru, commission_mru, payout_mru, ride_count, currency }.
 * Money values are Decimal strings, or null when there is no data (never 0).
 */
export async function getDriverEarnings(driverId) {
  return apiRequest(`${API_URL}/rides/admin/driver/${driverId}/earnings/`);
}

/**
 * GET /payments/admin/driver/<driver_id>/payouts/
 * Returns { count, page, page_size, total_pages, results: [...] }. Each row is a
 * whitelisted withdrawal (no provider token, no card number — only a redacted
 * payout_method_label). Supported params: page, page_size, status.
 */
export async function getDriverPayouts(driverId, params = {}) {
  return apiRequest(`${API_URL}/payments/admin/driver/${driverId}/payouts/${buildQuery(params)}`);
}

/**
 * GET /auth/admin/driver/<driver_id>/activity/
 * Returns { last_login, last_seen, last_seen_device } (each null when unknown).
 */
export async function getDriverActivity(driverId) {
  return apiRequest(`${API_URL}/auth/admin/driver/${driverId}/activity/`);
}

/**
 * GET /security/admin/audit-logs/?entity_type=driver&entity_id=<profile id>
 * Returns the driver's administrative audit trail (newest first).
 * Read-only; admin-only on the backend.
 */
export async function getDriverAuditTrail(driverId, params = {}) {
  const query = buildQuery({ entity_type: "driver", entity_id: driverId, limit: 50, ...params });
  return apiRequest(`${API_URL}/security/admin/audit-logs/${query}`);
}

