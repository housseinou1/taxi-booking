import axios from "axios";

const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https"
    : "http";

export const API_URL =
  process.env.REACT_APP_API_URL || `${browserProtocol}://${browserHost}:8000`;

export const WS_URL =
  process.env.REACT_APP_WS_URL ||
  `${browserProtocol === "https" ? "wss" : "ws"}://${browserHost}:8000/ws/rides/`;

const authStorage = {
  getAccessToken: () => localStorage.getItem("access"),
  getRefreshToken: () => localStorage.getItem("refresh"),
  setTokens: ({ access, refresh }) => {
    if (access) localStorage.setItem("access", access);
    if (refresh) localStorage.setItem("refresh", refresh);
  },
  clear: () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedRideId");
    localStorage.removeItem("needs_payment_setup");
    localStorage.removeItem("needs_vehicle_setup");
  },
};

const isAuthEndpoint = (url = "") =>
  String(url).includes("/auth/login/") ||
  String(url).includes("/auth/register/") ||
  String(url).includes("/auth/token/") ||
  String(url).includes("/api/token/");

export const getAuthHeaders = (headers = {}) => {
  const token = authStorage.getAccessToken();

  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

let refreshPromise = null;

export const refreshAccessToken = async () => {
  const refresh = authStorage.getRefreshToken();

  if (!refresh) {
    throw new Error("Missing refresh token");
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/token/refresh/`, { refresh }, { skipAuthRefresh: true })
      .then((response) => {
        authStorage.setTokens({
          access: response.data.access,
          refresh: response.data.refresh,
        });
        return response.data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export const redirectToLogin = () => {
  authStorage.clear();

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

axios.interceptors.request.use((config) => {
  if (config.skipAuthRefresh || isAuthEndpoint(config.url)) {
    return config;
  }

  const token = authStorage.getAccessToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.skipAuthRefresh ||
      isAuthEndpoint(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const token = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return axios(originalRequest);
    } catch (refreshError) {
      redirectToLogin();
      return Promise.reject(refreshError);
    }
  }
);

export const authFetch = async (url, options = {}) => {
  const { skipAuthRefresh, headers, ...fetchOptions } = options;
  const requestOptions = {
    ...fetchOptions,
    headers: skipAuthRefresh ? headers : getAuthHeaders(headers),
  };

  let response = await fetch(url, requestOptions);

  if (response.status !== 401 || skipAuthRefresh || isAuthEndpoint(url)) {
    return response;
  }

  try {
    const token = await refreshAccessToken();
    response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    redirectToLogin();
  }

  return response;
};
