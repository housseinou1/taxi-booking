/**
 * Payment status vocabulary and customer messaging.
 *
 * This module is the **frontend** half of the rule enforced on the server by
 * `payments/provider_security.py`:
 *
 *   * `ProviderResult.is_settled` is only true for a **live, verified, succeeded**
 *     provider response.
 *   * `apply_verified_confirmation()` raises `ProviderResponseUnverified` for
 *     anything else — including every mock/sandbox result.
 *
 * Consequences the UI must respect, and which this module encodes:
 *
 *   1. Choosing a provider never settles a payment.
 *   2. Submitting a payment reference never settles a payment.
 *   3. A settled state comes **only** from a backend status of `paid`.
 *   4. While the backend says pending/authorized/pending_verification the UI must
 *      show a pending state — never a confirmation and never a receipt.
 *
 * Status values come from `payments/models.py`:
 *   Payment.PAYMENT_STATUS_CHOICES       → pending | authorized | pending_verification |
 *                                          paid | failed | cancelled | refunded
 *   PaymentRecord.STATUS_CHOICES         → pending | authorized | paid | failed |
 *                                          refunded | cancelled
 */

export const SETTLED_STATUS = "paid";

/** Statuses that mean "submitted, awaiting independent provider verification". */
export const PENDING_STATUSES = ["pending", "authorized", "pending_verification"];

/** Statuses that mean the attempt is over and no money moved. */
export const FAILED_STATUSES = ["failed", "cancelled"];

export function normalizePaymentStatus(status) {
  return String(status || "").trim().toLowerCase();
}

/** True only for a backend-confirmed settlement. */
export function isSettledPaymentStatus(status) {
  return normalizePaymentStatus(status) === SETTLED_STATUS;
}

export function isPendingPaymentStatus(status) {
  return PENDING_STATUSES.includes(normalizePaymentStatus(status));
}

export function isFailedPaymentStatus(status) {
  return FAILED_STATUSES.includes(normalizePaymentStatus(status));
}

/**
 * Describe a backend payment status for display.
 *
 * `tone` is one of `pending` | `settled` | `failed` | `unknown`.
 * `settled` is the single flag a caller may use to reveal a receipt: it is true
 * **only** for a verified settlement, so a receipt can never appear for a
 * provider selection, a submitted reference, or a mock result.
 */
export function describePaymentStatus(status) {
  const normalized = normalizePaymentStatus(status);

  if (isSettledPaymentStatus(normalized)) {
    return {
      status: normalized,
      tone: "settled",
      settled: true,
      titleKey: "payments.status.settledTitle",
      defaultTitle: "Payment confirmed",
      messageKey: "payments.status.settledMessage",
      defaultMessage:
        "Your provider confirmed this payment. Your receipt is available below.",
    };
  }

  if (isPendingPaymentStatus(normalized)) {
    return {
      status: normalized,
      tone: "pending",
      settled: false,
      titleKey: "payments.status.pendingTitle",
      defaultTitle: "Payment pending verification",
      messageKey: "payments.status.pendingMessage",
      defaultMessage:
        "We received your payment request and are waiting for the provider to confirm it independently. This is not a confirmation yet.",
    };
  }

  if (isFailedPaymentStatus(normalized)) {
    return {
      status: normalized,
      tone: "failed",
      settled: false,
      titleKey: "payments.status.failedTitle",
      defaultTitle: "Payment not completed",
      messageKey: "payments.status.failedMessage",
      defaultMessage:
        "This payment did not complete and no money was taken. You can try again with another method.",
    };
  }

  return {
    status: normalized,
    tone: "unknown",
    settled: false,
    titleKey: "payments.status.unknownTitle",
    defaultTitle: "Payment status unavailable",
    messageKey: "payments.status.unknownMessage",
    defaultMessage:
      "We could not read a verified status for this payment yet. Refresh to check again.",
  };
}

/**
 * Whether a receipt may be shown for this status.
 * Only a verified settlement qualifies — never a selection or a reference.
 */
export function canShowReceipt(status) {
  return isSettledPaymentStatus(status);
}

/**
 * Whether a wallet balance may be treated as credited for this status.
 * Mirrors the server rule: no wallet credit without verified settlement.
 */
export function canCreditWallet(status) {
  return isSettledPaymentStatus(status);
}
