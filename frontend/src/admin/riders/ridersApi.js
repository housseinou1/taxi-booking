/**
 * Riders Management admin API client.
 *
 * Thin wrappers over the three NEW additive backend endpoints implemented in
 * Stage 1 (FEAT-001/002/003) plus the extended audit-log filter. Every call
 * goes through the shared `apiRequest` helper (which injects the Bearer token
 * and handles refresh) and is built off `API_URL` — no base URLs or auth
 * headers are hardcoded here, and apiConfig.js is never touched.
 *
 * Query strings are assembled with URLSearchParams so empty/undefined params
 * are dropped rather than sent as literal "undefined".
 */
import { API_URL } from "../../apiConfig";
import { apiRequest } from "../../delivery/DeliveryShared";

/** Drop null/undefined/empty params and return a "?a=b" string (or ""). */
function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.append(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * GET /rides/admin/rider/<rider_id>/history/
 * Returns { count, page, page_size, total_pages, results: [...], summary: {...} }.
 * Supported params: page, page_size, status, date_from, date_to.
 */
export async function getRiderRideHistory(riderId, params = {}) {
  return apiRequest(`${API_URL}/rides/admin/rider/${riderId}/history/${buildQuery(params)}`);
}

/**
 * GET /payments/admin/rider/<rider_id>/payments/
 * Returns { count, page, page_size, total_pages, results: [...], refunds: [...] }.
 * Supported params: page, page_size, status.
 */
export async function getRiderPayments(riderId, params = {}) {
  return apiRequest(`${API_URL}/payments/admin/rider/${riderId}/payments/${buildQuery(params)}`);
}

/**
 * GET /auth/admin/rider/<rider_id>/activity/
 * Returns { last_login, last_seen, last_seen_device } (each null when unknown).
 */
export async function getRiderActivity(riderId) {
  return apiRequest(`${API_URL}/auth/admin/rider/${riderId}/activity/`);
}

/**
 * GET /security/admin/audit-logs/?entity_type=customer&entity_id=<rider_id>
 * The audit-log endpoint is shared, so the rider filter is expressed purely via
 * the OPTIONAL entity_type/entity_id query params added in FEAT-003. Extra
 * params (e.g. date_from, date_to, limit) are merged in.
 */
export async function getRiderAuditLogs(riderId, params = {}) {
  const query = buildQuery({ entity_type: "customer", entity_id: riderId, ...params });
  return apiRequest(`${API_URL}/security/admin/audit-logs/${query}`);
}
