import React, { useState } from "react";

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

  return (
    <div className="delivery-uber-trip__pickup-proof">
      <p className="delivery-uber-trip__subtitle">
        Ask the sender for the 4-digit pickup PIN to confirm package collection.
      </p>
      <label className="delivery-uber__input-card">
        <span className="delivery-uber__input-label">Pickup PIN</span>
        <input
          className="delivery-uber-proof__pin"
          value={pickupPin}
          onChange={(e) => {
            setError("");
            setPickupPin(e.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          placeholder="••••"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          aria-label="4-digit pickup PIN"
        />
      </label>
      {error ? <p className="delivery-uber-proof__error">{error}</p> : null}
      <button
        type="button"
        className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--primary"
        disabled={busy || pickupPin.length !== 4}
        onClick={handleSubmit}
      >
        {busy ? "Verifying..." : "Verify PIN & pick up"}
      </button>
    </div>
  );
}
