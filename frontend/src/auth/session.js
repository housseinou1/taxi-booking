import axios from "axios";

import { API_URL } from "../apiConfig";
import { getAppType } from "../native/platform";
import { getToken, removeToken, setToken } from "../native/storage";
import { getUserRole } from "./roleRouting";

const SESSION_KEYS = [
  "access",
  "refresh",
  "user",
  "selectedRideId",
  "needs_payment_setup",
  "needs_vehicle_setup",
];

export function clearAuthSession() {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  removeToken("access").catch(() => {});
  removeToken("refresh").catch(() => {});
}

export function persistAuthTokens({ access, refresh, user } = {}) {
  if (access) {
    localStorage.setItem("access", access);
    setToken("access", access).catch(() => {});
  }
  if (refresh) {
    localStorage.setItem("refresh", refresh);
    setToken("refresh", refresh).catch(() => {});
  }
  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
  }
}

async function hydrateTokensFromSecureStorage() {
  if (localStorage.getItem("access") || localStorage.getItem("refresh")) {
    return;
  }
  const [access, refresh] = await Promise.all([getToken("access"), getToken("refresh")]);
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
}

export function isJwtUsable(token) {
  if (!token || token === "null" || token === "undefined") return false;

  try {
    const [, payload] = token.split(".");
    if (!payload) return true;

    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!decoded.exp) return true;

    return decoded.exp * 1000 > Date.now() + 30000;
  } catch (error) {
    return Boolean(token);
  }
}

export function hasValidAccessToken() {
  return isJwtUsable(localStorage.getItem("access"));
}

export function hasRefreshToken() {
  const refresh = localStorage.getItem("refresh");
  return Boolean(refresh && refresh !== "null" && refresh !== "undefined");
}

export function hasStoredAuthCredentials() {
  return hasValidAccessToken() || hasRefreshToken();
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (error) {
    return {};
  }
}

export function isDriverAccount(user = getStoredUser()) {
  return getUserRole(user) === "driver";
}

let refreshPromise = null;

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  if (!hasRefreshToken()) {
    clearAuthSession();
    throw new Error("missing_refresh_token");
  }

  const refresh = localStorage.getItem("refresh");

  refreshPromise = axios
    .post(`${API_URL}/auth/token/refresh/`, { refresh }, { timeout: 15000 })
    .then((response) => {
      persistAuthTokens({
        access: response.data.access,
        refresh: response.data.refresh,
      });
      return response.data.access;
    })
    .catch((error) => {
      clearAuthSession();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function ensureValidAccessToken() {
  await hydrateTokensFromSecureStorage();

  if (hasValidAccessToken()) {
    return localStorage.getItem("access");
  }

  if (!hasRefreshToken()) {
    clearAuthSession();
    return null;
  }

  try {
    return await refreshAccessToken();
  } catch (error) {
    return null;
  }
}

export async function fetchAuthenticatedUser(accessToken) {
  const token = accessToken || localStorage.getItem("access");
  if (!token) {
    throw new Error("missing_access_token");
  }

  const response = await axios.get(`${API_URL}/auth/me/`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  localStorage.setItem("user", JSON.stringify(response.data));
  return response.data;
}

export async function restoreAuthSession({ requiredRole = null } = {}) {
  await hydrateTokensFromSecureStorage();

  const access = await ensureValidAccessToken();
  if (!access) {
    return { authenticated: false, user: null };
  }

  try {
    const user = await fetchAuthenticatedUser(access);
    if (requiredRole && getUserRole(user) !== requiredRole) {
      clearAuthSession();
      return { authenticated: false, user: null, wrongRole: getUserRole(user) };
    }
    return { authenticated: true, user };
  } catch (error) {
    const status = error?.response?.status;
    if ((status === 401 || status === 403) && hasRefreshToken()) {
      try {
        const refreshed = await refreshAccessToken();
        const user = await fetchAuthenticatedUser(refreshed);
        if (requiredRole && getUserRole(user) !== requiredRole) {
          clearAuthSession();
          return { authenticated: false, user: null, wrongRole: getUserRole(user) };
        }
        return { authenticated: true, user };
      } catch (refreshError) {
        clearAuthSession();
        return { authenticated: false, user: null };
      }
    }

    clearAuthSession();
    return { authenticated: false, user: null };
  }
}

export function buildLoginRedirectPath(nextPath = "") {
  if (!nextPath || nextPath === "/login") return "/login";
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function redirectToLogin(nextPath = "") {
  const target = buildLoginRedirectPath(
    nextPath || `${window.location.pathname}${window.location.search}`
  );
  if (window.location.pathname === "/login") return;
  window.location.replace(target);
}

export function getRequiredRoleForApp(appType = getAppType()) {
  if (appType === "driver" || appType === "delivery") return "driver";
  if (appType === "rider") return "rider";
  if (appType === "admin") return "admin";
  return null;
}
