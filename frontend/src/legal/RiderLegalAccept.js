import React, { useState } from "react";

import { acceptRideLegal } from "./legalApi";
import RiderTermsAcceptance, { useRiderLegalAcceptance } from "./components/RiderTermsAcceptance";
import "./legal-compliance.css";

function getReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("return");
  if (next && next.startsWith("/")) return next;
  return "/rider-dashboard";
}

/**
 * Dedicated Yala Ride legal acceptance screen (checkbox — no signature).
 * Used before first ride and when terms versions change.
 */
export default function RiderLegalAccept({ onAccepted, onBack }) {
  const returnPath = getReturnPath();
  const {
    termsChecked,
    privacyChecked,
    allAccepted,
    setTermsChecked,
    setPrivacyChecked,
  } = useRiderLegalAcceptance();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!allAccepted) {
      setError("Please accept the Yala Ride Terms & Conditions and Privacy Policy.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await acceptRideLegal({
        device_info: (navigator.userAgent || "").slice(0, 500),
      });
      onAccepted?.();
      window.location.href = returnPath;
    } catch (err) {
      setError(err.message || "Could not save your acceptance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="yala-legal-sign">
      <header className="yala-legal-sign__header">
        <button
          type="button"
          className="yala-legal-sign__back"
          onClick={onBack || (() => { window.location.href = returnPath; })}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <strong>Yala Ride Legal</strong>
          <p>Terms &amp; Privacy acceptance required</p>
        </div>
      </header>

      <div className="yala-legal-sign__content">
        <section className="yala-legal-sign__section">
          <p style={{ margin: 0 }}>
            Before you request a ride, confirm that you agree to the current Yala Ride Terms &amp; Conditions and Privacy Policy.
          </p>
        </section>

        <RiderTermsAcceptance
          termsChecked={termsChecked}
          privacyChecked={privacyChecked}
          onTermsChange={setTermsChecked}
          onPrivacyChange={setPrivacyChecked}
          returnPath={returnPath}
        />

        {error ? <p className="yala-legal-sign__error" role="alert">{error}</p> : null}
      </div>

      <footer className="yala-legal-sign__footer">
        <button
          type="button"
          className="yala-legal-sign__submit"
          disabled={loading || !allAccepted}
          onClick={handleSubmit}
        >
          {loading ? "Saving…" : "Continue to ride booking"}
        </button>
      </footer>
    </div>
  );
}
