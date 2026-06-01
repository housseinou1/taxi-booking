/**
 * Platform detection utilities for Capacitor native apps.
 * Gracefully degrades when running in a browser without Capacitor installed.
 */

let CapacitorModule = null;
try {
  CapacitorModule = require('@capacitor/core');
} catch {
  // Not in native environment — Capacitor not installed
}

/**
 * Returns true when running inside a Capacitor native container (iOS or Android).
 * Returns false in browser/PWA mode.
 */
export function isNative() {
  return CapacitorModule?.Capacitor?.isNativePlatform?.() || false;
}

/**
 * Returns the current platform: 'ios', 'android', or 'web'.
 */
export function getPlatform() {
  if (CapacitorModule?.Capacitor?.getPlatform) {
    return CapacitorModule.Capacitor.getPlatform();
  }
  return 'web';
}

/**
 * Returns the app type based on build-time environment variable.
 * Returns 'rider', 'driver', or 'web'.
 */
export function getAppType() {
  return process.env.REACT_APP_TYPE || 'web';
}

/**
 * Returns true if the PWA install button should be shown.
 * Hidden when running inside a native Capacitor container.
 */
export function shouldShowInstallButton() {
  return !isNative();
}
