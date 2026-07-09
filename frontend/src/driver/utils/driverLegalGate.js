import { fetchLegalStatus } from "../../legal/legalApi";
import { getLegalGate, requiresLegalResign } from "../../legal/legalVersionGate";

export const DRIVER_SIGN_PATH = "/driver/sign";

export function isDriverAgreementBlocked(driverLegal) {
  if (!driverLegal) return true;
  return Boolean(
    driverLegal.blocked
      || driverLegal.requires_resign
      || !driverLegal.signature_complete
      || !driverLegal.agreement_current
      || !driverLegal.compliance_current
  );
}

export function isDriverTermsError(error) {
  const data = error?.response?.data || {};
  const message = String(data.detail || data.error || "").toLowerCase();
  return (
    data.code === "driver_terms_required"
    || data.driver_terms_required
    || message.includes("driver agreement")
    || message.includes("yala driver agreement")
  );
}

export function redirectToDriverAgreement(returnPath = "/driver") {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith(DRIVER_SIGN_PATH)) return;
  const query = returnPath ? `?return=${encodeURIComponent(returnPath)}` : "";
  window.location.assign(`${DRIVER_SIGN_PATH}${query}`);
}

export async function loadDriverLegalGate() {
  const status = await fetchLegalStatus();
  const driver = status?.driver || getLegalGate(status, "driver");
  return {
    status,
    driver,
    blocked: isDriverAgreementBlocked(driver),
    requiresResign: Boolean(driver?.requires_resign || requiresLegalResign(status, "driver")),
  };
}

export function redirectIfDriverAgreementRequired(driverLegal, returnPath = "/driver") {
  if (!isDriverAgreementBlocked(driverLegal)) return false;
  redirectToDriverAgreement(returnPath);
  return true;
}

export async function ensureDriverAgreementBeforeOnline(returnPath = "/driver") {
  try {
    const gate = await loadDriverLegalGate();
    if (redirectIfDriverAgreementRequired(gate.driver, returnPath)) {
      return false;
    }
    return true;
  } catch (error) {
    console.log("Driver legal gate error:", error.response?.data || error);
    return { ok: false, error: "Could not verify driver agreement. Check your connection and try again." };
  }
}
