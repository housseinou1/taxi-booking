import React, { useEffect, useMemo, useRef, useState } from "react";

import { CourierActionButton } from "./components/CourierActionButton";
import { takePhoto } from "../native/camera";
import { dataUrlToFile } from "./DeliveryShared";

export default function DeliveryDropoffProof({
  title = "Complete delivery",
  subtitle = "Ask the recipient for their 4-digit PIN, then take a proof photo.",
  recipientName = "",
  recipientPhone = "",
  onSubmit,
  onException,
  onCall,
  onChat,
  onResendPin,
  onAdminSupport,
  busy = false,
  requiresPhoto = true,
}) {
  const [pin, setPin] = useState("");
  const [photo, setPhoto] = useState(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [courierConfirmed, setCourierConfirmed] = useState(false);
  const [localError, setLocalError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const pinInputRef = useRef(null);

  const canComplete = useMemo(() => {
    const pinOk = pin.trim().length === 4;
    const photoOk = !requiresPhoto || Boolean(photo?.dataUrl);
    return pinOk && photoOk;
  }, [pin, photo, requiresPhoto]);

  useEffect(() => {
    setSubmitted(false);
    setLocalError("");
  }, [recipientName, recipientPhone]);

  useEffect(() => {
    if (!busy && submitted) {
      setSubmitted(false);
    }
  }, [busy, submitted]);

  const capturePhoto = async () => {
    setLocalError("");
    const shot = await takePhoto();
    if (shot?.dataUrl) {
      setPhoto(shot);
    }
  };

  const handleSubmit = async () => {
    if (submitted || busy) return;
    setLocalError("");
    if (pin.trim().length !== 4) {
      setLocalError("Enter the 4-digit delivery PIN from the recipient.");
      return;
    }
    if (requiresPhoto && !photo?.dataUrl) {
      setLocalError("Take a photo to confirm the package was delivered.");
      return;
    }

    setSubmitted(true);
    try {
      const file = photo?.dataUrl ? dataUrlToFile(photo.dataUrl, "delivery-proof.jpg") : null;
      await onSubmit({ pin: pin.trim(), proofFile: file });
    } catch (_) {
      setSubmitted(false);
    }
  };

  const handleExceptionSubmit = async () => {
    setLocalError("");
    if (!photo?.dataUrl) {
      setLocalError("Take a proof photo before requesting admin review.");
      return;
    }
    if (!reason) {
      setLocalError("Select why the recipient cannot provide the PIN.");
      return;
    }
    if (!courierConfirmed) {
      setLocalError("Confirm that the recipient could not provide the PIN.");
      return;
    }

    const file = dataUrlToFile(photo.dataUrl, "delivery-exception-proof.jpg");
    await onException?.({ reason, exceptionNote, proofFile: file });
  };

  const reasonOptions = [
    ["recipient_unavailable", "Recipient unavailable"],
    ["recipient_forgot_pin", "Recipient forgot PIN"],
    ["recipient_phone_unreachable", "Recipient phone unreachable"],
    ["recipient_refused_pin", "Recipient refused PIN"],
    ["other", "Other"],
  ];

  const pinDigits = pin.padEnd(4, " ").split("").slice(0, 4);
  const displayName = recipientName || "Recipient";

  return (
    <div className="cce-pin-sheet delivery-uber-proof">
      <div className="cce-pin-sheet__body">
        <p className="cce-pin-sheet__label">Enter delivery PIN</p>
        <h3>{title}</h3>
        <p>{subtitle}</p>

        {recipientName ? (
          <div className="cce-recipient-card">
            <span className="cce-recipient-card__avatar" aria-hidden>
              {displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{displayName}</strong>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--yala-muted)" }}>
                {recipientPhone || "Recipient contact"}
              </p>
            </div>
          </div>
        ) : null}

        <div
          className="cce-pin-input-wrap"
          onClick={() => pinInputRef.current?.focus()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") pinInputRef.current?.focus();
          }}
        >
          <input
            ref={pinInputRef}
            style={{ display: "block", width: "100%", height: 52, marginTop: 4, marginBottom: 8, fontSize: 24, textAlign: "center", letterSpacing: "0.3em", border: "2px solid #e5e7eb", borderRadius: 12, background: "#f9fafb", color: "#111827" }}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            placeholder="0000"
            aria-label="4-digit delivery PIN"
            onChange={(event) => {
              setLocalError("");
              setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
            }}
          />
          <div className="cce-pin-boxes" aria-hidden>
            {pinDigits.map((digit, index) => (
              <div key={index} className={`cce-pin-box ${digit.trim() ? "is-filled" : ""}`}>
                {digit.trim() ? digit : "·"}
              </div>
            ))}
          </div>
        </div>

        <div className="cce-proof-card">
          {photo?.dataUrl ? (
            <img src={photo.dataUrl} alt="Delivery proof preview" />
          ) : (
            <div className="cce-proof-card__placeholder">Proof photo</div>
          )}
        </div>

        <CourierActionButton variant="nav" fullWidth onClick={capturePhoto}>
          {photo ? "Retake photo" : requiresPhoto ? "Take delivery photo" : "Add photo (optional)"}
        </CourierActionButton>

        {localError ? <p className="cce-pin-error">{localError}</p> : null}

        <button
          type="button"
          className="cce-pin-link"
          onClick={() => {
            setLocalError("");
            setFallbackOpen((value) => !value);
          }}
        >
          Can't get PIN?
        </button>

        {fallbackOpen ? (
          <div className="delivery-uber-proof__fallback" style={{ marginTop: 12 }}>
            <strong>No PIN fallback</strong>
            <p>
              Use only when the recipient cannot provide the PIN. Yala admin will review before completing.
            </p>

            <div className="delivery-uber-proof__fallback-actions">
              {onCall ? <button type="button" onClick={onCall}>Call recipient</button> : null}
              {onChat ? <button type="button" onClick={onChat}>Message</button> : null}
              {onResendPin ? <button type="button" onClick={onResendPin}>Resend PIN</button> : null}
              {onAdminSupport ? <button type="button" onClick={onAdminSupport}>Admin support</button> : null}
            </div>

            <label className="delivery-uber-proof__label" htmlFor="delivery-exception-reason">
              Reason
            </label>
            <select
              id="delivery-exception-reason"
              className="delivery-uber-proof__select"
              value={reason}
              onChange={(event) => {
                setLocalError("");
                setReason(event.target.value);
              }}
            >
              <option value="">Choose reason</option>
              {reasonOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className="delivery-uber-proof__label" htmlFor="delivery-exception-note">
              Note for admin
            </label>
            <textarea
              id="delivery-exception-note"
              className="delivery-uber-proof__textarea"
              rows={3}
              placeholder="Brief description for support"
              value={exceptionNote}
              onChange={(event) => setExceptionNote(event.target.value)}
            />

            <label className="delivery-uber-proof__confirm">
              <input
                type="checkbox"
                checked={courierConfirmed}
                onChange={(event) => {
                  setLocalError("");
                  setCourierConfirmed(event.target.checked);
                }}
              />
              <span>I confirm the recipient could not provide the PIN.</span>
            </label>

            <CourierActionButton variant="nav" fullWidth loading={busy} onClick={handleExceptionSubmit}>
              Submit for review
            </CourierActionButton>
          </div>
        ) : null}

        <div className="cce-pin-sheet__actions">
          <CourierActionButton
            variant="finish"
            iconName="check"
            fullWidth
            loading={busy || submitted}
            disabled={!canComplete || submitted}
            onClick={handleSubmit}
            ariaLabel={canComplete ? "Complete delivery" : "Confirm delivery PIN"}
          >
            {busy || submitted ? "Completing..." : canComplete ? "Complete Delivery" : "Confirm PIN"}
          </CourierActionButton>
        </div>
      </div>
    </div>
  );
}
