/**
 * YALA Admin — Yala Delivery / Courier Management API client (Phase 5).
 *
 * All calls go through the shared authenticated client built off API_URL (Bearer
 * token + refresh handled there). No base URLs or auth headers are hardcoded.
 *
 * Courier identity documents are NOT public: they are fetched as Blobs from an
 * authenticated admin-only endpoint and rendered from an object URL.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/deliveries/admin`;

export function buildDeliveryQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /deliveries/admin/overview/ — delivery-module KPIs. */
export async function fetchDeliveryOverview() {
  const response = await authenticatedApi.get(`${BASE}/overview/`);
  return response.data;
}

/**
 * GET /deliveries/admin/couriers/ — paginated courier directory.
 * Supported params: search, queue, status, vehicle_type, ordering, page, page_size.
 */
export async function fetchAdminCouriers(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/couriers/${buildDeliveryQuery(params)}`
  );
  return response.data;
}

/** GET /deliveries/admin/couriers/<driver_id>/ — read-only courier detail. */
export async function fetchAdminCourierDetail(courierId) {
  const response = await authenticatedApi.get(`${BASE}/couriers/${courierId}/`);
  return response.data;
}

/**
 * Vehicle-type document requirements + approval verdict for one courier.
 * The verdict (`approval_blockers`) is computed server-side and is authoritative:
 * approval is refused by the API while it is blocked.
 */
export async function fetchCourierRequirements(courierId) {
  const response = await authenticatedApi.get(`${BASE}/couriers/${courierId}/requirements/`);
  return response.data;
}

/**
 * Read-only investigation: couriers marked approved whose vehicle-type
 * requirements look incomplete. Never mutates an account.
 */
export async function fetchCourierRequirementsAudit() {
  const response = await authenticatedApi.get(`${BASE}/couriers/requirements-audit/`);
  return response.data;
}

/** Document state → StatusChip tone (missing/pending/approved/rejected/expired). */
export const DOCUMENT_STATE_TONES = {
  approved: "success",
  pending_review: "warning",
  missing: "danger",
  rejected: "danger",
  expired: "danger",
};

export const DOCUMENT_STATE_LABELS = {
  approved: "Approved",
  pending_review: "Pending review",
  missing: "Missing",
  rejected: "Rejected",
  expired: "Expired",
};

export const VEHICLE_TYPE_LABELS = {
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  car: "Vehicle / Car",
};

/**
 * GET /deliveries/admin/couriers/<driver_id>/deliveries/ — paginated delivery
 * history for one courier. Supported params: status, page, page_size.
 */
export async function fetchCourierDeliveries(courierId, params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/couriers/${courierId}/deliveries/${buildDeliveryQuery(params)}`
  );
  return response.data;
}

/** Authenticated, admin-only courier document URL (never the public media URL). */
export function getCourierDocumentUrl(courierId, documentId) {
  return `${BASE}/couriers/${courierId}/documents/${documentId}/`;
}

/**
 * Fetch a courier document as a Blob through the authenticated client.
 * The protected endpoint requires the Bearer token, so the file must be fetched
 * (not linked by URL) and rendered from an object URL the caller revokes.
 */
export async function fetchCourierDocumentBlob(courierId, documentId) {
  const response = await authenticatedApi.get(
    getCourierDocumentUrl(courierId, documentId),
    { responseType: "blob" }
  );
  return response.data;
}

/**
 * Authenticated, admin-only courier electronic-signature image.
 *
 * The shared courier-signature serializer returns a public media URL (used by
 * the courier app and the approval center). The admin UI must not use it, so the
 * signature is fetched as a Blob through the authenticated endpoint and rendered
 * from an object URL the caller revokes.
 */
export function getCourierSignatureUrl(courierId) {
  return `${BASE}/couriers/${courierId}/signature/`;
}

export async function fetchCourierSignatureBlob(courierId) {
  const response = await authenticatedApi.get(getCourierSignatureUrl(courierId), {
    responseType: "blob",
  });
  return response.data;
}

/** POST /deliveries/admin/couriers/<id>/suspend/ — requires a reason (5+ chars). */
export async function suspendCourier(courierId, reason) {
  const response = await authenticatedApi.post(
    `${BASE}/couriers/${courierId}/suspend/`,
    { reason }
  );
  return response.data;
}

/** POST /deliveries/admin/couriers/<id>/reactivate/ — lifts a suspension. */
export async function reactivateCourier(courierId, reason = "") {
  const response = await authenticatedApi.post(
    `${BASE}/couriers/${courierId}/reactivate/`,
    { reason }
  );
  return response.data;
}

/**
 * POST /security/admin/couriers/<id>/action/ — approve / reject.
 *
 * Deliberately reuses the existing approval-center endpoint so the courier
 * electronic-signature gate keeps a single source of truth on the backend.
 */
export async function approveCourier(courierId) {
  const response = await authenticatedApi.post(
    `${API_URL}/security/admin/couriers/${courierId}/action/`,
    { action: "approve" }
  );
  return response.data;
}

export async function rejectCourier(courierId, reason) {
  const response = await authenticatedApi.post(
    `${API_URL}/security/admin/couriers/${courierId}/action/`,
    { action: "reject", reason }
  );
  return response.data;
}

/**
 * GET /security/admin/audit-logs/?entity_type=courier&entity_id=<user id>
 * Courier administrative audit trail (newest first). Read-only.
 */
export async function fetchCourierAuditTrail(userId, params = {}) {
  const response = await authenticatedApi.get(
    `${API_URL}/security/admin/audit-logs/${buildDeliveryQuery({
      entity_type: "courier",
      entity_id: userId,
      limit: 50,
      ...params,
    })}`
  );
  return response.data;
}

/**
 * GET /deliveries/admin/merchants/ — read-only merchant directory.
 * Supported params: search, status, merchant_type, city, ordering, page, page_size.
 */
export async function fetchAdminMerchants(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/merchants/${buildDeliveryQuery(params)}`
  );
  return response.data;
}

/**
 * GET /deliveries/admin/deliveries/ — paginated administrative delivery directory (Task 7).
 *
 * Response envelope (asserted by the backend's own contract test):
 *   { count, page, page_size, total_pages, next, previous, results[], summary }
 * `summary` = { total, active, by_status{<status>: n}, delivered_revenue }.
 *
 * Supported params: search (customer/courier name or email; a bare number also matches the
 * delivery id), status ("all" | "active" | one of the model's statuses), category, city
 * (exact stored service_city text), date_from, date_to, ordering, page, page_size.
 */
export async function fetchAdminDeliveries(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/deliveries/${buildDeliveryQuery(params)}`
  );
  return response.data;
}

/**
 * GET /deliveries/admin/deliveries/<id>/ — read-only administrative delivery detail.
 *
 * Unlike the shared `/deliveries/<id>/` view this never runs
 * `assignment_service.process_expired_offer`, so opening a record cannot change an
 * assignment. Administrative monitoring must use this endpoint.
 */
export async function fetchAdminDeliveryDetail(deliveryId) {
  const response = await authenticatedApi.get(`${BASE}/deliveries/${deliveryId}/`);
  return response.data;
}

/**
 * GET /deliveries/admin/deliveries/<id>/tracking/ — read-only administrative tracking.
 *
 * `courier_location` = { lat, lng, available, updated_at }. When the courier's position is
 * unknown the coordinates are null and `available` is false — never substituted with the
 * pickup point — and `updated_at` is null because the platform stores no position timestamp.
 * Pickup/destination coordinates always come from the delivery row.
 */
export async function fetchAdminDeliveryTracking(deliveryId) {
  const response = await authenticatedApi.get(`${BASE}/deliveries/${deliveryId}/tracking/`);
  return response.data;
}

/**
 * GET /deliveries/admin/analytics/cities/ — totals grouped by the stored `service_city`.
 * Optional: date_from, date_to (YYYY-MM-DD, on created_at). Cities are grouped by their exact
 * stored text; `possible_name_variants` lists spelling variants and they are never merged.
 */
export async function fetchDeliveryCityAnalytics(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/analytics/cities/${buildDeliveryQuery(params)}`
  );
  return response.data;
}

/** Ordering options accepted by the directory endpoint. */
export const DIRECTORY_ORDERING_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "fare_high", label: "Fare: high to low" },
  { value: "fare_low", label: "Fare: low to high" },
  { value: "status", label: "Status" },
  { value: "id", label: "Delivery ID" },
];

/** Status filter options: the endpoint's own `active` alias, plus "all". */
export const DIRECTORY_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active (in progress)" },
  { value: "requested", label: "Requested" },
  { value: "accepted", label: "Accepted" },
  { value: "courier_arriving", label: "Courier arriving" },
  { value: "picked_up", label: "Picked up" },
  { value: "in_transit", label: "In transit" },
  { value: "delivering", label: "Delivering" },
  { value: "delivery_exception", label: "Delivery exception" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];
