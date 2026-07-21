import { getAppType, isTaxiDriverContext } from "../native/platform";

const ADMIN_PAGES = new Set(["admin", "admin-share-analytics", "delivery-admin", "admin-payments", "admin-executive", "admin-operations", "admin-ai-operations", "admin-status", "admin-launch"]);

const MERCHANT_PAGES = new Set(["merchant", "merchant-register", "merchant-legal-sign"]);

const DRIVER_PAGES = new Set([
  "driver",
  "driver-profile",
  "driver-premium-profile",
  "driver-profile-edit",
  "driver-documents",
  "driver-code",
  "driver-earnings",
  "driver-feedback",
  "driver-support",
  "driver-achievements",
  "driver-hall-of-fame",
  "driver-history",
  "delivery-driver",
  "delivery-profile-setup",
  "delivery-vehicle-setup",
  "delivery-account",
  "delivery-bank",
  "delivery-earnings",
  "delivery-documents",
  "delivery-profile-edit",
  "delivery-settings",
  "delivery-courier-terms",
  "delivery-courier-legal-sign",
  "driver-legal-sign",
  "driver-vehicle-setup",
]);

const RIDER_PAGES = new Set([
  "payment-setup",
  "rider",
  "rider-dashboard",
  "rider-legal-accept",
  "rider-history",
  "rider-ride-history",
  "rider-reviews",
  "saved-places",
  "rider-profile",
  "rider-payments",
  "share-booking",
  "share-ride",
  "share-ride-complete",
]);

/** Customer delivery + merchant flows are open on web (any role may browse/order/register). */
const WEB_MARKETPLACE_PAGES = new Set([
  "delivery-customer",
  "delivery-customer-settings",
  "delivery-customer-terms",
  "merchant",
  "merchant-register",
  "merchant-legal-sign",
]);

export function getUserRole(user = {}) {
  const profile = user.user || user.profile || user.account || user;
  const role = String(profile.role || user.role || "").toLowerCase();
  const userType = String(profile.user_type || user.user_type || profile.type || user.type || "").toLowerCase();
  const isStaff = profile.is_staff === true || user.is_staff === true || profile.is_staff === "true" || user.is_staff === "true";
  const isSuperuser =
    profile.is_superuser === true ||
    user.is_superuser === true ||
    profile.is_superuser === "true" ||
    user.is_superuser === "true";
  const isDriver =
    profile.is_driver === true ||
    user.is_driver === true ||
    profile.is_driver === "true" ||
    user.is_driver === "true";
  const isMerchant = userType === "merchant" || profile.user_type === "merchant";

  if (isStaff || isSuperuser || role === "admin") return "admin";
  if (isMerchant || role === "merchant") return "merchant";
  if (isDriver || userType === "driver" || role === "driver") return "driver";
  return "rider";
}

export function getDashboardPath(user) {
  const role = getUserRole(user);
  const appType = getAppType();
  if (role === "merchant") return "/merchant";
  if (appType === "delivery") return "/delivery/courier";
  if (role === "admin") return "/admin";
  if (role === "driver") {
    if (isTaxiDriverContext()) {
      return "/driver";
    }
    return "/delivery/courier";
  }
  return "/rider-dashboard";
}

export function canAccessPage(user, page) {
  const appType = getAppType();
  if (appType === "web" && WEB_MARKETPLACE_PAGES.has(page)) {
    return true;
  }

  const role = getUserRole(user);
  if (ADMIN_PAGES.has(page)) return role === "admin";
  if (MERCHANT_PAGES.has(page)) return role === "merchant";
  if (DRIVER_PAGES.has(page)) return role === "driver";
  if (RIDER_PAGES.has(page)) return role === "rider";
  return true;
}

export function isPublicPage(page) {
  return (
    page === "merchant-register"
    || page === "delivery-customer"
    || page === "delivery-customer-settings"
    || page === "delivery-customer-terms"
    || page === "delivery-courier-terms"
    || page === "merchant"
  );
}

export function isSafeRoleRedirect(user, path) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  if (path === "/login" || path === "/register") return false;

  const role = getUserRole(user);
  if (path === "/admin" || path.startsWith("/admin/") || path === "/admin-dashboard") {
    return role === "admin";
  }
  if (path === "/driver" || path.startsWith("/driver/") || path === "/driver-profile") {
    return role === "driver";
  }
  if (path === "/delivery/courier" || path.startsWith("/delivery/courier/")) {
    return role === "driver";
  }
  if (path === "/delivery/courier/sign" || path.startsWith("/delivery/courier/sign/")) {
    return role === "driver";
  }
  if (path === "/merchant/sign" || path.startsWith("/merchant/sign/")) {
    return role === "merchant";
  }
  if (path === "/rider/legal" || path.startsWith("/rider/legal/")) {
    return role === "rider";
  }
  if (path === "/driver/sign" || path.startsWith("/driver/sign/")) {
    return role === "driver";
  }
  if (path === "/delivery/vehicle-setup" || path.startsWith("/delivery/vehicle-setup/")) {
    return role === "driver";
  }
  if (path === "/delivery/account" || path.startsWith("/delivery/account/")) {
    return role === "driver";
  }
  if (path === "/delivery/bank" || path.startsWith("/delivery/bank/")) {
    return role === "driver";
  }
  if (path === "/delivery/earnings" || path.startsWith("/delivery/earnings/")) {
    return role === "driver";
  }
  if (path === "/delivery/documents" || path.startsWith("/delivery/documents/")) {
    return role === "driver";
  }
  if (path === "/delivery/profile-setup" || path.startsWith("/delivery/profile-setup/")) {
    return role === "driver";
  }
  if (path === "/delivery/support" || path.startsWith("/delivery/support/")) {
    return role === "driver";
  }
  if (path === "/delivery/settings" || path.startsWith("/delivery/settings/")) {
    return role === "driver";
  }
  if (path === "/delivery/profile/edit" || path.startsWith("/delivery/profile/edit/")) {
    return role === "driver";
  }
  if (path === "/driver/earnings" || path.startsWith("/driver/earnings/")) {
    return role === "driver";
  }
  // Customer delivery + merchant flows are open to any signed-in role on web.
  if (path === "/delivery" || path.startsWith("/merchant")) {
    return true;
  }
  if (
    path === "/rider" ||
    path.startsWith("/rider-") ||
    path.startsWith("/ride/") ||
    path === "/history" ||
    path === "/saved-places" ||
    path === "/payment-setup"
  ) {
    return role === "rider";
  }
  return true;
}

export function getSafeRedirectPath(user, requestedPath) {
  return isSafeRoleRedirect(user, requestedPath)
    ? requestedPath
    : getDashboardPath(user);
}
