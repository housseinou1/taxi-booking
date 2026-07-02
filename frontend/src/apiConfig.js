const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https"
    : "http";

const configuredApiUrl = process.env.REACT_APP_API_URL || "";

const isBrowserLocalDev =
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "development" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const localDevApiUrl = `${browserProtocol}://${browserHost}:8000`;
const localDevWsBase = `${browserProtocol === "https" ? "wss" : "ws"}://${browserHost}:8000/ws`;
const localDevWsUrl = `${localDevWsBase}/rides/`;
const localDevDeliveryWsUrl = `${localDevWsBase}/deliveries/`;

export const API_URL = isBrowserLocalDev
  ? localDevApiUrl
  : configuredApiUrl || localDevApiUrl;

export const WS_URL =
  isBrowserLocalDev
    ? localDevWsUrl
    : process.env.REACT_APP_WS_URL || localDevWsUrl;

export const DELIVERY_WS_URL =
  isBrowserLocalDev
    ? localDevDeliveryWsUrl
    : process.env.REACT_APP_DELIVERY_WS_URL || process.env.REACT_APP_WS_URL || localDevDeliveryWsUrl;

export function getApiCandidates(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const candidates = [`${API_URL}${normalizedPath}`];

  if (
    typeof window !== "undefined" &&
    configuredApiUrl &&
    !isBrowserLocalDev &&
    !configuredApiUrl.includes("localhost") &&
    !configuredApiUrl.includes("127.0.0.1")
  ) {
    return candidates;
  }

  if (typeof window !== "undefined") {
    const localFallback = `${window.location.protocol}//${window.location.hostname}:8000${normalizedPath}`;
    if (!candidates.includes(localFallback)) {
      candidates.push(localFallback);
    }
  }

  return candidates;
}
