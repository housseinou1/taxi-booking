/**
 * Build-time gates for UI that depends on backend routes not yet on production.
 *
 * Frontend-only production deploy (legacy backend):
 *   REACT_APP_MOOSYL_UI_ENABLED=0
 *   REACT_APP_ID_CARD_ADMIN_UI_ENABLED=0
 *
 * Default (unset): all enabled — local/staging/full coordinated releases.
 */

function envEnabled(name, defaultWhenUnset = true) {
  const raw = process.env[name];
  if (raw === "0" || String(raw).toLowerCase() === "false") return false;
  if (raw === "1" || String(raw).toLowerCase() === "true") return true;
  return defaultWhenUnset;
}

export function moosylUiEnabled() {
  return envEnabled("REACT_APP_MOOSYL_UI_ENABLED", true);
}

export function idCardAdminUiEnabled() {
  return envEnabled("REACT_APP_ID_CARD_ADMIN_UI_ENABLED", true);
}

const MOBILE_MONEY_IDS = new Set(["bankily", "masrvi", "masravi", "seddad", "sedad"]);

/** Rider/delivery checkout: keep cash, wallet, card when Moosyl backend is absent. */
export function filterRiderPaymentOptions(options) {
  if (moosylUiEnabled()) return options;
  return (options || []).filter((o) => !MOBILE_MONEY_IDS.has(String(o.id || "").toLowerCase()));
}
