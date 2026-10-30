import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/employees`;

// ── Directory / CRUD ────────────────────────────────────────────────────────

export function fetchEmployees(params = {}) {
  return authenticatedApi.get(`${BASE}/`, { params });
}

export function registerEmployee(body = {}) {
  // employee_number is SERVER-generated and MUST NOT be sent.
  // employment_status is NOT set at create time.
  const payload = {
    full_name: body.full_name,
    date_of_birth: body.date_of_birth || null,
    department: body.department,
    job_title: body.job_title,
    employment_start_date: body.employment_start_date || null,
  };
  return authenticatedApi.post(`${BASE}/`, payload);
}

export function fetchEmployee(employeeNumber) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/`);
}

export function updateEmployee(employeeNumber, body = {}) {
  // employee_number and employment_status are read-only — never PATCHed here.
  const payload = {
    full_name: body.full_name,
    date_of_birth: body.date_of_birth || null,
    department: body.department,
    job_title: body.job_title,
    employment_start_date: body.employment_start_date || null,
  };
  return authenticatedApi.patch(`${BASE}/${employeeNumber}/`, payload);
}

export function changeEmploymentStatus(employeeNumber, body = {}) {
  // HR Manager tier (enforced server-side).
  return authenticatedApi.post(`${BASE}/${employeeNumber}/status/`, body);
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function fetchCards(employeeNumber) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/cards/`);
}

export function issueCard(employeeNumber) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/issue/`);
}

export function renewCard(employeeNumber) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/renew/`);
}

export function replaceCard(employeeNumber, body = {}) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/replace/`, body);
}

export function activateCard(employeeNumber, cardPk) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/${cardPk}/activate/`);
}

export function deactivateCard(employeeNumber, cardPk) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/${cardPk}/deactivate/`);
}

export function revokeCard(employeeNumber, cardPk, body = {}) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/cards/${cardPk}/revoke/`, body);
}

// ── Photographs (authenticated binary; never public, never persisted) ────────

export function fetchPhoto(employeeNumber) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/photo/`, {
    responseType: "blob",
  });
}

export function uploadPhoto(employeeNumber, file) {
  const formData = new FormData();
  formData.append("photo", file);
  return authenticatedApi.post(`${BASE}/${employeeNumber}/photo/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

// ── Electronic signature (authenticated PNG; never a public URL) ─────────────

/**
 * GET /employees/<employee_number>/signature/ — the employee's own signature as a PNG
 * blob. HR-tier gated and served `private, no-store`, so it must be fetched with the
 * authenticated client and never linked directly.
 */
export function fetchSignature(employeeNumber) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/signature/`, {
    responseType: "blob",
  });
}

/**
 * POST /employees/<employee_number>/signature/ — record or replace the employee's
 * signature. HR Manager tier. `consent` must be true: the signature has to be provided or
 * approved by the employee, and the backend refuses the upload otherwise. `source` records
 * whether it came from the signature pad ("pad") or an uploaded image ("upload").
 */
export function uploadSignature(employeeNumber, file, { source = "upload", consent = false } = {}) {
  const formData = new FormData();
  formData.append("signature", file, file?.name || "signature.png");
  formData.append("source", source);
  formData.append("consent", consent ? "true" : "false");
  return authenticatedApi.post(`${BASE}/${employeeNumber}/signature/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * POST /employees/<employee_number>/signature/remove/ — remove an incorrect signature.
 * Employee Administrator tier, always audited. (A POST sub-route rather than an HTTP
 * DELETE, matching the existing cards/<pk>/revoke convention.)
 */
export function removeSignature(employeeNumber) {
  return authenticatedApi.post(`${BASE}/${employeeNumber}/signature/remove/`);
}

// ── ID-card QR (authenticated PNG; never a public URL) ──────────────────────

/**
 * GET /employees/<employee_number>/cards/<card_pk>/qr/ — the card's verification
 * QR as a PNG blob. The QR encodes only the opaque card uuid; the endpoint is
 * HR-tier gated, so it must be fetched with the authenticated client.
 */
export function fetchCardQr(employeeNumber, cardPk, params = {}) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/cards/${cardPk}/qr/`, {
    params,
    responseType: "blob",
  });
}

/**
 * GET /employees/<employee_number>/cards/<card_pk>/pdf/ — the complete employee ID
 * card as a **two-page CR80 PDF** (page 1 front, page 2 back), generated per request
 * server-side and audited. This is a READ-ONLY operation: it never renews, replaces,
 * activates, deactivates or revokes the card, and never changes the employee record.
 */
export function fetchCardPdf(employeeNumber, cardPk) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/cards/${cardPk}/pdf/`, {
    responseType: "blob",
  });
}

// ── Audit trail (Administrator tier) ────────────────────────────────────────

/**
 * GET /employees/<employee_number>/audit/ — read-only lifecycle + ID-card audit
 * trail for one employee. Administrator tier only (enforced server-side).
 */
export function fetchEmployeeAuditTrail(employeeNumber, params = {}) {
  return authenticatedApi.get(`${BASE}/${employeeNumber}/audit/`, { params });
}

// ── Role tier derivation ─────────────────────────────────────────────────────
//
// Tier derivation. Phase 5.5 added explicit employee capability flags to the
// permissions payload (actions["employees.manage_cards"], ["employees.administer"]).
// We PREFER those flags when present. When they are absent (older payload), we
// fall back to the role/group heuristic, and if that too lacks a usable signal
// we SHOW the buttons and rely on graceful backend 403 handling (never hide a
// button for security — the backend DRF permission classes are the real gate).

const MANAGER_ROLES = new Set([
  "hr_manager",
  "hr_admin",
  "administrator",
  "admin",
  "ceo",
]);

const ADMIN_ROLES = new Set([
  "administrator",
  "admin",
  "hr_admin",
  "ceo",
]);

function collectRoleSignals(permissions) {
  const signals = [];
  if (permissions?.role) signals.push(String(permissions.role).toLowerCase());
  (permissions?.groups || []).forEach((group) => {
    if (group) signals.push(String(group).toLowerCase());
  });
  return signals;
}

export function deriveEmployeeTier(permissions) {
  if (!permissions) {
    return { canManage: false, canAdminister: false, viewDob: false, derivable: false };
  }

  // Prefer explicit capability flags (Phase 5.5). These are authoritative for
  // UX gating when the backend provides them.
  const actions = permissions.actions || {};
  if (
    "employees.manage_cards" in actions ||
    "employees.administer" in actions
  ) {
    const canAdminister = Boolean(actions["employees.administer"]);
    const canManage = canAdminister || Boolean(actions["employees.manage_cards"]);
    // DOB is fail-CLOSED: it is shown only when the backend explicitly grants
    // employees.view_dob. An absent flag never reveals DOB.
    const viewDob = Boolean(actions["employees.view_dob"]);
    return { canManage, canAdminister, viewDob, derivable: true };
  }

  // CEO / elevated users bypass all gates (consistent with PermissionContext).
  if (permissions.elevated || permissions.role === "ceo") {
    return { canManage: true, canAdminister: true, viewDob: true, derivable: true };
  }

  const signals = collectRoleSignals(permissions);
  const hasKnownSignal = signals.some(
    (signal) => MANAGER_ROLES.has(signal) || ADMIN_ROLES.has(signal)
  );

  if (!hasKnownSignal) {
    // Cannot reliably classify — show buttons, rely on 403 handling. DOB stays
    // hidden (fail-closed): it requires an explicit backend capability.
    return { canManage: true, canAdminister: true, viewDob: false, derivable: false };
  }

  const canAdminister = signals.some((signal) => ADMIN_ROLES.has(signal));
  const canManage =
    canAdminister || signals.some((signal) => MANAGER_ROLES.has(signal));

  return { canManage, canAdminister, viewDob: canAdminister, derivable: true };
}

/**
 * Can the current user read an employee's date of birth?
 *
 * DOB is sensitive HR data gated by the backend field-level permission
 * (employees.view_dob / Administrator tier). The backend is authoritative — it
 * omits the field entirely from responses for anyone else — and this helper is
 * used only to decide whether to render the (possibly absent) value.
 * Fail-closed: without an explicit capability the UI never shows DOB.
 */
export function canViewEmployeeDob(permissions) {
  if (!permissions) return false;
  const actions = permissions.actions || {};
  if ("employees.view_dob" in actions) {
    return Boolean(actions["employees.view_dob"]);
  }
  return deriveEmployeeTier(permissions).viewDob;
}

// ── Status display mappings ──────────────────────────────────────────────────

export const EMPLOYMENT_STATUS_TONES = {
  active: "success",
  inactive: "neutral",
  suspended: "warning",
  terminated: "danger",
};

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
];

// Card statuses map to a DISPLAY label + tone. "Expiring Soon" is computed
// client-side from expires_at and is DISPLAY ONLY — never a backend status.
export const CARD_STATUS_LABELS = {
  valid: { label: "Active", tone: "success" },
  expired: { label: "Expired", tone: "danger" },
  revoked: { label: "Revoked", tone: "danger" },
  replaced: { label: "Replaced", tone: "neutral" },
  deactivated: { label: "Deactivated", tone: "neutral" },
};

export const EXPIRING_SOON_DAYS = 60;

/**
 * Compute the client-side display label/tone for a card.
 * A `valid` card whose expires_at is within EXPIRING_SOON_DAYS of now is shown
 * as "Expiring Soon" (warning) — a display indicator only, never sent to the
 * backend and never an override of expires_at.
 */
export function resolveCardDisplayStatus(card, now = new Date()) {
  if (!card || !card.status) {
    return { label: "Unknown", tone: "neutral" };
  }
  const base = CARD_STATUS_LABELS[card.status] || { label: card.status, tone: "neutral" };
  if (card.status === "valid" && card.expires_at) {
    const expires = new Date(card.expires_at);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / msPerDay);
    if (daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS) {
      return { label: "Expiring Soon", tone: "warning" };
    }
  }
  return base;
}
