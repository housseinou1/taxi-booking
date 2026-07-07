const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https"
    : "http";

function getProductionApiUrlFromHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  const host = window.location.hostname.toLowerCase();
  if (host === "yalataxi.live" || host === "www.yalataxi.live") {
    return "https://api.yalataxi.live";
  }

  return "";
}

function getProductionWsUrlFromHostname(pathSuffix) {
  if (typeof window === "undefined") {
    return "";
  }

  const host = window.location.hostname.toLowerCase();
  if (host === "yalataxi.live" || host === "www.yalataxi.live") {
    return `wss://api.yalataxi.live/ws/${pathSuffix}/`;
  }

  return "";
}

const configuredApiUrl =
  process.env.REACT_APP_API_URL || getProductionApiUrlFromHostname();

const configuredWsUrl =
  process.env.REACT_APP_WS_URL || getProductionWsUrlFromHostname("rides");

const configuredDeliveryWsUrl =
  process.env.REACT_APP_DELIVERY_WS_URL ||
  process.env.REACT_APP_WS_URL ||
  getProductionWsUrlFromHostname("deliveries");

const isBrowserLocalDev =
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "development" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export function isLocalNetworkApiUrl(url) {
  if (!url) return true;

  if (/localhost|127\.0\.0\.1/i.test(url)) {
    return true;
  }

  try {
    const host = new URL(url).hostname;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  } catch (error) {
    return false;
  }

  return false;
}

export const isRemoteApiConfigured =
  Boolean(configuredApiUrl) && !isLocalNetworkApiUrl(configuredApiUrl);

// Only auto-point at :8000 in dev when no remote API URL is configured.
const preferLocalDevApi = isBrowserLocalDev && !isRemoteApiConfigured;

const localDevApiUrl = `${browserProtocol}://${browserHost}:8000`;
const localDevWsBase = `${browserProtocol === "https" ? "wss" : "ws"}://${browserHost}:8000/ws`;
const localDevWsUrl = `${localDevWsBase}/rides/`;
const localDevDeliveryWsUrl = `${localDevWsBase}/deliveries/`;

export const API_URL = preferLocalDevApi
  ? localDevApiUrl
  : configuredApiUrl || localDevApiUrl;

export const WS_URL = preferLocalDevApi
  ? localDevWsUrl
  : configuredWsUrl || localDevWsUrl;

export const DELIVERY_WS_URL = preferLocalDevApi
  ? localDevDeliveryWsUrl
  : configuredDeliveryWsUrl || localDevDeliveryWsUrl;

export function getApiCandidates(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const candidates = [`${API_URL}${normalizedPath}`];

  if (isRemoteApiConfigured) {
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
