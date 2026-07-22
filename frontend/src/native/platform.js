/**
 * Platform detection utilities for Capacitor native apps.
 * Gracefully degrades when running in a browser without Capacitor installed.
 */

export const NATIVE_APP_IDS = {
  "com.yala.rider.mr": "rider",
  "com.yala.driver.mr": "driver",
  "com.yala.delivery.mr": "delivery",
  "com.yala.admin.mr": "admin",
};

function getCapacitor() {
  return typeof window !== "undefined" ? window.Capacitor : null;
}

function getAppTypeFromNativePackageId(appId) {
  if (appId && NATIVE_APP_IDS[appId]) {
    return NATIVE_APP_IDS[appId];
  }
  return null;
}

function readNativePackageIdFromCapacitorConfig() {
  const capacitor = getCapacitor();
  return capacitor?.config?.appId || null;
}

/**
 * Returns true when running inside a Capacitor native container (iOS or Android).
 * Returns false in browser/PWA mode.
 */
export function isNative() {
  return getCapacitor()?.isNativePlatform?.() || false;
}

/**
 * Returns the current platform: 'ios', 'android', or 'web'.
 */
export function getPlatform() {
  const capacitor = getCapacitor();
  if (capacitor?.getPlatform) {
    return capacitor.getPlatform();
  }
  return "web";
}

/**
 * Resolves app type from the native package id when available.
 */
export function resolveAppTypeFromPackageId(appId) {
  return getAppTypeFromNativePackageId(appId);
}

/**
 * Ensures native apps know their role from the Android/iOS package id.
 * Call once before rendering React on native builds.
 */
export async function initNativeAppType() {
  if (typeof window === "undefined") {
    return getAppType();
  }

  if (window.__YALA_APP_TYPE__) {
    return window.__YALA_APP_TYPE__;
  }

  const configAppId = readNativePackageIdFromCapacitorConfig();
  const configType = getAppTypeFromNativePackageId(configAppId);
  if (configType) {
    window.__YALA_APP_TYPE__ = configType;
    return configType;
  }

  if (!isNative()) {
    return getAppType();
  }

  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const nativeType = getAppTypeFromNativePackageId(info?.id);
    if (nativeType) {
      window.__YALA_APP_TYPE__ = nativeType;
      return nativeType;
    }
  } catch (error) {
    console.warn("Could not resolve native app type from package id:", error);
  }

  return getAppType();
}

/**
 * Returns the app type: 'rider', 'driver', 'delivery', 'admin', or 'web'.
 * Native apps prefer the stamped/package identity over build-time env.
 */
export function getAppType() {
  if (typeof window !== "undefined" && window.__YALA_APP_TYPE__) {
    return window.__YALA_APP_TYPE__;
  }

  const nativeType =
    getAppTypeFromNativePackageId(readNativePackageIdFromCapacitorConfig());
  if (nativeType) {
    return nativeType;
  }

  return process.env.REACT_APP_TYPE || "web";
}

/**
 * Returns true if the PWA install button should be shown.
 * Hidden when running inside a native Capacitor container.
 */
export function shouldShowInstallButton() {
  return !isNative();
}

export const YALA_COURIER_SESSION_KEY = "yala_delivery_courier";

const DELIVERY_COURIER_ROUTE_PREFIXES = [
  "/delivery/courier",
  "/delivery/account",
  "/delivery/bank",
  "/delivery/profile-setup",
  "/delivery/profile",
  "/delivery/vehicle-setup",
  "/delivery/earnings",
  "/delivery/documents",
  "/delivery/support",
  "/delivery/settings",
  "/delivery/courier/terms",
  "/delivery/courier/sign",
  "/delivery/customer/terms",
  "/delivery/customer/settings",
];

export function normalizeRoutePath(value) {
  if (!value) return "";
  const raw = String(value).trim();
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return new URL(decoded).pathname.replace(/\/+$/, "") || "/";
    }
    return decoded.replace(/\/+$/, "") || "/";
  } catch {
    return raw.replace(/\/+$/, "") || "/";
  }
}

export function isDeliveryCourierPath(path) {
  const normalized = normalizeRoutePath(path);
  if (!normalized || normalized === "/delivery") return false;
  return DELIVERY_COURIER_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function markDeliveryCourierSession() {
  if (typeof window !== "undefined") {
    localStorage.setItem(YALA_COURIER_SESSION_KEY, "1");
  }
}

export function clearDeliveryCourierSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(YALA_COURIER_SESSION_KEY);
  }
}

export function hasDeliveryCourierSession() {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem(YALA_COURIER_SESSION_KEY) === "1"
  );
}

function getNextRouteFromWindow() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || "");
  return params.get("next") || localStorage.getItem("sx_login_redirect") || "";
}

/**
 * Native Yala Rider / Yala Driver installs must never inherit courier UI from
 * stale web session flags or /delivery deep links.
 */
export function isNativeMobilityApp() {
  const appType = getAppType();
  return appType === "rider" || appType === "driver";
}

/**
 * True when the user is in the Yala Delivery courier app (native build or web courier flow).
 * Keeps courier UI separate from Yala Driver (taxi).
 */
export function isDeliveryCourierApp() {
  const appType = getAppType();
  if (appType === "rider" || appType === "driver") {
    return false;
  }
  if (appType === "delivery") return true;
  if (typeof window === "undefined") return false;
  if (hasDeliveryCourierSession()) return true;

  const path = window.location.pathname || "";
  if (isDeliveryCourierPath(path)) return true;

  return isDeliveryCourierPath(getNextRouteFromWindow());
}

/**
 * Native package id resolves to Yala Delivery (courier), regardless of build env.
 */
export function isNativeDeliveryPackage() {
  return resolveAppTypeFromPackageId(readNativePackageIdFromCapacitorConfig()) === "delivery";
}

/**
 * Yala Delivery native install (APK/IPA), identified by build stamp or package id.
 */
export function isDeliveryNativeApp() {
  return getAppType() === "delivery" || isNativeDeliveryPackage();
}

/**
 * True when this install must never show Yala Driver (taxi) UI.
 */
export function isDeliveryAppInstall() {
  return isDeliveryNativeApp() || isDeliveryCourierApp();
}

/**
 * Default home route for the current app install.
 */
export function getAppHomePath() {
  if (isDeliveryNativeApp()) return "/delivery/courier";
  const appType = getAppType();
  if (appType === "driver") return "/driver";
  if (appType === "rider") return "/rider-dashboard";
  if (appType === "admin") return "/admin";
  return "/";
}

/**
 * True only for the Yala Driver (taxi) app — not Yala Delivery couriers.
 */
export function isTaxiDriverContext() {
  if (isDeliveryAppInstall()) return false;
  if (getAppType() === "driver") return true;
  if (typeof window === "undefined") return false;

  const path = normalizeRoutePath(window.location.pathname);
  return (
    path === "/driver" ||
    path.startsWith("/driver/") ||
    path === "/driver-vehicle-setup" ||
    path === "/driver-profile"
  );
}

const RIDER_LYFT_ROUTES = [
  "/rider",
  "/rider-dashboard",
  "/rider-history",
  "/history",
  "/rider-reviews",
  "/saved-places",
  "/rider-profile",
  "/rider-payments",
  "/ride/share",
  "/delivery",
  "/merchant",
  "/merchant/register",
  "/payment-setup",
  "/settings",
  "/support",
  "/services",
];

/**
 * True for native rider app and web rider account screens (Lyft-style UI).
 */
export function isRiderLyftUI() {
  if (getAppType() === "rider") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const path = window.location.pathname || "";
  return RIDER_LYFT_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

/**
 * True for native delivery app and web courier screens.
 */
export function isDeliveryLyftUI() {
  return isDeliveryCourierApp();
}

/**
 * Uber-style delivery courier UI (map shell, bottom sheet, minimal chrome).
 * Native Yala Delivery always uses the courier dashboard — never taxi driver UI.
 */
export function isDeliveryUberUI() {
  if (isNativeMobilityApp()) return false;
  if (isDeliveryNativeApp()) return true;
  return isDeliveryCourierApp();
}

const DRIVER_LYFT_ROUTES = [
  "/driver",
  "/driver/profile",
  "/driver/profile/edit",
  "/driver/documents",
  "/driver/code",
  "/driver/earnings",
  "/driver/wallet",
  "/driver/feedback",
  "/driver/support",
  "/driver/achievements",
  "/driver/hall-of-fame",
  "/driver/history",
  "/driver-vehicle-setup",
  "/driver-profile",
  "/login",
  "/register",
  "/settings",
];

/**
 * True for native driver app and web driver account screens (Lyft-style UI).
 */
export function isDriverLyftUI() {
  if (isDeliveryCourierApp()) {
    return false;
  }

  if (getAppType() === "driver") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const path = window.location.pathname || "";
  return DRIVER_LYFT_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}
