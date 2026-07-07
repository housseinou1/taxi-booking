import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./RideCancellationModal.css";

export const RIDER_CANCELLATION_REASONS = [
  "Rider not available",
  "Driver too far",
  "Wrong pickup location",
  "Emergency",
  "Waited too long",
  "Changed my mind",
  "Other",
];

export const DRIVER_CANCELLATION_REASONS = [
  "Rider not available",
  "Emergency",
  "Waited too long",
  "Wrong pickup location",
  "Vehicle issue",
  "Personal issue",
  "Safety concern",
  "Traffic / road blocked",
  "App/GPS issue",
  "Other",
];

/** @deprecated Use RIDER_CANCELLATION_REASONS */
export const CANCELLATION_REASONS = RIDER_CANCELLATION_REASONS;

const OTHER_MIN_LENGTH = 10;

export default function RideCancellationModal({
  role,
  ride,
  saving,
  error,
  onCancel,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");

  const reasons = role === "driver" ? DRIVER_CANCELLATION_REASONS : RIDER_CANCELLATION_REASONS;
  const isOther = reason === "Other";
  const otherLength = reasonDetails.trim().length;
  const otherValid = !isOther || otherLength >= OTHER_MIN_LENGTH;

  const canConfirm = Boolean(reason) && otherValid && !saving;

  const fee = useMemo(() => {
    const hasAssignedDriver = Boolean(ride?.driver || ride?.driver_name);
    if (role === "rider" && hasAssignedDriver) {
      return "A 100 MRU cancellation fee may apply.";
    }
    if (role === "driver") {
      return "A 150 MRU driver cancellation penalty may apply. Your performance score may also be reduced.";
    }
    return "No cancellation fee applies before a driver accepts.";
  }, [role, ride?.driver, ride?.driver_name]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onCancel({
      reason,
      reason_details: isOther ? reasonDetails.trim() : "",
    });
  };

  const content = (
    <div className="ride-cancel-overlay" role="presentation" onClick={onClose}>
      <section
        className="ride-cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Cancel ride"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="ride-cancel-eyebrow">Ride #{ride?.id}</span>
        <h2>Cancel this ride?</h2>
        <p>Select a reason:</p>
        <div className="ride-cancel-fee">{fee}</div>

        <div className="ride-cancel-reasons" role="listbox" aria-label="Cancellation reasons">
          {reasons.map((item) => {
            const selected = reason === item;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={selected}
                className={`ride-cancel-reason${selected ? " selected" : ""}`}
                onClick={() => {
                  setReason(item);
                  if (item !== "Other") {
                    setReasonDetails("");
                  }
                }}
              >
                <span className="ride-cancel-reason__label">{item}</span>
                {selected ? <span className="ride-cancel-reason__check" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>

        {isOther ? (
          <div className="ride-cancel-other">
            <label htmlFor="ride-cancel-other-details">Tell us the reason</label>
            <textarea
              id="ride-cancel-other-details"
              value={reasonDetails}
              onChange={(event) => setReasonDetails(event.target.value)}
              placeholder="Tell us the reason"
              rows={3}
              maxLength={500}
            />
            <span className={`ride-cancel-other__hint${otherValid ? " is-valid" : ""}`}>
              {otherLength}/{OTHER_MIN_LENGTH} characters minimum
            </span>
          </div>
        ) : null}

        {error ? <div className="ride-cancel-error" role="alert">{error}</div> : null}

        <div className="ride-cancel-actions">
          <button type="button" className="keep" onClick={onClose}>
            Keep Ride
          </button>
          <button
            type="button"
            className="confirm"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {saving ? "Cancelling..." : "Confirm Cancellation"}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}
