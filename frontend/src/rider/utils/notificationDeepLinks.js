const RIDER_SAFE_ROUTES = new Set([
  "/rider-dashboard",
  "/rider",
  "/rider-history",
  "/history",
  "/rider-payments",
  "/wallet",
  "/payment-setup",
  "/settings",
  "/support",
  "/rider-notifications",
  "/rider-profile",
  "/saved-places",
  "/services",
  "/delivery",
]);

const AUTH_REQUIRED_PREFIXES = [
  "/rider-dashboard",
  "/rider-history",
  "/history",
  "/rider-payments",
  "/wallet",
  "/payment-setup",
  "/rider-notifications",
  "/rider-profile",
  "/saved-places",
];

function normalizePath(path = "") {
  if (!path) return null;
  const trimmed = String(path).trim();
  if (!trimmed.startsWith("/")) return `/${trimmed.replace(/^\/+/, "")}`;
  return trimmed.split("?")[0].split("#")[0];
}

function isAuthenticated() {
  const token = localStorage.getItem("access");
  return Boolean(token && token !== "null" && token !== "undefined");
}

function buildRidePath(rideId, fallback = "/rider-dashboard") {
  return rideId ? `/rider-dashboard?ride=${rideId}` : fallback;
}

function buildPaymentPath(rideId, paymentId) {
  if (paymentId) return `/rider-payments?payment=${paymentId}`;
  if (rideId) return `/rider-payments?ride=${rideId}`;
  return "/rider-payments";
}

function buildRefundPath(refundId, rideId) {
  if (refundId) return `/rider-payments?refund=${refundId}`;
  if (rideId) return `/rider-payments?ride=${rideId}&tab=refunds`;
  return "/rider-payments?tab=refunds";
}

function buildSupportPath(feedbackId, reference) {
  if (feedbackId) return `/support?ticket=${feedbackId}`;
  if (reference) return `/support?ref=${encodeURIComponent(reference)}`;
  return "/support";
}

function buildPromotionPath(promotionId) {
  return promotionId ? `/services?promo=${promotionId}` : "/services";
}

export function resolveRiderNotificationDeepLink(item = {}, options = {}) {
  const authenticated = options.isAuthenticated ?? isAuthenticated();
  const rawType = item.rawType || item.type || item.data?.type || "";
  const rideId = item.ride_id || item.data?.ride_id || item.rideId;
  const paymentId = item.payment_id || item.data?.payment_id;
  const refundId = item.refund_id || item.data?.refund_id;
  const feedbackId = item.data?.feedback_id || item.feedback_id;
  const reference = item.data?.reference || item.reference;
  const promotionId = item.data?.promotion_id || item.promotion_id;

  let target =
    normalizePath(item.url) ||
    normalizePath(item.deep_link) ||
    normalizePath(item.data?.deep_link);

  if (!target) {
    const categoryType = String(rawType).toLowerCase();
    switch (categoryType) {
      case "ride_accepted":
      case "driver_arriving":
      case "driver_arrived":
      case "ride_started":
      case "ride_start":
      case "ride_cancelled":
      case "chat_message":
        target = buildRidePath(rideId);
        break;
      case "ride_completed":
      case "receipt_ready":
        target = rideId ? `/rider-history?ride=${rideId}` : "/rider-history";
        break;
      case "payment_successful":
      case "payment_failed":
      case "payment_pending":
        target = buildPaymentPath(rideId, paymentId);
        break;
      case "refund_status":
      case "refund_approved":
      case "refund_rejected":
      case "refund_requested":
        target = buildRefundPath(refundId, rideId);
        break;
      case "support_reply":
      case "support_ticket_update":
      case "support_ticket":
        target = buildSupportPath(feedbackId, reference);
        break;
      case "promotion":
      case "offer":
      case "incentive":
        target = buildPromotionPath(promotionId);
        break;
      case "safety_alert":
      case "emergency_broadcast":
      case "sos":
        target = "/support?topic=emergency";
        break;
      case "announcement":
      case "platform_announcement":
      case "maintenance_notice":
      case "service_interruption":
        target = "/rider-notifications";
        break;
      default:
        target = "/rider-dashboard";
    }
  }

  if (!RIDER_SAFE_ROUTES.has(target) && !target.startsWith("/rider-dashboard")) {
    const pathname = target.split("?")[0];
    if (!RIDER_SAFE_ROUTES.has(pathname)) {
      target = "/rider-dashboard";
    }
  }

  if (!authenticated && AUTH_REQUIRED_PREFIXES.some((prefix) => target.startsWith(prefix))) {
    return "/login?next=" + encodeURIComponent(target);
  }

  return target;
}
