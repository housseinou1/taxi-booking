const { createProxyMiddleware } = require("http-proxy-middleware");

const PRODUCTION_API = process.env.REACT_APP_API_URL || "https://api.yalataxi.live";
const LOCAL_SERVICES =
  process.env.REACT_APP_LOCAL_SERVICES || "http://127.0.0.1:8000";

const proxyPaths = [
  "/auth",
  "/rides",
  "/drivers",
  "/cities",
  "/payments",
  "/notifications",
  "/chat",
  "/promotions",
  "/deliveries",
  "/safety",
  "/features",
  "/intercity",
  "/shifts",
  "/incentives",
  "/referrals",
  "/operations",
  "/locations",
  "/support",
  "/media",
  "/api",
];

const localServicePrefixes = ["/rides/airports", "/rides/lost-found"];

function isLocalServicePath(pathname) {
  return localServicePrefixes.some((prefix) => pathname.startsWith(prefix));
}

function isApiPath(pathname) {
  return proxyPaths.some((prefix) => pathname.startsWith(prefix));
}

module.exports = function setupProxy(app) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Airport + Lost & Found need the latest Django routes. Prefer local backend in dev.
  app.use(
    createProxyMiddleware(isLocalServicePath, {
      target: LOCAL_SERVICES,
      changeOrigin: true,
      secure: false,
      logLevel: "warn",
    })
  );

  app.use(
    createProxyMiddleware(
      (pathname) => isApiPath(pathname) && !isLocalServicePath(pathname),
      {
        target: PRODUCTION_API,
        changeOrigin: true,
        secure: false,
        logLevel: "warn",
      }
    )
  );
};
