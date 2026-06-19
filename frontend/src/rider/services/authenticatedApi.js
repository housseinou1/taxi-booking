import axios from "axios";

import { API_URL } from "../../apiConfig";

let refreshPromise = null;
let redirectStarted = false;

const isAuthenticationError = (error) =>
  error?.response?.status === 401 ||
  error?.response?.data?.code === "token_not_valid";

const clearSessionAndRedirect = () => {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("user");

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

const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem("refresh");
  if (!refresh) {
    clearSessionAndRedirect();
    throw new Error("Your session expired. Please log in again.");
  }

  refreshPromise = axios
    .post(`${API_URL}/auth/token/refresh/`, { refresh }, { timeout: 10000 })
    .then((response) => {
      localStorage.setItem("access", response.data.access);
      if (response.data.refresh) {
        localStorage.setItem("refresh", response.data.refresh);
      }
      return response.data.access;
    })
    .catch((error) => {
      clearSessionAndRedirect();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

const withAuthorization = (config = {}, access = localStorage.getItem("access")) => {
  const headers = { ...(config.headers || {}) };
  if (access && access !== "null" && access !== "undefined") {
    headers.Authorization = `Bearer ${access}`;
  }
  return {
    ...config,
    timeout: config.timeout || 15000,
    headers,
  };
};

const dispatchRequest = (method, url, data, config) => {
  const authorizedConfig = withAuthorization(config);
  if (method === "get") return axios.get(url, authorizedConfig);
  if (method === "delete") return axios.delete(url, authorizedConfig);
  if (method === "patch") return axios.patch(url, data, authorizedConfig);
  return axios.post(url, data, authorizedConfig);
};

const retryRequest = (method, url, data, config, access) => {
  const authorizedConfig = withAuthorization(config, access);
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

    const access = await refreshAccessToken();
    return retryRequest(method, url, data, config, access);
  }
};

export const riderApi = {
  get: (url, config) => authenticatedRequest("get", url, undefined, config),
  post: (url, data, config) => authenticatedRequest("post", url, data, config),
  patch: (url, data, config) => authenticatedRequest("patch", url, data, config),
  delete: (url, config) => authenticatedRequest("delete", url, undefined, config),
};

export default riderApi;
