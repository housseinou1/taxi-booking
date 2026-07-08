/**
 * Stable device id for session binding / multi-account detection.
 * Prefers Capacitor Preferences when the plugin is available; else localStorage.
 */

import { isNative } from "./platform";

const DEVICE_ID_KEY = "yala_device_id";

function createUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readNativeDeviceId() {
  if (!isNative() || typeof window === "undefined") return null;

  try {
    // Prefer plugin registry to avoid hard dependency on @capacitor/preferences in web builds.
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (!preferences?.get || !preferences?.set) return null;

    const existing = await preferences.get({ key: DEVICE_ID_KEY });
    if (existing?.value) return existing.value;
    const next = createUuid();
    await preferences.set({ key: DEVICE_ID_KEY, value: next });
    return next;
  } catch {
    return null;
  }
}

export async function getStableDeviceId() {
  if (typeof window === "undefined") return "";

  if (isNative()) {
    const nativeId = await readNativeDeviceId();
    if (nativeId) {
      localStorage.setItem(DEVICE_ID_KEY, nativeId);
      return nativeId;
    }
  }

  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const next = createUuid();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export function getDeviceName() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  return "Web";
}
