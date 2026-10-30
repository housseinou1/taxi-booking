import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Hourly employee verification API (Phase 4).
 *
 * After 60 minutes of scheduled work the backend issues a secure six-digit code to the
 * employee's verified phone. The employee enters it to confirm the work session.
 *
 * SECURITY: the code is generated server-side, stored only as a salted hash, expires in five
 * minutes, is single-use, and is NEVER returned by any endpoint. This client can only read the
 * lock state, submit a code, resend, or escalate to a supervisor.
 */
const BASE = `${API_URL}/employees/verification`;

/** Lock state for the signed-in employee: countdown, attempts/resends remaining, masked phone. */
export const fetchVerificationStatus = () => authenticatedApi.get(`${BASE}/status/`);

/** Submit the six-digit code. Single use; bounded attempts; five-minute expiry. */
export const submitVerificationCode = (code) =>
  authenticatedApi.post(`${BASE}/submit/`, { code });

/** Request another code (bounded by the resend limit and a 60-second cooldown). */
export const resendVerificationCode = () => authenticatedApi.post(`${BASE}/resend/`, {});

/** Secure recovery: escalate to a supervisor when a code cannot be received. */
export const requestVerificationRecovery = (note = "") =>
  authenticatedApi.post(`${BASE}/recovery/`, { note });

/** Supervisor monitoring rows (HR Staff). Codes are never exposed. */
export const fetchVerificationMonitoring = (params = {}) =>
  authenticatedApi.get(`${BASE}/monitoring/`, { params });

/** CEO Command Center verification figures (Administrator tier). */
export const fetchVerificationCeoOverview = (params = {}) =>
  authenticatedApi.get(`${BASE}/ceo-overview/`, { params });

/** Force the automatic scheduler + expiry sweep now (HR Staff, for testing). */
export const runVerificationSweep = () => authenticatedApi.post(`${BASE}/run/`, {});
