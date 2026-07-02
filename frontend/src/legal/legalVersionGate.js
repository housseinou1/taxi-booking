import { LEGAL_VERSION } from "./legalVersions";

/** Paths where each role must re-accept or e-sign after a version bump. */
export const LEGAL_SIGN_PATHS = {
  rider: "/rider/legal",
  ride: "/rider/legal",
  driver: "/driver/sign",
  courier: "/delivery/courier/sign",
  merchant: "/merchant/sign",
  customer_delivery: "/delivery",
};

/**
 * Read compliance gate from /legal/status/ payload for a role.
 */
export function getLegalGate(status, role = "ride") {
  if (!status) return null;
  return status[role] || status.ride || status.rider || null;
}

export function isLegalCompliant(status, role = "ride") {
  const gate = getLegalGate(status, role);
  return Boolean(gate?.compliance_current);
}

export function requiresLegalResign(status, role = "ride") {
  const gate = getLegalGate(status, role);
  return Boolean(gate?.requires_resign);
}

export function isLegalBlocked(status, role = "ride") {
  const gate = getLegalGate(status, role);
  if (!gate) return false;
  return Boolean(gate.blocked || gate.requires_resign || !gate.compliance_current);
}

export function getLegalSignPath(status, role = "ride") {
  const gate = getLegalGate(status, role);
  if (gate?.sign_path) return gate.sign_path;
  return LEGAL_SIGN_PATHS[role] || LEGAL_SIGN_PATHS.ride;
}

/**
 * Redirect when the user signed an outdated legal version (re-sign required).
 * First-time users (never accepted) are not redirected — they accept at checkout.
 */
export function redirectIfLegalResignRequired(status, role = "ride", returnPath = "") {
  if (!requiresLegalResign(status, role)) {
    return false;
  }
  const base = getLegalSignPath(status, role);
  const query = returnPath ? `?return=${encodeURIComponent(returnPath)}` : "";
  if (typeof window !== "undefined" && !window.location.pathname.startsWith(base.split("?")[0])) {
    window.location.href = `${base}${query}`;
    return true;
  }
  return false;
}

/**
 * Compare cached client versions with server-published versions.
 */
export function versionsOutOfSync(serverVersions = {}, localVersions = LEGAL_VERSION) {
  const remote = serverVersions.legal_version || serverVersions;
  return Object.keys(localVersions).some(
    (key) => remote[key] && remote[key] !== localVersions[key]
  );
}
