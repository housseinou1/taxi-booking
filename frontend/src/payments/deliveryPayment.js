import { DELIVERY_PAYMENT_METHODS } from "./paymentApi";

export function getDeliveryPaymentLabel(method) {
  return (
    DELIVERY_PAYMENT_METHODS.find((item) => item.value === method)?.label ||
    "Debit/Credit Card"
  );
}

export function getDeliveryPayButtonLabel(method, amount) {
  const selected = DELIVERY_PAYMENT_METHODS.find((item) => item.value === method);
  const total = Number(amount || 0);
  if (!selected) {
    return `Pay ${total} MRU`;
  }
  if (method === "card") {
    return `Pay ${total} MRU`;
  }
  return selected.payLabel;
}
