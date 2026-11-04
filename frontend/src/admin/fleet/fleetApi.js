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

/**
 * Bulk notify. The backend exposes only the per-driver endpoint
 * (`/operations/fleet/drivers/<id>/notify/`) — there is no bulk route — so this
 * fans out over the existing, working endpoint and reports how many succeeded.
 * No backend contract is invented.
 */
export async function bulkNotifyFleetDrivers(payload = {}) {
  const { message, title = "Driver Operations", audience = "all", city_id } = payload;
  const listResponse = await fetchFleetDrivers(city_id ? { city_id } : {});
  const drivers = listResponse?.data?.drivers || listResponse?.data || [];
  const targets = drivers.filter((driver) => {
    if (audience === "all") return true;
    if (audience === "pending_documents") {
      return driver.document_state === "pending" || driver.documents_pending;
    }
    if (audience === "suspended") return driver.status === "suspended";
    return true;
  });

  const results = await Promise.allSettled(
    targets.map((driver) => notifyFleetDriver(driver.id, { title, message }))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, total: targets.length };
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

/**
 * GET /operations/vehicles/ (read-only).
 *
 * Vehicle data does not live behind the /operations/fleet/ base — it is served by
 * the existing Vehicle Management directory, derived from DriverProfile vehicle
 * fields. Params: search, city, approval, document, limit (max 500).
 * Returns { today, expiry_alert_days, count, vehicles: [...], expiring_documents: [...], note }.
 */
export function fetchFleetVehicles(params = {}) {
  return authenticatedApi.get(`${API_URL}/operations/vehicles/`, { params });
}

/** DriverProfile.status choices (taxi/drivers/models.py STATUS_CHOICES). */
export const DRIVER_STATUS_LABELS = {
  approved: { label: "Approved", tone: "ok" },
  pending: { label: "Pending", tone: "warn" },
  pending_review: { label: "Pending review", tone: "warn" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

/** Live dispatch status from build_driver_performance_rows -> _driver_status(). */
export const DISPATCH_STATUS_LABELS = {
  online: { label: "Online", tone: "ok" },
  busy: { label: "On trip", tone: "warn" },
  offline: { label: "Offline", tone: "idle" },
  suspended: { label: "Suspended", tone: "danger" },
};

/** Document state strings returned by the vehicles endpoint (_document_state). */
export const DOCUMENT_STATE_LABELS = {
  ok: { label: "Valid", tone: "ok" },
  expiring_soon: { label: "Expiring soon", tone: "warn" },
  expired: { label: "Expired", tone: "danger" },
  missing: { label: "Missing", tone: "danger" },
};

/**
 * Score bands — mirrors taxi/drivers/performance.py score_band() exactly.
 * Display bands only; the score formula is never recomputed on the client.
 */
export const SCORE_BAND_META = {
  excellent: { label: "Excellent", tone: "ok" },
  strong: { label: "Strong", tone: "ok" },
  watch: { label: "Watch", tone: "warn" },
  risk: { label: "At risk", tone: "danger" },
};

export function scoreBandMeta(band) {
  return SCORE_BAND_META[band] || { label: band || "Unrated", tone: "idle" };
}

/** Labels for document-monitoring buckets (REMINDER_WINDOWS = 30, 15, 7, 1). */
export const DOCUMENT_BUCKET_LABELS = {
  expired: "Expired",
  expiring_1d: "Expiring within 1 day",
  expiring_7d: "Expiring within 7 days",
  expiring_15d: "Expiring within 15 days",
  expiring_30d: "Expiring within 30 days",
  valid: "Valid",
};

/**
 * Reports catalog. Every supported entry maps to a report type the backend
 * implements in build_fleet_report_rows(), grouped for the Reports tab.
 */
export const FLEET_REPORT_CATALOG = [
  {
    section: "Fleet performance",
    reports: [
      {
        id: "daily_fleet",
        label: "Daily Fleet Report",
        description:
          "Current fleet counters: registered, approved, online, busy, offline, suspended and document-expiry totals.",
        supported: true,
      },
    ],
  },
  {
    section: "Driver performance",
    reports: [
      {
        id: "weekly_driver",
        label: "Weekly Driver Report",
        description:
          "One row per driver: performance score, acceptance rate, cancellation rate, completed trips and weekly revenue.",
        supported: true,
      },
      {
        id: "performance_rankings",
        label: "Performance Rankings",
        description:
          "Drivers ordered by performance score, with rank, badges and monthly revenue.",
        supported: true,
      },
    ],
  },
  {
    section: "Earnings",
    reports: [
      {
        id: "monthly_revenue",
        label: "Monthly Revenue Report",
        description:
          "Monthly revenue split by driver and by city, including trip counts.",
        supported: true,
      },
    ],
  },
  {
    section: "Documents",
    reports: [
      {
        id: "document_expiration",
        label: "Document Expiration Report",
        description:
          "Every tracked driver document grouped by expiry bucket (valid, expiring within 30/15/7/1 days, expired).",
        supported: true,
      },
    ],
  },
];

/**
 * Report sections requested for the Reports tab that the backend does NOT
 * implement. Rendered as explicit gaps so no non-functional control appears.
 */
export const UNSUPPORTED_REPORTS = [
  {
    label: "Trip activity",
    reason:
      "No trip-activity report type exists. Only the live counters active_trips and waiting_riders are exposed, via the Daily Fleet Report.",
  },
  {
    label: "Cancellation analysis",
    reason:
      "No dedicated cancellation report exists. Per-driver cancellation rate is included in the Weekly Driver Report.",
  },
  {
    label: "Vehicle activity",
    reason:
      "No vehicle report type exists. The vehicles directory is read-only and exposes document expiry, not activity.",
  },
];

/**
 * Metrics requested for the Fleet Overview that this API does not provide.
 * Rendered as explicit unavailable states so no figure is ever fabricated.
 */
export const UNAVAILABLE_OVERVIEW_METRICS = [
  {
    id: "pending_approvals",
    label: "Pending approvals",
    reason:
      "GET /operations/fleet/dashboard/ exposes no pending-approval count. The backend computes it internally (operations.fleet_metrics -> drivers.pending) but the fleet overview payload omits it, and the driver rows are capped at 200 and ordered by performance, so a count derived from them would systematically under-report.",
  },
  {
    id: "active_vehicles",
    label: "Active vehicles",
    reason:
      "The vehicles directory has no 'active' concept — it exposes driver approval status and document expiry only. 'Road-legal vehicles' is shown instead, derived from real document states.",
  },
  {
    id: "fleet_trips",
    label: "Completed / cancelled trips",
    reason:
      "There is no fleet-wide trip total. Per-driver completed_rides and cancelled_rides are available, so those figures are summed across the loaded driver set and labelled accordingly.",
  },
];

/**
 * GET /cities/ — public city directory (AllowAny), grouped by region.
 * Used only to label the vehicle city filter with real city names.
 */
export function fetchCityDirectory() {
  return authenticatedApi.get(`${API_URL}/cities/`);
}

/**
 * Document states returned by GET /operations/vehicles/ (_document_state).
 * These are expiry-derived states only. "Pending verification" and "Rejected"
 * are NOT produced by this endpoint — document approval lives in the Fleet
 * Document Center, and this page links there instead of duplicating it.
 */
export const VEHICLE_DOCUMENT_STATES = {
  valid: { label: "Valid", tone: "ok" },
  expiring_soon: { label: "Expiring soon", tone: "warn" },
  expired: { label: "Expired", tone: "danger" },
  missing: { label: "Not uploaded", tone: "idle" },
  no_expiry_recorded: { label: "No expiry recorded", tone: "info" },
};

/** The four tracked vehicle document columns, in display order. */
export const VEHICLE_DOCUMENTS = [
  { key: "registration", label: "Registration", short: "REG" },
  { key: "insurance", label: "Insurance", short: "INS" },
  { key: "vignette", label: "Vignette", short: "VIG" },
  { key: "licence", label: "Driver's licence", short: "LIC" },
];

export function vehicleDocumentState(state) {
  return (
    VEHICLE_DOCUMENT_STATES[state] || { label: state || "Unknown", tone: "idle" }
  );
}



