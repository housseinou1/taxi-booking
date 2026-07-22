const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https"
    : "http";

function isCapacitorNative() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.Capacitor?.isNativePlatform?.())
  );
}

const DEFAULT_PRODUCTION_API_URL = "https://www.yalataxi.live";
const DEFAULT_PRODUCTION_WS_URL = "wss://www.yalataxi.live/ws/rides/";
const DEFAULT_PRODUCTION_DELIVERY_WS_URL = "wss://www.yalataxi.live/ws/deliveries/";
const PRODUCTION_API_BASES = [
  "https://www.yalataxi.live",
  "https://api.yalataxi.live",
  // Apex may lack an A record on some public resolvers; keep as last resort.
  "https://yalataxi.live",
];
const PRODUCTION_WS_BASES = [
  "wss://www.yalataxi.live/ws/rides/",
  "wss://yalataxi.live/ws/rides/",
  "wss://api.yalataxi.live/ws/rides/",
];
const PRODUCTION_DELIVERY_WS_BASES = [
  "wss://www.yalataxi.live/ws/deliveries/",
  "wss://yalataxi.live/ws/deliveries/",
  "wss://api.yalataxi.live/ws/deliveries/",
];

function isProductionWebHost(host) {
  const normalized = String(host || "").toLowerCase();
  return normalized === "yalataxi.live" || normalized === "www.yalataxi.live";
}

function resolveApiUrl() {
  if (typeof window !== "undefined" && isProductionWebHost(window.location.hostname)) {
    // Same-origin API on production web (nginx proxies /auth/, /rides/, etc.).
    return window.location.origin;
  }

  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  return "";
}

function resolveWsUrl(pathSuffix) {
  if (typeof window !== "undefined" && isProductionWebHost(window.location.hostname)) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws/${pathSuffix}/`;
  }

  if (pathSuffix === "rides" && process.env.REACT_APP_WS_URL) {
    return process.env.REACT_APP_WS_URL;
  }

  if (pathSuffix === "deliveries") {
    return (
      process.env.REACT_APP_DELIVERY_WS_URL ||
      process.env.REACT_APP_WS_URL ||
      ""
    );
  }

  return "";
}

const configuredApiUrl = resolveApiUrl();

const configuredWsUrl = resolveWsUrl("rides");

const configuredDeliveryWsUrl = resolveWsUrl("deliveries");

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

const preferLocalDevApi = isBrowserLocalDev && !isRemoteApiConfigured;

const localDevApiUrl = `${browserProtocol}://${browserHost}:8000`;
const localDevWsBase = `${browserProtocol === "https" ? "wss" : "ws"}://${browserHost}:8000/ws`;
const localDevWsUrl = `${localDevWsBase}/rides/`;
const localDevDeliveryWsUrl = `${localDevWsBase}/deliveries/`;

export const API_URL = preferLocalDevApi
  ? localDevApiUrl
  : configuredApiUrl || (isCapacitorNative() ? DEFAULT_PRODUCTION_API_URL : localDevApiUrl);

export const WS_URL = preferLocalDevApi
  ? localDevWsUrl
  : configuredWsUrl || (isCapacitorNative() ? DEFAULT_PRODUCTION_WS_URL : localDevWsUrl);

export const DELIVERY_WS_URL = preferLocalDevApi
  ? localDevDeliveryWsUrl
  : configuredDeliveryWsUrl || (isCapacitorNative() ? DEFAULT_PRODUCTION_DELIVERY_WS_URL : localDevDeliveryWsUrl);

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

export function getProductionApiBases() {
  const bases = [];
  const add = (url) => {
    const normalized = normalizeBaseUrl(url);
    if (normalized && !isLocalNetworkApiUrl(normalized) && !bases.includes(normalized)) {
      bases.push(normalized);
    }
  };

  PRODUCTION_API_BASES.forEach(add);
  add(configuredApiUrl);
  if (bases.length === 0) {
    add(DEFAULT_PRODUCTION_API_URL);
  }
  return bases;
}

export function getWsCandidates(kind = "rides") {
  if (preferLocalDevApi) {
    return kind === "deliveries" ? [localDevDeliveryWsUrl] : [localDevWsUrl];
  }

  const bases =
    kind === "deliveries" ? PRODUCTION_DELIVERY_WS_BASES : PRODUCTION_WS_BASES;
  const configured = kind === "deliveries" ? configuredDeliveryWsUrl : configuredWsUrl;
  const candidates = [];

  if (configured && !isLocalNetworkApiUrl(configured.replace(/^wss?:\/\//, "https://"))) {
    candidates.push(configured);
  }

  for (const candidate of bases) {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates.length > 0
    ? candidates
    : [kind === "deliveries" ? DEFAULT_PRODUCTION_DELIVERY_WS_URL : DEFAULT_PRODUCTION_WS_URL];
}

export function getApiCandidates(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (isRemoteApiConfigured || isCapacitorNative()) {
    return getProductionApiBases().map((base) => `${base}${normalizedPath}`);
  }

  const candidates = [`${API_URL}${normalizedPath}`];

  if (typeof window !== "undefined") {
    const localFallback = `${window.location.protocol}//${window.location.hostname}:8000${normalizedPath}`;
    if (!candidates.includes(localFallback)) {
      candidates.push(localFallback);
    }
  }

  return candidates;
}
