import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/payments`;

/**
 * Moosyl overview for the Admin Finance Dashboard (read-only).
 *
 * Returns the provider environment, settlement gating, the 1% fee, the webhook URL,
 * the webhook outcome counts (settled / duplicate / ignored / rejected) and the most
 * recent events. Finance-module gated server-side; this never starts a payment and
 * never touches driver payouts (Moosyl cannot disburse to a driver).
 */
export function fetchMoosylOverview() {
  return authenticatedApi.get(`${BASE}/admin/moosyl/`);
}
