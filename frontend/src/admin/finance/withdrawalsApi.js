/**
 * YALA Admin — Finance & Withdrawals API client (Phase 7).
 *
 * READ-ONLY BY DESIGN. Every function here performs a GET. There is deliberately
 * no approve / reject / mark-paid / transfer helper: withdrawal state transitions
 * and wallet mutations stay frozen, and the backend endpoints that perform them
 * are not called from this module.
 *
 * All calls go through the shared authenticated client built off API_URL (Bearer
 * token + refresh handled there). No base URLs or auth headers are hardcoded.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/payments/admin`;

export function buildFinanceQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /payments/admin/finance/overview/ — read-only finance KPIs. */
export async function fetchFinanceOverview() {
  const response = await authenticatedApi.get(`${BASE}/finance/overview/`);
  return response.data;
}

/**
 * GET /payments/admin/withdrawals/ — paginated, filterable withdrawal queue.
 * Supported params: status, payout_type, search, date_from, date_to, min_amount,
 * max_amount, ordering, page, page_size.
 */
export async function fetchAdminWithdrawals(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/withdrawals/${buildFinanceQuery(params)}`
  );
  return response.data;
}

/**
 * GET /payments/admin/withdrawals/<id>/ — read-only review detail.
 * Includes the stored status timeline, wallet snapshot and the frozen-actions
 * notice; it offers no action.
 */
export async function fetchWithdrawalDetail(withdrawalId) {
  const response = await authenticatedApi.get(`${BASE}/withdrawals/${withdrawalId}/`);
  return response.data;
}

/**
 * Capability check for the sensitive review block (requester contact details,
 * payout destination, wallet snapshot).
 *
 * Uses the finance capabilities published in the admin permissions payload and
 * is fail-CLOSED: without an explicit grant the block is not rendered. The
 * backend remains authoritative — the data is admin-gated server-side either way.
 */
export function canReviewWithdrawals(permissions) {
  if (!permissions) return false;
  const actions = permissions.actions || {};
  if ("finance.approve_withdrawal" in actions) {
    return Boolean(actions["finance.approve_withdrawal"]);
  }
  // Older payloads without finance capabilities: only the CEO tier may review.
  return Boolean(permissions.elevated) || permissions.role === "ceo";
}

export const WITHDRAWAL_STATUS_TONES = {
  // Kept in sync with the queue/drawer tone maps: amber for pending.
  pending: "warning",
  approved: "success",
  rejected: "danger",
  paid: "success",
};

export const WITHDRAWAL_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
];

export const PAYOUT_TYPE_OPTIONS = [
  { value: "", label: "All payout types" },
  { value: "bank_account", label: "Bank account" },
  { value: "card", label: "Card" },
  { value: "bankily", label: "Bankily" },
  { value: "masrvi", label: "Masravi" },
  { value: "seddad", label: "Seddad" },
];

export const WITHDRAWAL_ORDERING_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Amount (high → low)" },
  { value: "amount_asc", label: "Amount (low → high)" },
];
