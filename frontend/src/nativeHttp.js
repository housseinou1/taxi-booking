import { CapacitorHttp } from "@capacitor/core";

import { getApiCandidates } from "./apiConfig";
import { isNative } from "./native/platform";

function normalizeHeaders(headers = {}) {
  const normalized = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value != null) normalized[key] = String(value);
  });
  return normalized;
}

function toCapacitorBody(data) {
  if (data == null) return undefined;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (error) {
      return data;
    }
  }
  return data;
}

function buildAxiosLikeResponse(response, url) {
  let data = response?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (error) {
      data = data || {};
    }
  }

  const status = Number(response?.status || 0);
  const ok = status >= 200 && status < 300;

  return {
    status,
    data: data ?? {},
    ok,
    url,
  };
}

function buildNetworkError(error, url) {
  const networkError = new Error(error?.message || "Network request failed");
  networkError.request = true;
  networkError.code = error?.code || error?.name;
  networkError.url = url;
  return networkError;
}

function buildHttpError(response, url) {
  const httpError = new Error(`Request failed (${response.status})`);
  httpError.response = {
    status: response.status,
    data: response.data,
  };
  httpError.url = url;
  return httpError;
}

export async function postWithNativeFallback(path, payload, headers = {}, timeoutMs = 12000) {
  const candidates = getApiCandidates(path);
  let lastError = null;

  for (const url of candidates) {
    try {
      const response = await CapacitorHttp.post({
        url,
        headers: {
          "Content-Type": "application/json",
          ...normalizeHeaders(headers),
        },
        data: payload,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      const normalized = buildAxiosLikeResponse(response, url);
      if (!normalized.ok) {
        throw buildHttpError(normalized, url);
      }
      return normalized;
    } catch (error) {
      lastError = error;
      if (error?.response) {
        throw error;
      }
    }
  }

  throw lastError || buildNetworkError(new Error("Network request failed"), candidates[0]);
}

export function shouldUseNativeHttp() {
  return isNative();
}
