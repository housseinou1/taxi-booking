export const CUSTOMER_STATUS_LABELS = {
  order_confirmed: "Order confirmed",
  merchant_accepted: "Merchant accepted",
  preparing: "Preparing order",
  ready_for_pickup: "Ready for pickup",
  finding_courier: "Finding courier",
  courier_assigned: "Courier assigned",
  courier_going_to_pickup: "Courier going to pickup",
  picked_up: "Picked up",
  on_the_way: "On the way",
  arriving_soon: "Arriving soon",
  delivery_exception: "Delivery confirmation issue. Yala support is reviewing.",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_ORDER = {
  order_confirmed: 0,
  merchant_accepted: 1,
  preparing: 2,
  ready_for_pickup: 3,
  finding_courier: 4,
  courier_assigned: 5,
  courier_going_to_pickup: 6,
  picked_up: 7,
  on_the_way: 8,
  arriving_soon: 9,
  delivery_exception: 9,
  delivered: 10,
  cancelled: -1,
};

const MERCHANT_TO_DISPLAY = {
  new_order: "order_confirmed",
  accepted: "merchant_accepted",
  preparing: "preparing",
  ready_for_pickup: "ready_for_pickup",
};

const DELIVERY_TO_DISPLAY = {
  requested: "finding_courier",
  accepted: "courier_assigned",
  courier_arriving: "courier_going_to_pickup",
  picked_up: "picked_up",
  in_transit: "on_the_way",
  delivering: "on_the_way",
  delivery_exception: "delivery_exception",
  delivered: "delivered",
  cancelled: "cancelled",
};

export const VERTICAL_TIMELINE_STEPS = [
  { key: "order_confirmed", label: "Order confirmed", merchantOnly: true },
  { key: "preparing", label: "Preparing", merchantOnly: true },
  { key: "courier_assigned", label: "Courier assigned" },
  { key: "picked_up", label: "Picked up" },
  { key: "on_the_way", label: "In transit" },
  { key: "delivery_exception", label: "Support review" },
  { key: "delivered", label: "Delivered" },
];

export function resolveCustomerDisplayStatus(delivery = {}, etaMinutes = null) {
  if (delivery.customer_display_status) return delivery.customer_display_status;
  if (delivery.status === "delivered") return "delivered";
  if (delivery.status === "delivery_exception") return "delivery_exception";
  if (delivery.status === "cancelled") return "cancelled";

  const merchant = delivery.merchant_order;
  if (merchant?.status && delivery.status === "requested" && !delivery.driver) {
    return MERCHANT_TO_DISPLAY[merchant.status] || "order_confirmed";
  }

  const mapped = DELIVERY_TO_DISPLAY[delivery.status] || "finding_courier";
  if (
    ["on_the_way", "picked_up", "arriving_soon"].includes(mapped) &&
    (delivery.arriving_soon || delivery.near_dropoff_notified || (etaMinutes != null && etaMinutes <= 3))
  ) {
    return "arriving_soon";
  }
  return mapped;
}

export function getStatusLabel(delivery = {}, etaMinutes = null) {
  const key = resolveCustomerDisplayStatus(delivery, etaMinutes);
  return CUSTOMER_STATUS_LABELS[key] || "In progress";
}

export function getTimelineSteps(delivery = {}, etaMinutes = null) {
  const current = resolveCustomerDisplayStatus(delivery, etaMinutes);
  const currentIndex = STATUS_ORDER[current] ?? 0;
  const hasMerchant = Boolean(delivery.merchant_order?.id || delivery.merchant_name);

  return VERTICAL_TIMELINE_STEPS.filter((step) => !step.merchantOnly || hasMerchant).map((step) => {
    const stepIndex = STATUS_ORDER[step.key] ?? 0;
    let state = "pending";
    if (current === "delivered" && step.key === "delivered") state = "done";
    else if (stepIndex < currentIndex) state = "done";
    else if (step.key === current || (current === "arriving_soon" && step.key === "on_the_way")) state = "active";
    else if (current === "delivered") state = "done";
    return { ...step, state };
  });
}

export function shouldShowPlate(courierType = "") {
  const type = String(courierType || "").toLowerCase();
  return type === "motorcycle" || type === "car";
}

export function formatDeliveryDuration(minutes) {
  if (!minutes && minutes !== 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}
