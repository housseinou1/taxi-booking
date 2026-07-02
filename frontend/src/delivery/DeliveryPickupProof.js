import React, { useState } from "react";

import { CourierActionButton, CourierStickyActionBar } from "./components/CourierActionButton";

export default function DeliveryPickupProof({
  delivery,
  busy = false,
  onSubmit,
}) {
  const [pickupPin, setPickupPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (pickupPin.length !== 4) {
      setError("Enter the 4-digit pickup PIN from the sender.");
      return;
    }
    onSubmit({ pickupPin });
  };

  const pinDigits = pickupPin.padEnd(4, " ").split("").slice(0, 4);

  return (
    <div className="cce-pin-sheet">
      <div className="cce-pin-sheet__body">
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--yala-muted)", lineHeight: 1.45 }}>
          Ask the sender for the 4-digit pickup PIN to confirm package collection.
        </p>

        <div className="cce-pin-boxes" aria-hidden>
          {pinDigits.map((digit, index) => (
            <div key={index} className={`cce-pin-box ${digit.trim() ? "is-filled" : ""}`}>
              {digit.trim() ? digit : "·"}
            </div>
          ))}
        </div>

        <input
          className="cce-pin-hidden"
          style={{ position: "relative", opacity: 1, height: 48, width: "100%", marginBottom: 8 }}
          value={pickupPin}
          onChange={(e) => {
            setError("");
            setPickupPin(e.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          placeholder="Enter pickup PIN"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          aria-label="4-digit pickup PIN"
        />

        {error ? <p className="cce-pin-error">{error}</p> : null}
      </div>

      <CourierStickyActionBar>
        <CourierActionButton
          variant="finish"
          iconName="check"
          fullWidth
          loading={busy}
          disabled={pickupPin.length !== 4}
          onClick={handleSubmit}
          ariaLabel={pickupPin.length === 4 ? "Confirm pickup" : "Enter pickup PIN"}
        >
          {pickupPin.length === 4 ? "Picked Up" : "Confirm PIN"}
        </CourierActionButton>
      </CourierStickyActionBar>
    </div>
  );
}
