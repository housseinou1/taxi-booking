import { API_URL } from "../../../apiConfig";
import authenticatedApi from "../../../auth/authenticatedApi";

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
  const headers = cachedVersion ? { "If-None-Match": `"${cachedVersion}"` } : {};

  try {
    const { data, status, headers: responseHeaders } = await authenticatedApi.get(url, { headers });

    if (status === 304 && cachedVersion) {
      const cached = readCache({ ignoreExpiry: true });
      if (cached) return cached;
    }

    const version =
      data?.permissions_version ||
      responseHeaders?.["x-permissions-version"] ||
      cachedVersion;
    writeCache(data, version);
    return data;
  } catch (error) {
    if (error?.response?.status === 304) {
      const cached = readCache({ ignoreExpiry: true });
      if (cached) return cached;
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
  return data?.home_route || "/admin/home/ops";
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
