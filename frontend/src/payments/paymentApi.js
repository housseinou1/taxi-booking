import { API_URL } from "../apiConfig";
import { authHeaders } from "../delivery/DeliveryShared";
import { toRidePaymentMethod } from "./paymentMethods";

const BASE = `${API_URL}/payments`;

async function paymentRequest(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.detail || "Payment request failed.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function normalizeRidePaymentMethod(method = "card") {
  // Ride payments use the legacy spelling declared by
  // Payment.PAYMENT_METHOD_CHOICES (masrvi / seddad); the UI uses canonical
  // provider codes. That conversion lives in payments/paymentMethods.js so every
  // surface shares one rule instead of re-deriving it.
  return toRidePaymentMethod(method || "cash");
}

export function fetchWallet() {
  return paymentRequest("/wallet/");
}

export function fetchWalletHistory() {
  return paymentRequest("/wallet/history/");
}

export function topUpWallet(amount, method = "bankily", providerToken = "") {
  return paymentRequest("/wallet/top-up/", {
    method: "POST",
    body: JSON.stringify({
      amount,
      method,
      provider_token: providerToken,
    }),
  });
}

export function payDelivery(deliveryId, payload) {
  return paymentRequest(`/wallet/pay-delivery/${deliveryId}/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function payMerchantOrder(orderId, payload) {
  return paymentRequest(`/wallet/pay-merchant-order/${orderId}/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPaymentRecords() {
  return paymentRequest("/records/");
}

export function fetchMyPayments() {
  return paymentRequest("/my-payments/");
}

export function createRidePayment({ rideId, method = "card", tipPercentage = 0 }) {
  return paymentRequest("/create/", {
    method: "POST",
    body: JSON.stringify({
      ride_id: rideId,
      method: normalizeRidePaymentMethod(method),
      tip_percentage: tipPercentage,
    }),
  });
}

export function markRidePaid(rideId) {
  return paymentRequest(`/mark-paid/${rideId}/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function payRideWithWallet(rideId, tipPercentage = 0) {
  return paymentRequest(`/wallet/pay-ride/${rideId}/`, {
    method: "POST",
    body: JSON.stringify({
      tip_percentage: tipPercentage,
    }),
  });
}

export async function withPaymentRetry(operation, { retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error?.status === 0 || error?.status === 429 || error?.status >= 500;
      if (!retryable || attempt >= retries) break;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function fetchCourierWalletSummary() {
  return paymentRequest("/courier/summary/");
}

export function fetchMerchantWalletSummary() {
  return paymentRequest("/merchant/summary/");
}

export function requestMerchantPayout(amount, note = "") {
  return paymentRequest("/merchant/payouts/request/", {
    method: "POST",
    body: JSON.stringify({ amount, note }),
  });
}

export function fetchMerchantPayoutHistory() {
  return paymentRequest("/merchant/payouts/history/");
}

export function requestRefund(paymentRecordId, reason, note = "") {
  return paymentRequest("/refunds/request/", {
    method: "POST",
    body: JSON.stringify({
      payment_record_id: paymentRecordId,
      reason,
      note,
    }),
  });
}

export function fetchRefundRequests() {
  return paymentRequest("/refunds/");
}

export function fetchAdminPaymentDashboard() {
  return paymentRequest("/admin/dashboard/");
}

/**
 * The single source of truth for every checkout surface.
 *
 * Returns cash availability (driven by the backend cashless policy), the Moosyl bank
 * apps enabled for this environment, the commission split, and the fact that
 * confirmation comes only from a backend-verified webhook. The UI renders exactly this
 * instead of re-deriving availability, so the client can never drift from the server's
 * enforcement.
 */
export function fetchPaymentOptions() {
  return paymentRequest("/options/");
}

/**
 * Start a Moosyl hosted checkout for the caller's own ride or delivery.
 *
 * Returns `{ checkout_url, transaction_id, confirmation: "backend_webhook", ... }`.
 * Opening `checkout_url` is NOT proof of payment: the order is only marked paid after
 * the backend receives a signature-verified Moosyl webhook. Callers must refresh
 * payment status from the backend rather than trusting the redirect.
 */
export function startMoosylCheckout({
  rideId,
  deliveryId,
  phoneNumber = "",
  successUrl = "",
  cancelUrl = "",
} = {}) {
  const body = {};
  if (deliveryId) {
    body.delivery_id = deliveryId;
  } else {
    body.ride_id = rideId;
  }
  if (phoneNumber) body.phone_number = phoneNumber;
  if (successUrl) body.success_url = successUrl;
  if (cancelUrl) body.cancel_url = cancelUrl;
  return paymentRequest("/moosyl/checkout/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Bank apps Moosyl currently exposes (Bankily / Masravi / Sedad). Fail-soft. */
export function fetchMoosylMethods() {
  return paymentRequest("/moosyl/methods/");
}


/**
 * CEO Payment Management Center payload.
 *
 * Returns payout totals split by driver vs courier, refunds awaiting CEO
 * authorization, failed transactions, provider readiness, and the action-capability
 * map. Read-only: this endpoint never moves money.
 */
export function fetchPaymentsOversight(period = "weekly") {
  return paymentRequest(`/admin/payments/oversight/?period=${encodeURIComponent(period)}`);
}

export const DELIVERY_PAYMENT_METHODS = [
  { value: "card", label: "Debit/Credit Card", payLabel: "Pay with Card" },
  { value: "bankily", label: "Bankily", payLabel: "Pay with Bankily" },
  { value: "sedad", label: "Sedad", payLabel: "Pay with Sedad" },
  { value: "masravi", label: "Masravi", payLabel: "Pay with Masravi" },
];

export const PAYMENT_METHODS = DELIVERY_PAYMENT_METHODS;

export const REFUND_REASONS = [
  { value: "cancelled_order", label: "Cancelled order" },
  { value: "failed_delivery", label: "Failed delivery" },
  { value: "merchant_rejected", label: "Merchant rejected" },
  { value: "customer_complaint", label: "Customer complaint" },
];
