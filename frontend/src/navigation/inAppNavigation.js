/**
 * SPA navigation for the single-page App shell.
 * Prefer this over window.location.href for in-app routes so the driver
 * session, WebSocket, and online state are not torn down on every tap.
 */
export function navigateInApp(path) {
  if (typeof window === "undefined" || !path) return;

  const target = String(path).split("?")[0] || "/";
  const current = window.location.pathname || "/";

  if (current === target) return;

  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
