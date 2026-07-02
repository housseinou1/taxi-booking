import React, { useState } from "react";

import { LEGAL_VERSION, LEGAL_VERSIONS } from "../legalVersions";
import "../legal-compliance.css";

/**
 * Mandatory Yala Ride taxi legal checkboxes (no handwritten signature).
 */
export default function RiderTermsAcceptance({
  termsChecked = false,
  privacyChecked = false,
  onTermsChange,
  onPrivacyChange,
  returnPath = "/rider-dashboard",
  disabled = false,
  hideIfCompliant = false,
  compliant = false,
}) {
  if (hideIfCompliant && compliant) {
    return null;
  }

  const termsUrl = `/terms?return=${encodeURIComponent(returnPath)}`;
  const privacyUrl = `/privacy?return=${encodeURIComponent(returnPath)}`;

  return (
    <section className="delivery-customer-terms-acceptance rider-terms-acceptance">
      <label className="delivery-customer-terms-acceptance__check">
        <input
          type="checkbox"
          checked={termsChecked}
          disabled={disabled || compliant}
          onChange={(event) => onTermsChange?.(event.target.checked)}
        />
        <span>
          I agree to the{" "}
          <button
            type="button"
            className="delivery-customer-terms-acceptance__link"
            onClick={(event) => {
              event.preventDefault();
              window.location.href = termsUrl;
            }}
          >
            Yala Ride Terms & Conditions
          </button>
        </span>
      </label>

      <label className="delivery-customer-terms-acceptance__check">
        <input
          type="checkbox"
          checked={privacyChecked}
          disabled={disabled || compliant}
          onChange={(event) => onPrivacyChange?.(event.target.checked)}
        />
        <span>
          I agree to the{" "}
          <button
            type="button"
            className="delivery-customer-terms-acceptance__link"
            onClick={(event) => {
              event.preventDefault();
              window.location.href = privacyUrl;
            }}
          >
            Privacy Policy
          </button>
        </span>
      </label>

      <small className="delivery-customer-terms-acceptance__version">
        Terms {LEGAL_VERSION.rider} · Privacy {LEGAL_VERSIONS.ridePrivacy}
      </small>
    </section>
  );
}

export function useRiderLegalAcceptance() {
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const allAccepted = termsChecked && privacyChecked;
  return {
    termsChecked,
    privacyChecked,
    allAccepted,
    setTermsChecked,
    setPrivacyChecked,
  };
}
