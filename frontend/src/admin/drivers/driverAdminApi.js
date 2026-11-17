/**
 * YALA Admin — Driver Documents & Driver Performance API client.
 *
 * Every endpoint used here ALREADY EXISTS in the backend. Nothing is invented,
 * no new table is introduced, and no metric is derived client-side that the
 * backend does not already return.
 *
 * Endpoints (verified against backend/taxi/taxi/urls.py + taxi/drivers/urls.py):
 *
 *   GET  /admin/approvals/drivers/       approvals driver_queue — driver + DriverDocument rows
 *   GET  /drivers/list/                  admin driver list; serialize_driver() already spreads in
 *                                        `**review_state` (document review) and
 *                                        `**performance_snapshot` (performance)
 *   GET  /drivers/performance/           AdminDriverPerformanceView — aggregate summary + filters
 *   POST /admin/documents/<id>/approve/  AdminDocumentApproveView  (audited)
 *   POST /admin/documents/<id>/reject/   AdminDocumentRejectView   (reason required, audited)
 *   GET  /safety/admin/incidents/        admin_incidents
 *
 * KNOWN INTEGRATION GAPS (documented, never worked around by inventing data):
 *
 *   1. There is no admin endpoint that lists DriverDocument rows on their own.
 *      `DriverDocumentListView` (/drivers/me/documents/) is driver-self only —
 *      it resolves the CALLER's profile. Per-document rows therefore come from
 *      the approvals queue above, which is the only admin source of document ids.
 *   2. There is no admin endpoint listing driver ratings/complaints across all
 *      drivers. Rating figures come from `drivers/list/` (`average_rating`) and
 *      per-driver ride history; no aggregate ratings endpoint exists.
 *   3. There is no date-ranged driver analytics endpoint, so per-day/week/month
 *      performance charts have no backend series. The UI must not fabricate one.
 */
import { API_URL } from "../../apiConfig";
import { apiRequest } from "../../delivery/DeliveryShared";
import { buildQuery } from "./driversApi";

const QUEUE_PAGE_SIZE = 100;

/**
 * Fetch EVERY page of an approval queue. The backend paginates at
 * page_size=20 by default; reading only page 1 silently drops drivers (and
 * their documents) once the queue grows past the first page.
 */
async function fetchAllQueuePages(path, params = {}) {
  const first = await apiRequest(
    `${API_URL}${path}${buildQuery({ ...params, page: 1, page_size: QUEUE_PAGE_SIZE })}`
  );
  const results = Array.isArray(first?.results)
    ? [...first.results]
    : Array.isArray(first)
      ? [...first]
      : [];
  const totalPages = first?.total_pages || 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await apiRequest(
      `${API_URL}${path}${buildQuery({ ...params, page, page_size: QUEUE_PAGE_SIZE })}`
    );
    results.push(...(next?.results || []));
  }
  return results;
}

/** Driver approval queue: driver identity + their DriverDocument rows (with ids). */
export async function getDriverApprovalQueue(params = {}) {
  return fetchAllQueuePages("/admin/approvals/drivers/", params);
}

/**
 * Courier approval queue — couriers are drivers with delivery mode enabled and
 * are EXCLUDED from the driver queue, so their documents only exist here.
 */
export async function getCourierApprovalQueue(params = {}) {
  return fetchAllQueuePages("/admin/approvals/couriers/", params);
}

/**
 * GET /admin/documents/driver/<driver_id>/ — every DriverDocument for one
 * driver (approved and rejected included), with signed file URLs and review
 * metadata. `driverId` is the DriverProfile id (backend also accepts User id).
 */
export async function getDriverDocuments(driverId) {
  return apiRequest(`${API_URL}/admin/documents/driver/${driverId}/`);
}

/** Admin driver list. Each row already carries document review state + a performance snapshot. */
export async function getDriverDirectory(params = {}) {
  return apiRequest(`${API_URL}/drivers/list/${buildQuery(params)}`);
}

/**
 * Aggregate driver performance summary.
 * Supported filters: status, under_review, risk, has_no_show, top, fraud.
 */
export async function getDriverPerformanceSummary(params = {}) {
  return apiRequest(`${API_URL}/drivers/performance/${buildQuery(params)}`);
}

/** Approve one driver document. Audited server-side as `document_approval`. */
export async function approveDriverDocument(documentId) {
  return apiRequest(`${API_URL}/admin/documents/${documentId}/approve/`, {
    method: "POST",
  });
}

/**
 * Reject one driver document. The backend REQUIRES a reason (400 otherwise) and
 * writes it to the audit trail.
 */
export async function rejectDriverDocument(documentId, reason) {
  return apiRequest(`${API_URL}/admin/documents/${documentId}/reject/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: String(reason || "").trim() }),
  });
}

/**
 * Ask the driver to upload a replacement file (status -> replacement_required).
 * The reason is REQUIRED and audited; the driver account status is unchanged.
 */
export async function requestDriverDocumentReplacement(documentId, reason) {
  return apiRequest(`${API_URL}/admin/documents/${documentId}/request-replacement/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: String(reason || "").trim() }),
  });
}

/**
 * Approve the driver ACCOUNT (POST /drivers/approve/<id>/). The backend resolves
 * either a DriverProfile id or a user id, enforces phone + plate + complete
 * e-signature, writes a driver audit row, and activates the user. It returns
 * { message, driver } on success or { error } / a signature block on failure.
 */
export async function approveDriverAccount(driverId) {
  return apiRequest(`${API_URL}/drivers/approve/${driverId}/`, { method: "POST" });
}

/**
 * Reject the driver ACCOUNT (POST /drivers/reject/<id>/). The backend REQUIRES a
 * reason of at least 5 characters and writes it to the audit trail; the user is
 * deactivated.
 */
export async function rejectDriverAccount(driverId, reason) {
  return apiRequest(`${API_URL}/drivers/reject/${driverId}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: String(reason || "").trim() }),
  });
}

/**
 * Suspend or reactivate the driver's LOGIN (POST /auth/users/<user_id>/block|unblock/).
 * This is the same audited block/unblock workflow the legacy dashboard uses —
 * separate from the document and application decisions above.
 */
export async function setDriverUserBlocked(userId, shouldBlock) {
  const action = shouldBlock ? "block" : "unblock";
  return apiRequest(`${API_URL}/auth/users/${userId}/${action}/`, { method: "POST" });
}

/** Safety incidents (admin). Used for the "safety incidents requiring review" KPI. */
export async function getSafetyIncidents(params = {}) {
  return apiRequest(`${API_URL}/safety/admin/incidents/${buildQuery(params)}`);
}

// ── Presentation helpers (pure, no data invention) ──────────────────────────

/** Document types the backend can return. Labels only — no new categories. */
export const DOCUMENT_TYPE_LABELS = {
  license: "Driver's License",
  driver_license: "Driver's License",
  national_id: "National ID",
  national_id_front: "National ID — Front",
  national_id_back: "National ID — Back",
  vehicle_registration: "Vehicle Registration",
  carte_grise: "Carte Grise (Registration)",
  insurance: "Vehicle Insurance",
  vignette: "Vehicle Inspection",
  vehicle_inspection: "Vehicle Inspection",
  driver_permit: "Professional Driving Permit",
  profile_photo: "Profile Photo",
  plate_number_photo: "Plate Number Photo",
};

export function documentTypeLabel(type) {
  const key = String(type || "").toLowerCase();
  return DOCUMENT_TYPE_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map a backend document/verification status to a StatusChip tone. */
export function documentStatusTone(status) {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "expired":
      return "danger";
    case "replacement_required":
      return "warning";
    case "pending":
    case "pending_review":
    case "uploaded":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Days until a document expires. Returns `null` when there is no expiry date —
 * never a fabricated 0, which would read as "expires today".
 */
export function daysUntilExpiry(expiresAt) {
  if (!expiresAt) return null;
  const then = new Date(expiresAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / 86400000);
}

/**
 * Expiry band for filtering and badges. Mirrors the notification thresholds the
 * backend already uses (30 days / 7 days / expired).
 */
export function expiryBand(expiresAt) {
  const days = daysUntilExpiry(expiresAt);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "soon";
  return "valid";
}
