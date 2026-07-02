import React, { useState } from "react";

import { CUSTOMER_PRIVACY_VERSION, CUSTOMER_TERMS_VERSION } from "../deliveryCustomerTermsContent";

/**
 * Mandatory customer delivery legal checkboxes (no handwritten signature).
 */
export default function DeliveryCustomerTermsAcceptance({
  termsChecked = false,
  privacyChecked = false,
  onTermsChange,
  onPrivacyChange,
  returnPath = "/delivery",
  disabled = false,
}) {
  const termsUrl = `/delivery/customer/terms?return=${encodeURIComponent(returnPath)}`;
  const privacyUrl = `/privacy?return=${encodeURIComponent(returnPath)}`;

  return (
    <section className="delivery-customer-terms-acceptance">
      <label className="delivery-customer-terms-acceptance__check">
        <input
          type="checkbox"
          checked={termsChecked}
          disabled={disabled}
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
            Terms & Conditions
          </button>
        </span>
      </label>

      <label className="delivery-customer-terms-acceptance__check">
        <input
          type="checkbox"
          checked={privacyChecked}
          disabled={disabled}
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
        Terms {CUSTOMER_TERMS_VERSION} · Privacy {CUSTOMER_PRIVACY_VERSION}
      </small>
    </section>
  );
}

export function useCustomerLegalAcceptance() {
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
