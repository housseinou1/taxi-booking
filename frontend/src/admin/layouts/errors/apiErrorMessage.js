/**
 * Turn a failed API call into a precise, user-facing message.
 *
 * Yala Admin must never render an empty list or a vague failure when the real cause is
 * an expired session, a permission refusal, an unreachable backend or a server error.
 * Each cause gets its own message so an operator (including the CEO working remotely)
 * knows whether to sign in again, request access, retry, or escalate a backend fault.
 *
 * Returned messages deliberately distinguish:
 *   - no records exist            → callers show their own empty state
 *   - records failed to load      → HTTP 5xx / unexpected
 *   - access denied               → HTTP 403
 *   - authentication expired      → HTTP 401
 *   - backend unavailable         → no response at all (network/timeout)
 */
export function apiErrorMessage(error, { resource = "records", action = "load" } = {}) {
  const response = error?.response;
  const status = response?.status;
  const data = response?.data;
  const detail =
    typeof data === "string" ? "" : data?.detail || data?.error || "";

  if (!response) {
    if (error?.code === "ECONNABORTED") {
      return `The ${resource} request timed out. The backend may be busy — try again.`;
    }
    return `Could not reach the Yala backend to ${action} ${resource}. Check that the API server is running and that your connection is available.`;
  }

  if (status === 401) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (status === 403) {
    return `Access denied. Your role is not permitted to ${action} ${resource}.`;
  }
  if (status === 404) {
    return `The ${resource} service is not available on this server yet (HTTP 404). No data is shown rather than placeholder figures.`;
  }
  if (status === 429) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (status >= 500) {
    return detail
      ? `Backend error while trying to ${action} ${resource}: ${detail}`
      : `The backend failed while trying to ${action} ${resource} (HTTP ${status}). This is a server-side problem, not missing data.`;
  }
  if (detail) return detail;
  return `The ${resource} could not be ${action === "load" ? "loaded" : `${action}ed`} (HTTP ${status}).`;
}

/**
 * Same wording for helpers that throw `Error("Request failed (HTTP 404).")` instead of an
 * axios error, so raw transport text never reaches the page.
 */
export function describeLoadFailure(error, options = {}) {
  if (error?.response) return apiErrorMessage(error, options);
  const status = /HTTP (\d{3})/.exec(error?.message || "")?.[1];
  if (status) return apiErrorMessage({ response: { status: Number(status) } }, options);
  return error?.message || apiErrorMessage(error, options);
}

export default apiErrorMessage;
