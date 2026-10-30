/**
 * YALA Admin — CEO Control Center API client (Phase 8).
 *
 * CEO-only surface (backend enforces CEO / Super Admin groups):
 *  - approvals inbox   (read-only: what awaits CEO authority)
 *  - account directory (read-only cross-domain account search)
 *  - account actions   (suspend / reactivate / block — reason mandatory, audited)
 *  - CEO audit trail   (read-only accountability trail)
 *
 * The action helper never touches money: it changes account access only, and the
 * backend records every call in the platform audit trail.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/ceo`;

export function buildCeoQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /operations/ceo/approvals/ — read-only CEO approvals inbox. */
export async function fetchCeoApprovals(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/approvals/${buildCeoQuery(params)}`
  );
  return response.data;
}

/**
 * GET /operations/ceo/accounts/ — read-only account directory.
 * Params: search, domain, status, city, ordering, page, page_size.
 */
export async function fetchCeoAccounts(params = {}) {
  const response = await authenticatedApi.get(`${BASE}/accounts/${buildCeoQuery(params)}`);
  return response.data;
}

/**
 * POST /operations/ceo/accounts/<user_id>/action/ — suspend / reactivate / block.
 * `reason` is mandatory (>= 5 chars) and is recorded in the audit trail.
 * This never changes a wallet balance, payout state or transfer.
 */
export async function ceoAccountAction(userId, action, reason) {
  const response = await authenticatedApi.post(`${BASE}/accounts/${userId}/action/`, {
    action,
    reason,
  });
  return response.data;
}

/**
 * GET /operations/ceo/audit/ — read-only CEO audit trail.
 * scope: "me" (own actions, includes IP) | "all" (high-authority actions).
 */
export async function fetchCeoAuditTrail(params = {}) {
  const response = await authenticatedApi.get(`${BASE}/audit/${buildCeoQuery(params)}`);
  return response.data;
}

export const ACCOUNT_DOMAIN_OPTIONS = [
  { value: "", label: "All accounts" },
  { value: "rider", label: "Riders" },
  { value: "driver", label: "Drivers" },
  { value: "courier", label: "Couriers" },
  { value: "merchant", label: "Merchants" },
  { value: "employee", label: "Employees" },
  { value: "staff", label: "Staff" },
];

export const ACCOUNT_STATUS_OPTIONS = [
  { value: "", label: "All states" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Suspended / blocked" },
];

export const CEO_ACTION_OPTIONS = [
  { value: "suspend", label: "Suspend account" },
  { value: "block", label: "Block account" },
  { value: "reactivate", label: "Reactivate account" },
];

export const APPROVAL_GROUP_LABELS = {
  refunds: "Refunds",
  withdrawals: "Withdrawals",
  drivers: "Driver onboarding",
  couriers: "Courier onboarding",
  riders: "Rider onboarding",
  merchants: "Merchant onboarding",
};
