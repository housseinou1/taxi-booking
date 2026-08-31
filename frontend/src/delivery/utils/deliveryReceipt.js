import { formatMoney } from "../../marketConfig";

export function buildDeliveryReceiptText(delivery) {
  const earning = Number(delivery?.driver_earning || delivery?.fare || 0);
  const paidAt = delivery?.delivered_at || delivery?.updated_at || delivery?.created_at;
  const dateLabel = paidAt ? new Date(paidAt).toLocaleString() : "Unknown";

  return [
    `Yala Delivery Receipt #${delivery?.id}`,
    `Route: ${delivery?.pickup || "Pickup"} -> ${delivery?.destination || "Destination"}`,
    `Status: ${(delivery?.status || "delivered").replace(/_/g, " ")}`,
    `Category: ${delivery?.service_category || delivery?.package_type || "parcel"}`,
    `Your earning: ${formatMoney(earning)}`,
    `Completed: ${dateLabel}`,
  ].join("\n");
}

export function shareDeliveryReceipt(delivery) {
  const text = buildDeliveryReceiptText(delivery);
  if (navigator.share) {
    return navigator.share({ title: `Yala delivery #${delivery.id}`, text });
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  window.prompt("Copy this receipt:", text);
  return Promise.resolve();
}

export function filterDeliveryHistory(orders, query = "") {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return orders;

  return orders.filter((item) => {
    const haystack = [
      item.id,
      item.pickup,
      item.destination,
      item.recipient_name,
      item.customer_name,
      item.merchant_name,
      item.restaurant_name,
      item.store_name,
      item.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function getDeliveryMerchantLabel(delivery) {
  return (
    delivery?.merchant_name ||
    delivery?.restaurant_name ||
    delivery?.store_name ||
    ""
  ).trim();
}
