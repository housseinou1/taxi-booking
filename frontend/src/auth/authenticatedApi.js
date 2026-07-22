import axios from "axios";

import { axiosWithApiFallback, shouldUseApiFallback } from "../apiFallback";
import { clearAuthSession, refreshAccessToken } from "./session";

let refreshPromise = null;
let redirectStarted = false;

const isAuthenticationError = (error) =>
  error?.response?.status === 401 ||
  error?.response?.data?.code === "token_not_valid";

const clearSessionAndRedirect = () => {
  clearAuthSession();

  if (window.location.pathname !== "/login" && !redirectStarted) {
    redirectStarted = true;
    localStorage.setItem(
      "sx_login_redirect",
      `${window.location.pathname}${window.location.search}`
    );
    window.location.replace(
      `/login?next=${encodeURIComponent(
        `${window.location.pathname}${window.location.search}`
      )}`
    );
  }
};

export function resetAuthRedirectFlag() {
  redirectStarted = false;
}

const getRefreshAccessToken = async ({ suppressAuthRedirect = false } = {}) => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshAccessToken({ clearOnFailure: !suppressAuthRedirect })
    .catch((error) => {
      if (!suppressAuthRedirect) {
        clearSessionAndRedirect();
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

const stripInternalConfig = (config = {}) => {
  const { suppressAuthRedirect, ...axiosConfig } = config;
  return axiosConfig;
};

const withAuthorization = (config = {}, access = localStorage.getItem("access")) => {
  const axiosConfig = stripInternalConfig(config);
  const headers = { ...(config.headers || {}) };
  if (access && access !== "null" && access !== "undefined") {
    headers.Authorization = `Bearer ${access}`;
  }
  return {
    ...axiosConfig,
    timeout: config.timeout || 15000,
    headers,
  };
};

const dispatchRequest = async (method, url, data, config) => {
  const authorizedConfig = withAuthorization(config);
  if (shouldUseApiFallback()) {
    return axiosWithApiFallback(method, url, data, authorizedConfig);
  }
  if (method === "get") return axios.get(url, authorizedConfig);
  if (method === "delete") return axios.delete(url, authorizedConfig);
  if (method === "patch") return axios.patch(url, data, authorizedConfig);
  return axios.post(url, data, authorizedConfig);
};

const retryRequest = async (method, url, data, config, access) => {
  const authorizedConfig = withAuthorization(config, access);
  if (shouldUseApiFallback()) {
    return axiosWithApiFallback(method, url, data, authorizedConfig);
  }
  if (method === "get") return axios.get(url, authorizedConfig);
  if (method === "delete") return axios.delete(url, authorizedConfig);
  if (method === "patch") return axios.patch(url, data, authorizedConfig);
  return axios.post(url, data, authorizedConfig);
};

const authenticatedRequest = async (method, url, data, config) => {
  try {
    return await dispatchRequest(method, url, data, config);
  } catch (error) {
    if (!isAuthenticationError(error)) throw error;

    try {
      const access = await getRefreshAccessToken({
        suppressAuthRedirect: Boolean(config?.suppressAuthRedirect),
      });
      return retryRequest(method, url, data, config, access);
    } catch (refreshError) {
      throw refreshError;
    }
  }
};

const authenticatedApi = {
  get: (url, config) => authenticatedRequest("get", url, undefined, config),
  post: (url, data, config) => authenticatedRequest("post", url, data, config),
  patch: (url, data, config) => authenticatedRequest("patch", url, data, config),
  delete: (url, config) => authenticatedRequest("delete", url, undefined, config),
};

export default authenticatedApi;
