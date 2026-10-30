/**
 * YALA Admin — Security Operations Center API client (Phase 11).
 *
 * Read-only by design: every helper is a GET. No mutation, no approval, no export
 * trigger and no financial helper lives here — the console supervises security from
 * abroad, it never changes platform state.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/security/admin/console`;

export function buildConsoleQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /security/admin/console/overview/ — posture KPIs. */
export async function fetchSecurityOverview() {
  const response = await authenticatedApi.get(`${BASE}/overview/`);
  return response.data;
}

/** GET /security/admin/console/audit-stream/ — filterable audit stream. */
export async function fetchSecurityAuditStream(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/audit-stream/${buildConsoleQuery(params)}`
  );
  return response.data;
}

/** GET /security/admin/console/access-review/ — administrative access review. */
export async function fetchSecurityAccessReview(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/access-review/${buildConsoleQuery(params)}`
  );
  return response.data;
}

/** GET /security/admin/console/outstanding-issues/ — tracked open items. */
export async function fetchOutstandingIssues() {
  const response = await authenticatedApi.get(`${BASE}/outstanding-issues/`);
  return response.data;
}

export const AUDIT_ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "admin_action", label: "Admin action" },
  { value: "status_change", label: "Status change" },
  { value: "payment_change", label: "Payment change" },
  { value: "refund", label: "Refund" },
  { value: "document_approval", label: "Document approval" },
  { value: "verification_event", label: "Verification event" },
  { value: "fraud_flag", label: "Fraud flag" },
];

export const ENTITY_OPTIONS = [
  { value: "", label: "All entities" },
  { value: "system", label: "System" },
  { value: "driver", label: "Driver" },
  { value: "courier", label: "Courier" },
  { value: "customer", label: "Customer" },
  { value: "employee", label: "Employee" },
  { value: "id_card", label: "Employee ID card" },
  { value: "document", label: "Document" },
  { value: "delivery", label: "Delivery" },
  { value: "merchant", label: "Merchant" },
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
];

export const ACCESS_FLAG_OPTIONS = [
  { value: "", label: "All administrators" },
  { value: "protected", label: "Protected (Founder/CEO)" },
  { value: "no_totp", label: "Missing strong auth" },
  { value: "never_logged_in", label: "Never signed in" },
  { value: "stale_login", label: "Stale login (90+ days)" },
  { value: "superuser", label: "Superuser" },
];

/** Flag tone mapping used by the access-review chips. */
export const ACCESS_FLAG_TONES = {
  protected: "danger",
  superuser: "danger",
  no_totp: "warning",
  never_logged_in: "warning",
  stale_login: "warning",
  inactive: "danger",
};

export const ISSUE_STATUS_TONES = {
  blocked_by_design: "warning",
  blocked_dependency: "warning",
  ready_to_implement: "success",
  mitigated: "success",
  ok: "success",
  open: "warning",
  action_required_on_deploy: "warning",
};
