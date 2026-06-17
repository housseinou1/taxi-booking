const ADMIN_PAGES = new Set(["admin", "admin-share-analytics", "delivery-admin"]);

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
  "driver-vehicle-setup",
]);

const RIDER_PAGES = new Set([
  "payment-setup",
  "rider",
  "rider-dashboard",
  "rider-history",
  "rider-ride-history",
  "rider-reviews",
  "saved-places",
  "rider-profile",
  "rider-payments",
  "delivery-customer",
  "share-booking",
  "share-ride",
  "share-ride-complete",
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

  if (isStaff || isSuperuser || role === "admin") return "admin";
  if (isDriver || userType === "driver" || role === "driver") return "driver";
  return "rider";
}

export function getDashboardPath(user) {
  const role = getUserRole(user);
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return "/rider-dashboard";
}

export function canAccessPage(user, page) {
  const role = getUserRole(user);
  if (ADMIN_PAGES.has(page)) return role === "admin";
  if (DRIVER_PAGES.has(page)) return role === "driver";
  if (RIDER_PAGES.has(page)) return role === "rider";
  return true;
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
  if (
    path === "/rider" ||
    path.startsWith("/rider-") ||
    path.startsWith("/ride/") ||
    path === "/history" ||
    path === "/saved-places" ||
    path === "/delivery" ||
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
