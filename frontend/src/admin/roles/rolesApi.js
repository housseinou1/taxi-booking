/**
 * YALA Admin — Roles & Permissions API client (Phase 10).
 *
 * Two read-only helpers (role registry + staff accounts) and two CEO-governed
 * mutations (role assignment, staff access). Every mutation requires a reason and
 * the backend refuses protected Founder/CEO accounts — the UI only mirrors that
 * rule, it never assumes it.
 */
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/admin/roles`;

export function buildRoleQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET /operations/admin/roles/ — role registry, modules, limits, catalogue. */
export async function fetchRoleRegistry() {
  const response = await authenticatedApi.get(`${BASE}/`);
  return response.data;
}

/** GET /operations/admin/roles/accounts/ — staff accounts + protection flags. */
export async function fetchRoleAccounts(params = {}) {
  const response = await authenticatedApi.get(
    `${BASE}/accounts/${buildRoleQuery(params)}`
  );
  return response.data;
}

/** POST /operations/admin/roles/accounts/<id>/role/ — assign an admin role. */
export async function assignAccountRole(userId, role, reason) {
  const response = await authenticatedApi.post(
    `${BASE}/accounts/${userId}/role/`,
    { role, reason }
  );
  return response.data;
}

/** POST /operations/admin/roles/accounts/<id>/access/ — grant/revoke access. */
export async function setStaffAccess(userId, enabled, reason) {
  const response = await authenticatedApi.post(
    `${BASE}/accounts/${userId}/access/`,
    { enabled, reason }
  );
  return response.data;
}

/** Client-side mirror of the backend protection rule (never a substitute). */
export function isProtectedAccount(account) {
  if (!account) return false;
  return Boolean(account.protected || account.is_superuser);
}
