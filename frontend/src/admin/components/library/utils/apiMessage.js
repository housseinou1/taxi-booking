/**
 * Turn a RAW transport-level message into something an operator can act on.
 *
 * 106 admin call sites use the pattern
 *     setError(err?.response?.data?.detail || err?.message || "Could not load…")
 * When Django returns an HTML error page there is no `.detail`, so the fallback
 * is axios's own string — `"Request failed with status code 404"`. That reads
 * like a defect in the dashboard rather than what it usually is: the backend has
 * not deployed that route.
 *
 * This is deliberately a STRING-level normaliser, not an error-object mapper, so
 * it can be applied at the render layer (InlineError) and improve every existing
 * call site without editing them. It lives in the ADMIN library only: the shared
 * `auth/authenticatedApi` client is used by the Rider, Driver and Delivery apps,
 * and `driver/utils/availabilityErrors.js` branches on `error.message`, so the
 * shared client must not be changed.
 */

const STATUS_MESSAGES = {
  400: "The backend rejected this request as invalid.",
  401: "Your session has expired. Sign in again to continue.",
  403: "Access denied. Your role is not permitted to view this.",
  404: "This endpoint is not available on the backend (HTTP 404). That is a deployment or configuration problem, not missing data.",
  405: "The backend does not accept this request method (HTTP 405).",
  408: "The backend timed out handling this request (HTTP 408).",
  409: "The request conflicted with the current state of the data (HTTP 409).",
  429: "Too many requests. Wait a moment and try again.",
  500: "The backend failed while handling this request (HTTP 500). This is a server-side problem, not missing data.",
  502: "The backend gateway is unavailable (HTTP 502).",
  503: "The backend is temporarily unavailable (HTTP 503).",
  504: "The backend did not respond in time (HTTP 504).",
};

const RAW_STATUS_RE = /^Request failed with status code (\d{3})$/;
const RAW_TIMEOUT_RE = /^timeout of \d+ms exceeded$/i;

export function humanizeApiMessage(message) {
  if (typeof message !== "string") return message;
  const text = message.trim();
  if (!text) return message;

  const statusMatch = RAW_STATUS_RE.exec(text);
  if (statusMatch) {
    const code = Number(statusMatch[1]);
    if (STATUS_MESSAGES[code]) return STATUS_MESSAGES[code];
    if (code >= 500) {
      return `The backend failed while handling this request (HTTP ${code}). This is a server-side problem, not missing data.`;
    }
    if (code >= 400) {
      return `The backend refused this request (HTTP ${code}).`;
    }
  }

  if (/^Network Error$/i.test(text)) {
    return "Could not reach the Yala backend. Check that the API server is running and that your connection is available.";
  }

  if (RAW_TIMEOUT_RE.test(text)) {
    return "The backend did not respond in time. It may be busy — try again.";
  }

  return message;
}

export default humanizeApiMessage;
