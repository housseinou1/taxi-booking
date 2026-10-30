import { API_URL } from "../../../apiConfig";
import authenticatedApi from "../../../auth/authenticatedApi";
import { resolveRegisteredAdminHome } from "./adminRouteAccess";

const CACHE_KEY = "yala_admin_permissions";
const VERSION_KEY = "yala_admin_permissions_version";
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchAdminPermissions({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  const url = `${API_URL}/operations/admin/me/permissions/`;
  const cachedVersion = localStorage.getItem(VERSION_KEY);

  // Persist the full payload (sessionStorage) and the version (localStorage).
  // localStorage survives a browser/tab restart but sessionStorage does NOT, so
  // after a restart we can hold a version with an EMPTY body cache. If we then
  // sent `If-None-Match` and the server answered 304, there would be nothing to
  // serve and permissions would stay null -> AdminActionGuard default-denies ->
  // every Approve/Reject/Suspend button renders disabled.
  //
  // Root-cause fix: only send the conditional `If-None-Match` header when we
  // ALSO still hold the cached body it refers to. With no body to fall back to,
  // request unconditionally so the server returns a full 200. The post-304
  // recovery below is kept as a belt-and-suspenders fallback. This is a
  // resilience fix only; it does not weaken RBAC (the backend IsStaffUser gate
  // and the real payload remain authoritative).
  const hasCachedBody = Boolean(readCache({ ignoreExpiry: true }));
  const requestOnce = async (useConditional) => {
    const headers =
      useConditional && cachedVersion && hasCachedBody
        ? { "If-None-Match": `"${cachedVersion}"` }
        : {};
    return authenticatedApi.get(url, { headers });
  };

  const consume = (data, responseHeaders) => {
    const version =
      data?.permissions_version ||
      responseHeaders?.["x-permissions-version"] ||
      cachedVersion;
    writeCache(data, version);
    return data;
  };

  try {
    const { data, status, headers: responseHeaders } = await requestOnce(true);

    if (status === 304) {
      const cached = readCache({ ignoreExpiry: true });
      if (cached) return cached;
      // 304 but no cached body (e.g. fresh session, stale version) -> force a
      // fresh fetch so a full payload loads instead of leaving permissions null.
      const fresh = await requestOnce(false);
      return consume(fresh.data, fresh.headers);
    }

    // A 200 with an empty/missing body would also leave permissions null; treat
    // it the same way and force a clean refetch.
    if (!data || typeof data !== "object") {
      const fresh = await requestOnce(false);
      return consume(fresh.data, fresh.headers);
    }

    return consume(data, responseHeaders);
  } catch (error) {
    if (error?.response?.status === 304) {
      const cached = readCache({ ignoreExpiry: true });
      if (cached) return cached;
      // Same fresh-session fallback on the axios "304-as-error" path.
      const fresh = await requestOnce(false);
      return consume(fresh.data, fresh.headers);
    }
    throw error;
  }
}

export function clearAdminPermissionsCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(VERSION_KEY);
  } catch (error) {
    // ignore
  }
}

export async function resolveAdminHomeRoute({ force = false } = {}) {
  const data = await fetchAdminPermissions({ force });
  // Resolve to a route App.js actually registers — the backend advertises `/admin/home/*`,
  // which falls through to the public landing page.
  return resolveRegisteredAdminHome(data?.home_route);
}

function readCache({ ignoreExpiry = false } = {}) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    if (!ignoreExpiry && parsed.expiresAt && Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    const currentVersion = localStorage.getItem(VERSION_KEY);
    if (
      currentVersion &&
      parsed.data?.permissions_version &&
      parsed.data.permissions_version !== currentVersion
    ) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch (error) {
    return null;
  }
}

function writeCache(data, version) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
    );
    if (version) {
      localStorage.setItem(VERSION_KEY, version);
    } else if (data?.permissions_version) {
      localStorage.setItem(VERSION_KEY, data.permissions_version);
    }
  } catch (error) {
    // ignore quota errors
  }
}
