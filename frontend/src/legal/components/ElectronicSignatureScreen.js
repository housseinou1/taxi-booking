import React, { useEffect, useRef, useState } from "react";

import SignaturePad, { dataUrlToBlob } from "./SignaturePad";
import { COURIER_LEGAL_DECLARATION, DRIVER_LEGAL_DECLARATION, LEGAL_VERSION, MERCHANT_LEGAL_DECLARATION } from "../legalVersions";
import "../legal-compliance.css";

function scrollReachedBottom(element, threshold = 24) {
  if (!element) return false;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export default function ElectronicSignatureScreen({
  title,
  subtitle,
  sections = [],
  declarationText,
  agreementType = "courier",
  termsVersion,
  onSubmit,
  submitLabel = "Sign & Submit Application",
  onBack,
}) {
  const contentRef = useRef(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [fullName, setFullName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const version =
    termsVersion ||
    (agreementType === "merchant"
      ? LEGAL_VERSION.merchant
      : agreementType === "driver"
        ? LEGAL_VERSION.driver
        : LEGAL_VERSION.courier);
  const declaration =
    declarationText ||
    (agreementType === "merchant"
      ? MERCHANT_LEGAL_DECLARATION
      : agreementType === "driver"
        ? DRIVER_LEGAL_DECLARATION
        : COURIER_LEGAL_DECLARATION);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;
    const onScroll = () => setScrolledToBottom(scrollReachedBottom(node));
    node.addEventListener("scroll", onScroll);
    onScroll();
    return () => node.removeEventListener("scroll", onScroll);
  }, [sections]);

  const canSubmit =
    scrolledToBottom &&
    fullName.trim().length >= 3 &&
    signatureDataUrl &&
    declarationAccepted &&
    !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("signed_full_name", fullName.trim());
      formData.append("legal_declaration_accepted", "true");
      formData.append("scrolled_to_bottom", "true");
      formData.append("terms_version", version);
      formData.append("signed_device_info", navigator.userAgent || "");
      formData.append("signed_app_version", "web");
      formData.append("signature_image", dataUrlToBlob(signatureDataUrl), "signature.png");
      await onSubmit(formData);
    } catch (err) {
      setError(err.message || "Could not submit signature.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yala-legal-sign">
      <header className="yala-legal-sign__header">
        {onBack ? (
          <button type="button" className="yala-legal-sign__back" onClick={onBack} aria-label="Back">
            ←
          </button>
        ) : (
          <span />
        )}
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="yala-legal-sign__version">{version}</span>
      </header>

      <div ref={contentRef} className="yala-legal-sign__content">
        {sections.map((section) => (
          <article key={section.id || section.title} className="yala-legal-sign__section">
            <h3>{section.title}</h3>
            {section.body ? <p>{section.body}</p> : null}
            {section.intro ? <p>{section.intro}</p> : null}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        <p className="yala-legal-sign__end-marker">— End of agreement —</p>
      </div>

      <section className="yala-legal-sign__card">
        {!scrolledToBottom ? (
          <p className="yala-legal-sign__hint">Scroll through the full agreement to unlock signing.</p>
        ) : null}

        <label className="yala-legal-sign__label" htmlFor="legal-full-name">
          Full legal name
        </label>
        <input
          id="legal-full-name"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="As shown on your government ID"
          disabled={!scrolledToBottom}
        />

        <label className="yala-legal-sign__label">Handwritten signature</label>
        <SignaturePad onChange={setSignatureDataUrl} disabled={!scrolledToBottom} />

        <label className="yala-legal-sign__check">
          <input
            type="checkbox"
            checked={declarationAccepted}
            disabled={!scrolledToBottom}
            onChange={(event) => setDeclarationAccepted(event.target.checked)}
          />
          <span>{declaration}</span>
        </label>

        {error ? <p className="yala-legal-sign__error">{error}</p> : null}

        <button type="button" className="yala-legal-sign__cta" disabled={!canSubmit} onClick={handleSubmit}>
          {busy ? "Submitting…" : submitLabel}
        </button>
      </section>
    </div>
  );
}
