import axios from "axios";
import { CapacitorHttp } from "@capacitor/core";

import {
  API_URL,
  getApiCandidates,
  isRemoteApiConfigured,
} from "./apiConfig";
import { isNative } from "./native/platform";

export function shouldUseApiFallback() {
  return isRemoteApiConfigured || isNative();
}

export function extractApiPath(urlOrPath) {
  if (!urlOrPath) return "/";
  if (urlOrPath.startsWith("/")) return urlOrPath;

  try {
    const parsed = new URL(urlOrPath);
    return `${parsed.pathname}${parsed.search}`;
  } catch (error) {
    return urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  }
}

export function getRequestUrlCandidates(urlOrPath) {
  const path = extractApiPath(urlOrPath);

  if (shouldUseApiFallback()) {
    return getApiCandidates(path);
  }

  if (typeof urlOrPath === "string" && /^https?:\/\//i.test(urlOrPath)) {
    return [urlOrPath];
  }

  return [`${API_URL}${path}`];
}

export function isNetworkRequestError(error) {
  if (error?.response?.status) return false;
  return Boolean(error?.request || !error?.response);
}

async function capacitorRequest(method, url, data, config = {}) {
  const headers = { ...(config.headers || {}) };
  const timeoutMs = config.timeout || 15000;

  // Ensure Content-Type is set for JSON bodies (Capacitor HTTP does not auto-detect)
  if (data != null && method !== "get" && method !== "delete" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const options = {
    url,
    headers,
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
  };

  if (data != null && method !== "get" && method !== "delete") {
    options.data = data;
  }

  let response;
  if (method === "get") response = await CapacitorHttp.get(options);
  else if (method === "delete") response = await CapacitorHttp.delete(options);
  else if (method === "patch") response = await CapacitorHttp.patch(options);
  else if (method === "put") response = await CapacitorHttp.put(options);
  else response = await CapacitorHttp.post(options);

  let responseData = response?.data;
  if (typeof responseData === "string") {
    try {
      responseData = JSON.parse(responseData);
    } catch (error) {
      responseData = responseData || {};
    }
  }

  const status = Number(response?.status || 0);
  const axiosLike = {
    status,
    data: responseData ?? {},
    headers: response?.headers || {},
    config: { ...config, url },
  };

  if (status < 200 || status >= 300) {
    const httpError = new Error(`Request failed with status code ${status}`);
    httpError.response = axiosLike;
    httpError.request = true;
    throw httpError;
  }

  return axiosLike;
}

export async function axiosWithApiFallback(method, urlOrPath, data, config = {}) {
  const candidates = getRequestUrlCandidates(urlOrPath);
  let lastError = null;
  const useNativeHttp = isNative();

  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];
    try {
      if (useNativeHttp) {
        return await capacitorRequest(method, url, data, config);
      }
      if (method === "get") return await axios.get(url, config);
      if (method === "delete") return await axios.delete(url, config);
      if (method === "patch") return await axios.patch(url, data, config);
      if (method === "put") return await axios.put(url, data, config);
      return await axios.post(url, data, config);
    } catch (error) {
      lastError = error;
      const isLastCandidate = index === candidates.length - 1;
      const status = error?.response?.status;
      const isRetryableHttp =
        status === 503 || status === 502 || status === 504 || status === 429;

      if (isRetryableHttp && !isLastCandidate) {
        continue;
      }

      if (!isNetworkRequestError(error) || isLastCandidate) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Network request failed");
}
