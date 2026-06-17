import React, { useState } from "react";
import "./RideCancellationModal.css";

export const CANCELLATION_REASONS = [
  "Rider not available",
  "Driver too far",
  "Wrong pickup location",
  "Emergency",
  "Waited too long",
  "Changed my mind",
  "Other",
];

export default function RideCancellationModal({
  role,
  ride,
  saving,
  error,
  onCancel,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const hasAssignedDriver = Boolean(ride?.driver || ride?.driver_name);
  const fee =
    role === "rider" && hasAssignedDriver
      ? "A 100 MRU cancellation fee may apply."
      : role === "driver"
        ? "A 150 MRU driver cancellation penalty may apply."
        : "No cancellation fee applies before a driver accepts.";

  return (
    <div className="ride-cancel-overlay" role="presentation">
      <section className="ride-cancel-modal" role="dialog" aria-modal="true" aria-label="Cancel ride">
        <span className="ride-cancel-eyebrow">Ride #{ride?.id}</span>
        <h2>Cancel this ride?</h2>
        <p>Select the reason that best describes why you need to cancel.</p>
        <div className="ride-cancel-fee">{fee}</div>

        <div className="ride-cancel-reasons">
          {CANCELLATION_REASONS.map((item) => (
            <button
              key={item}
              type="button"
              className={reason === item ? "selected" : ""}
              onClick={() => setReason(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {error && <div className="ride-cancel-error" role="alert">{error}</div>}

        <div className="ride-cancel-actions">
          <button type="button" className="keep" onClick={onClose}>Keep ride</button>
          <button
            type="button"
            className="confirm"
            disabled={!reason || saving}
            onClick={() => onCancel(reason)}
          >
            {saving ? "Cancelling..." : "Confirm cancellation"}
          </button>
        </div>
      </section>
    </div>
  );
}
