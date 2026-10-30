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
import authenticatedApi from "../../auth/authenticatedApi";

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
 * GET /auth/admin/riders/ — paginated, filtered, sortable admin rider list.
 * Supports: q, status, state, has_document, date_from, date_to, ordering,
 * page, page_size.
 */
export async function fetchAdminRiders(params = {}) {
  return apiRequest(`${API_URL}/auth/admin/riders/${buildQuery(params)}`);
}

/** GET /auth/admin/riders/<id>/ — rider profile detail. */
export async function fetchAdminRiderDetail(riderId) {
  return apiRequest(`${API_URL}/auth/admin/riders/${riderId}/`);
}

/**
 * Authenticated, admin-only identity document URL.
 *
 * Identity documents must NOT be fetched from the public media URL. This returns
 * the protected admin endpoint, which streams the file only to authenticated
 * administrators. Callers must fetch it with the authenticated client.
 */
export function getRiderDocumentUrl(riderId) {
  return `${API_URL}/auth/admin/riders/${riderId}/document/`;
}

/**
 * Fetch the rider identity document as a Blob through the authenticated client.
 *
 * Identity documents are NOT public: the protected admin endpoint requires the
 * Bearer token, so the file must be fetched (not linked by URL) and rendered from
 * an object URL that is revoked by the caller.
 */
export async function fetchRiderDocumentBlob(riderId) {
  const response = await authenticatedApi.get(getRiderDocumentUrl(riderId), {
    responseType: "blob",
  });
  return response.data;
}

/** POST /auth/users/<id>/suspend/ — requires a reason (min 5 chars). */
export async function suspendRider(riderId, reason) {
  return apiRequest(`${API_URL}/auth/users/${riderId}/suspend/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** POST /auth/users/<id>/reactivate/ — restores access (reversible). */
export async function reactivateRider(riderId, reason = "") {
  return apiRequest(`${API_URL}/auth/users/${riderId}/reactivate/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/**
 * GET /auth/admin/riders/<id>/support/ — the rider's support/feedback history.
 * Read-only; reuses the existing support ticket model on the backend.
 */
export async function getRiderSupport(riderId, params = {}) {
  return apiRequest(`${API_URL}/auth/admin/riders/${riderId}/support/${buildQuery(params)}`);
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
