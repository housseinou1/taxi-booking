import React, { useState } from "react";

import { takePhoto } from "../native/camera";
import { dataUrlToFile } from "./DeliveryShared";

export default function DeliveryDropoffProof({
  title = "Confirm delivery",
  subtitle = "Ask the recipient for their 4-digit delivery PIN, then take a photo of the package handoff.",
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

  const capturePhoto = async () => {
    setLocalError("");
    const shot = await takePhoto();
    if (shot?.dataUrl) {
      setPhoto(shot);
    }
  };

  const handleSubmit = async () => {
    setLocalError("");
    if (pin.trim().length !== 4) {
      setLocalError("Enter the 4-digit delivery PIN from the recipient.");
      return;
    }
    if (requiresPhoto && !photo?.dataUrl) {
      setLocalError("Take a photo to confirm the package was delivered.");
      return;
    }

    const file = photo?.dataUrl ? dataUrlToFile(photo.dataUrl, "delivery-proof.jpg") : null;
    await onSubmit({ pin: pin.trim(), proofFile: file });
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

  return (
    <div className="delivery-uber-proof">
      <h3>{title}</h3>
      <p>{subtitle}</p>

      <label className="delivery-uber-proof__label" htmlFor="delivery-pin">
        Delivery PIN
      </label>
      <input
        id="delivery-pin"
        className="delivery-uber-proof__pin"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="••••"
        value={pin}
        aria-label="4-digit delivery PIN"
        onChange={(event) => {
          setLocalError("");
          setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
        }}
      />

      <div className="delivery-uber-proof__photo">
        {photo?.dataUrl ? (
          <img src={photo.dataUrl} alt="Delivery proof preview" />
        ) : (
          <div className="delivery-uber-proof__photo-placeholder">No photo yet</div>
        )}
      </div>

      <button type="button" className="delivery-uber__btn delivery-uber__btn--secondary" onClick={capturePhoto}>
        {photo ? "Retake photo" : requiresPhoto ? "Take delivery photo" : "Add delivery photo (optional)"}
      </button>

      {localError ? <p className="delivery-uber-proof__error">{localError}</p> : null}

      <button
        type="button"
        className="delivery-uber__btn"
        disabled={busy}
        onClick={handleSubmit}
      >
        {busy ? "Completing..." : "Complete delivery"}
      </button>

      <button
        type="button"
        className="delivery-uber-proof__fallback-toggle"
        onClick={() => {
          setLocalError("");
          setFallbackOpen((value) => !value);
        }}
      >
        Recipient has no PIN
      </button>

      {fallbackOpen ? (
        <div className="delivery-uber-proof__fallback">
          <strong>No PIN fallback</strong>
          <p>
            Use this only when the recipient cannot provide the PIN. The order will go to Yala admin review and will not be marked delivered yet.
          </p>

          <div className="delivery-uber-proof__fallback-actions">
            {onCall ? <button type="button" onClick={onCall}>Call recipient</button> : null}
            {onChat ? <button type="button" onClick={onChat}>Send SMS/chat message</button> : null}
            {onResendPin ? <button type="button" onClick={onResendPin}>Resend PIN to recipient</button> : null}
            {onAdminSupport ? <button type="button" onClick={onAdminSupport}>Request admin support</button> : null}
          </div>

          <label className="delivery-uber-proof__label" htmlFor="delivery-exception-reason">
            Required reason
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
            placeholder="Example: Recipient answered the phone but could not find the PIN."
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
            <span>I confirm the recipient could not provide the delivery PIN.</span>
          </label>

          <button
            type="button"
            className="delivery-uber__btn delivery-uber__btn--secondary"
            disabled={busy}
            onClick={handleExceptionSubmit}
          >
            {busy ? "Sending to review..." : "Complete with proof photo + reason"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
