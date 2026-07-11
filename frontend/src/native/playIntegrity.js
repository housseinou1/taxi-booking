/**
 * Play Integrity / device trust helper.
 *
 * Native production apps should call a Capacitor plugin that returns a Play Integrity token.
 * Until Google Cloud / Play Console keys are configured, backend runs permissive mode.
 */

import { getAppType, isNative } from "./platform";
import { API_URL } from "../apiConfig";
import axios from "axios";

const PACKAGE_BY_APP = {
  rider: "com.yala.rider.mr",
  driver: "com.yala.driver.mr",
  delivery: "com.yala.delivery.mr",
};

export function getExpectedPackageName() {
  return PACKAGE_BY_APP[getAppType()] || "";
}

/**
 * Best-effort integrity token from native bridge.
 * Returns null when plugin/keys are unavailable (dev builds).
 */
export async function requestIntegrityToken() {
  if (!isNative() || typeof window === "undefined") return null;

  const bridge = window.YalaIntegrity;
  if (bridge && typeof bridge.requestToken === "function") {
    try {
      const result = await bridge.requestToken({
        packageName: getExpectedPackageName(),
      });
      return result?.token || result?.integrityToken || null;
    } catch (error) {
      console.warn("Play Integrity native bridge failed:", error);
      return null;
    }
  }

  return null;
}

export async function submitIntegrityToken(accessToken) {
  const integrityToken = await requestIntegrityToken();
  if (!integrityToken || !accessToken) {
    return { pass: true, reason: "skipped_no_token" };
  }

  try {
    const { data } = await axios.post(
      `${API_URL}/auth/integrity/verify/`,
      { integrity_token: integrityToken },
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 12000 },
    );
    return data;
  } catch (error) {
    if (error?.response?.status === 403) {
      return error.response.data || { pass: false, reason: "rejected" };
    }
    return { pass: true, reason: "verify_unreachable" };
  }
}

/**
 * Lightweight client heuristics for rooted/emulator environments.
 * Not a replacement for Play Integrity — only a soft signal for UI gating.
 */
export function getClientTrustSignals() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isEmulatorUa = /sdk_gphone|Emulator|Android SDK built for/i.test(ua);
  const bridgeFlags = typeof window !== "undefined" ? window.__YALA_DEVICE_TRUST__ || {} : {};

  return {
    is_emulator: Boolean(bridgeFlags.isEmulator || isEmulatorUa),
    is_rooted: Boolean(bridgeFlags.isRooted),
    is_tampered: Boolean(bridgeFlags.isTampered),
    package_name: getExpectedPackageName(),
  };
}

export function shouldBlockSensitiveClientActions(signals = getClientTrustSignals()) {
  return Boolean(signals.is_rooted || signals.is_tampered);
}
