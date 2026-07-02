import React from "react";

import { COURIER_TERMS_VERSION } from "../deliveryCourierTermsContent";

/**
 * Mandatory courier terms checkbox for onboarding.
 */
export default function DeliveryCourierTermsAcceptance({
  checked,
  onChange,
  returnPath = "/delivery/profile-setup",
  disabled = false,
}) {
  const termsUrl = `/delivery/courier/terms?return=${encodeURIComponent(returnPath)}&accept=1`;

  return (
    <section className="delivery-courier-terms-acceptance">
      <label className="delivery-courier-terms-acceptance__check">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          I have read and agree to the{" "}
          <button
            type="button"
            className="delivery-courier-terms-acceptance__link"
            onClick={(event) => {
              event.preventDefault();
              window.location.href = termsUrl;
            }}
          >
            Yala Delivery Courier Terms
          </button>
        </span>
      </label>
      <small className="delivery-courier-terms-acceptance__version">Version {COURIER_TERMS_VERSION}</small>
    </section>
  );
}
