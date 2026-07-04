import React, { useEffect, useState } from "react";

import { CourierActionButton } from "./components/CourierActionButton";

export default function DeliveryPickupProof({
  delivery,
  busy = false,
  onSubmit,
}) {
  const [pickupPin, setPickupPin] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(false);
    setPickupPin("");
    setError("");
  }, [delivery?.id, delivery?.status]);

  useEffect(() => {
    if (!busy && submitted && ["accepted", "courier_arriving"].includes(delivery?.status)) {
      setSubmitted(false);
    }
  }, [busy, submitted, delivery?.status]);

  const handleSubmit = () => {
    if (submitted || busy) return;
    setError("");
    if (pickupPin.length !== 4) {
      setError("Enter the 4-digit pickup PIN from the sender.");
      return;
    }
    setSubmitted(true);
    onSubmit({ pickupPin });
  };

  return (
    <div className="cce-pin-sheet delivery-uber-proof">
      <div className="cce-pin-sheet__body">
        <p className="cce-pin-sheet__label">Enter Pickup PIN</p>
        <p className="cce-pin-sheet__hint">
          Ask the sender for the 4-digit PIN to confirm package collection.
        </p>

        <div className="cce-pin-input-wrap">
          <input
            className="cce-pin-input"
            value={pickupPin}
            onChange={(e) => {
              setError("");
              setPickupPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            placeholder="0 0 0 0"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            aria-label="4-digit pickup PIN"
          />
        </div>

        {error ? <p className="cce-pin-error">{error}</p> : null}

        <div className="cce-pin-sheet__actions">
          <CourierActionButton
            variant="finish"
            iconName="check"
            fullWidth
            loading={busy || submitted}
            disabled={pickupPin.length !== 4 || submitted}
            onClick={handleSubmit}
            ariaLabel="Confirm pickup PIN"
          >
            {busy || submitted ? "Confirming..." : pickupPin.length === 4 ? "Picked Up" : "Confirm PIN"}
          </CourierActionButton>
        </div>
      </div>
    </div>
  );
}
