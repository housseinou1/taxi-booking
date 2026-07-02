/** Central legal document versions — bump to require re-acceptance. */
export const LEGAL_VERSION = {
  rider: "v1.0",
  driver: "v1.0",
  courier: "v1.0",
  merchant: "v1.0",
};

/** @deprecated Use LEGAL_VERSION — kept for existing imports */
export const LEGAL_VERSIONS = {
  ...LEGAL_VERSION,
  rideTerms: LEGAL_VERSION.rider,
  riderTerms: LEGAL_VERSION.rider,
  driverAgreement: LEGAL_VERSION.driver,
  customerDelivery: "v1.1",
  customerPrivacy: "v1.0",
  ridePrivacy: "v1.0",
  riderPrivacy: "v1.0",
};

export const COURIER_LEGAL_DECLARATION =
  "I confirm that this electronic signature is legally binding and that I agree to the Yala Delivery Terms & Conditions.";

export const MERCHANT_LEGAL_DECLARATION =
  "I confirm that this electronic signature is legally binding and that I agree to the Yala Merchant Terms & Conditions.";

export const DRIVER_LEGAL_DECLARATION =
  "I confirm that this electronic signature is legally binding and that I agree to the Yala Driver Agreement.";

export const COURIER_TERMS_VERSION = LEGAL_VERSION.courier;

/** Re-export sign paths for version-gate redirects */
export { LEGAL_SIGN_PATHS } from "./legalVersionGate";
