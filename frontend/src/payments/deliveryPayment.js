import { DELIVERY_PAYMENT_METHODS } from "./paymentApi";
import { beginMoosylCheckout, isMoosylMethod } from "./moosylCheckout";

/** Human labels for every method a checkout may offer (canonical provider ids). */
export const DELIVERY_METHOD_LABELS = {
  card: { label: "Debit/Credit Card", payLabel: "Pay with Card" },
  bankily: { label: "Bankily", payLabel: "Pay with Bankily" },
  masravi: { label: "Masravi", payLabel: "Pay with Masravi" },
  masrvi: { label: "Masravi", payLabel: "Pay with Masravi" },
  sedad: { label: "Sedad", payLabel: "Pay with Sedad" },
  seddad: { label: "Sedad", payLabel: "Pay with Sedad" },
  cash: { label: "Cash", payLabel: "Pay with Cash" },
};

/**
 * Methods to offer for a delivery.
 *
 * `availableMethods` comes from `GET /payments/options/`, so cash appears only when the
 * backend allows it and the bank apps only when Moosyl reports them enabled. Falls back
 * to the historical list when the backend has not been consulted.
 */
export function deliveryMethodsFor(availableMethods) {
  if (!Array.isArray(availableMethods) || !availableMethods.length) {
    return [...DELIVERY_PAYMENT_METHODS];
  }
  return availableMethods
    .filter((method) => DELIVERY_METHOD_LABELS[method])
    .map((method) => ({ value: method, ...DELIVERY_METHOD_LABELS[method] }));
}

export function getDeliveryPaymentLabel(method) {
  return DELIVERY_METHOD_LABELS[method]?.label || "Debit/Credit Card";
}

export function getDeliveryPayButtonLabel(method, amount) {
  const total = Number(amount || 0);
  const entry = DELIVERY_METHOD_LABELS[method];
  if (!entry) {
    return `Pay ${total} MRU`;
  }
  if (method === "card") {
    return `Pay ${total} MRU`;
  }
  return entry.payLabel;
}

/**
 * Start a delivery payment.
 *
 * Moosyl bank apps hand off to the hosted checkout and are confirmed by the backend
 * webhook; every other method keeps its existing handler. Nothing here reports a
 * delivery as paid.
 */
export async function submitDeliveryPayment({
  deliveryId,
  method,
  phoneNumber = "",
  payWithWallet,
} = {}) {
  if (!deliveryId) {
    throw new Error("Delivery ID is required.");
  }

  if (isMoosylMethod(method)) {
    const checkout = await beginMoosylCheckout({ deliveryId, phoneNumber });
    return {
      payment: null,
      checkout,
      awaitingBackend: true,
      pendingVerification: true,
      message: "Complete the payment in your bank app. We confirm it automatically.",
    };
  }

  if (method === "wallet" && typeof payWithWallet === "function") {
    const payment = await payWithWallet();
    return {
      payment,
      awaitingBackend: false,
      pendingVerification: false,
      message: "Delivery paid from your YALA wallet.",
    };
  }

  if (method === "cash") {
    // Cash is allowed only when the owner relaxes the cashless policy. The courier
    // confirms receipt; the normal commission split is recorded either way.
    return {
      payment: null,
      awaitingBackend: true,
      pendingVerification: true,
      message: "Cash recorded. The courier will confirm receipt.",
    };
  }

  throw new Error(`Unsupported delivery payment method: ${method}`);
}

