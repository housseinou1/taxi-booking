import { API_URL } from "../apiConfig";
import { getAppType } from "./platform";

function getCurrentAppVersion() {
  if (typeof window !== "undefined" && window.__YALA_APP_VERSION__) {
    return window.__YALA_APP_VERSION__;
  }
  return process.env.REACT_APP_BUILD_VERSION || "0.0.0";
}

const VERSION_GATE_CACHE_KEY = "yala_app_version_gate_v1";

function readCachedVersionGate(appType) {
  try {
    const raw = window.localStorage?.getItem(VERSION_GATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.app !== appType) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedVersionGate(appType, minVersion, latestVersion) {
  try {
    window.localStorage?.setItem(
      VERSION_GATE_CACHE_KEY,
      JSON.stringify({
        app: appType,
        minVersion,
        latestVersion,
        checkedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage errors
  }
}

function buildVersionBlockMessage(currentVersion, minVersion, latestVersion) {
  return {
    title: "Update required",
    message: `This version (${currentVersion}) is no longer supported. Please update to ${latestVersion || minVersion} or later to continue using Yala.`,
    minVersion,
    latestVersion: latestVersion || minVersion,
  };
}

export function parseVersion(value) {
  return String(value || "0")
    .split(".")
    .map((part) => Number(String(part).replace(/\D/g, "") || 0))
    .concat([0, 0, 0])
    .slice(0, 3);
}

export function isVersionBelow(current, minimum) {
  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);

  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] < minimumParts[index]) return true;
    if (currentParts[index] > minimumParts[index]) return false;
  }

  return false;
}

/**
 * Check whether the installed native app must update before continuing.
 * Returns null when the app may proceed, or a user-facing message when blocked.
 */
export async function checkAppVersionRequired() {
  const appType = getAppType();
  if (appType !== "rider" && appType !== "driver" && appType !== "delivery") {
    return null;
  }

  const currentVersion = getCurrentAppVersion();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `${API_URL}/health/app-version/?app=${encodeURIComponent(appType)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      const cached = readCachedVersionGate(appType);
      if (cached?.minVersion && isVersionBelow(currentVersion, cached.minVersion)) {
        return buildVersionBlockMessage(
          currentVersion,
          cached.minVersion,
          cached.latestVersion,
        );
      }
      return null;
    }

    const data = await response.json();
    const minVersion = data.min_version || "0.0.0";
    const latestVersion = data.latest_version || minVersion;
    writeCachedVersionGate(appType, minVersion, latestVersion);

    if (!isVersionBelow(currentVersion, minVersion)) {
      return null;
    }

    return buildVersionBlockMessage(currentVersion, minVersion, latestVersion);
  } catch (error) {
    const cached = readCachedVersionGate(appType);
    if (cached?.minVersion && isVersionBelow(currentVersion, cached.minVersion)) {
      return buildVersionBlockMessage(
        currentVersion,
        cached.minVersion,
        cached.latestVersion,
      );
    }
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function showVersionBlockScreen(blockInfo) {
  const rootElement = document.getElementById("root");
  if (!rootElement || !blockInfo) return;

  rootElement.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B1220;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;padding:24px;text-align:center;">
      <div style="max-width:420px;">
        <div style="font-size:28px;font-weight:700;margin-bottom:8px;">Yala</div>
        <h1 style="font-size:22px;margin:0 0 12px;">${blockInfo.title}</h1>
        <p style="opacity:0.85;font-size:15px;line-height:1.5;margin:0;">${blockInfo.message}</p>
      </div>
    </main>
  `;
}
