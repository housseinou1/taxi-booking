/**
 * Moosyl checkout handoff for YALA Rider and YALA Delivery.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE
 * -----------------------------------------
 * Starting a checkout is NOT a payment. This module only obtains Moosyl's hosted
 * `checkout_url` and navigates the customer there. Nothing here marks an order paid,
 * and nothing here reads the redirect back as confirmation — Moosyl's own docs say
 * reaching the success URL proves nothing because anyone can open it.
 *
 * The order becomes paid only when the backend receives a signature-verified Moosyl
 * webhook and settles it exactly once. The customer's app therefore waits on the
 * backend's state (`payments/paymentStatus.js` and the existing polling), never on the
 * browser's return.
 */

import { startMoosylCheckout } from "./paymentApi";
import { isMobileMoneyProvider, toCanonicalProvider } from "./paymentMethods";

/** Methods Moosyl actually collects (YALA's bank apps). */
export const MOOSYL_METHODS = ["bankily", "masravi", "sedad"];

/**
 * True when this method should be routed through Moosyl.
 *
 * Accepts both spellings so a legacy ride value (`masrvi`, `seddad`) still routes
 * correctly. `card`, `wallet` and `cash` are NOT Moosyl flows and must keep their
 * existing handlers.
 */
export function isMoosylMethod(method) {
  return isMobileMoneyProvider(method) && MOOSYL_METHODS.includes(toCanonicalProvider(method));
}

/**
 * Navigate the browser to Moosyl's hosted checkout page.
 *
 * `navigate` exists so a host app can supply its own router-based navigation (and so the
 * behaviour is testable without fighting a read-only `window.location`). It defaults to
 * a real browser navigation.
 */
export function openCheckoutUrl(url, navigate) {
  if (!url) return false;
  const target =
    typeof navigate === "function"
      ? navigate
      : typeof window !== "undefined" && window.location
        ? (destination) => window.location.assign(destination)
        : null;
  if (!target) return false;
  target(url);
  return true;
}

/**
 * Begin a Moosyl checkout for the caller's own ride or delivery.
 *
 * Resolves with a *handoff* descriptor — never a settled payment:
 *
 *   { started: true, checkoutUrl, transactionId, method: "backend_webhook" }
 *
 * Throws when the backend refuses (not configured, not your order, already paid, or
 * the provider is unreachable). Callers must surface the error and leave the order
 * unpaid; they must not fall back to marking it paid.
 */
export async function beginMoosylCheckout({
  rideId,
  deliveryId,
  phoneNumber = "",
  successUrl = "",
  cancelUrl = "",
  redirect = false,
  navigate,
} = {}) {
  if (!rideId && !deliveryId) {
    throw new Error("A ride or delivery is required to start a payment.");
  }

  const response = await startMoosylCheckout({
    rideId,
    deliveryId,
    phoneNumber,
    successUrl,
    cancelUrl,
  });

  const checkoutUrl = response?.checkout_url || "";
  if (!checkoutUrl) {
    const error = new Error("Moosyl did not return a checkout page.");
    error.code = "no_checkout_url";
    error.data = response;
    throw error;
  }

  if (redirect) openCheckoutUrl(checkoutUrl, navigate);

  return {
    started: true,
    checkoutUrl,
    transactionId: response.transaction_id || "",
    amountMru: response.amount_mru || "",
    environment: response.environment || "",
    // Documented contract: only the backend webhook may settle this order.
    method: response.confirmation || "backend_webhook",
    settled: false,
  };
}

/**
 * Poll the backend until the order is settled, or the deadline passes.
 *
 * This is the only legitimate way for the UI to learn a payment succeeded: it asks the
 * backend, which is the sole holder of webhook-verified truth. Returns the final
 * payment (or null on timeout) — never a locally invented success.
 */
export async function waitForBackendSettlement({
  fetchPayment,
  isSettled,
  attempts = 10,
  intervalMs = 3000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof fetchPayment !== "function" || typeof isSettled !== "function") {
    throw new Error("waitForBackendSettlement needs fetchPayment and isSettled.");
  }
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetchPayment();
    if (isSettled(last)) return last;
    if (attempt < attempts - 1) await sleep(intervalMs);
  }
  return last;
}
