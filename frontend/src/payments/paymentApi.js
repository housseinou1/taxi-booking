import { API_URL } from "../apiConfig";
import { authHeaders } from "../delivery/DeliveryShared";

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
    throw new Error(data.error || data.detail || "Payment request failed.");
  }
  return data;
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
