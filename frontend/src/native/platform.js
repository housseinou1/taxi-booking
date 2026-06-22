/**
 * Platform detection utilities for Capacitor native apps.
 * Gracefully degrades when running in a browser without Capacitor installed.
 */

export const NATIVE_APP_IDS = {
  "com.yala.rider.mr": "rider",
  "com.yala.driver.mr": "driver",
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
 * Returns the app type: 'rider', 'driver', 'admin', or 'web'.
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
