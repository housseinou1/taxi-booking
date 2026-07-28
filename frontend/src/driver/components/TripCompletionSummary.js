import React from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "../../marketConfig";
import { PrimaryButton } from "../../design-system/components";
import "./TripCompletionSummary.css";

/**
 * UI-only completed-trip summary sheet.
 *
 * Presentation layer only: it reads values already present on the finished ride
 * object and never recalculates or persists anything. The ride lifecycle is
 * unchanged — this sheet is shown from temporary local UI state and cleared on
 * dismiss.
 */

function getRiderName(ride) {
  return (
    ride?.rider_name ||
    [ride?.rider_first_name, ride?.rider_last_name].filter(Boolean).join(" ") ||
    null
  );
}

function formatDistance(ride) {
  const km = ride?.distance_km ?? ride?.distance;
  const value = Number(km);
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} km` : null;
}

function formatDuration(ride) {
  // Use an existing duration field only — do not compute new values.
  const raw =
    ride?.duration_minutes ?? ride?.trip_duration_minutes ?? ride?.duration_min ?? null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)} min` : null;
}

function formatCompletedAt(ride) {
  const ts = ride?.completed_at || ride?.updated_at || null;
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

function formatPaymentMethod(ride) {
  const method = ride?.payment_method || ride?.payment_type || null;
  if (!method) return null;
  return String(method).replace(/_/g, " ");
}

function SummaryRow({ label, value, strong = false }) {
  if (value == null || value === "") return null;
  return (
    <div className="trip-summary__row">
      <span className="trip-summary__row-label">{label}</span>
      <span className={`trip-summary__row-value${strong ? " trip-summary__row-value--strong" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export default function TripCompletionSummary({ ride, onDismiss }) {
  if (!ride) return null;

  const riderName = getRiderName(ride);
  const distance = formatDistance(ride);
  const duration = formatDuration(ride);
  const completedAt = formatCompletedAt(ride);
  const paymentMethod = formatPaymentMethod(ride);
  const waitingFee = Number(ride?.waiting_fee ?? 0);
  const driverEarning = ride?.driver_earning ?? ride?.driver_share ?? null;

  const content = (
    <div
      className="trip-summary-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Trip completed summary"
    >
      <div className="trip-summary-overlay__backdrop" />
      <section className="trip-summary-sheet">
        <div className="trip-summary-sheet__handle" aria-hidden="true" />

        <div className="trip-summary__hero">
          <span className="trip-summary__check" aria-hidden="true">✓</span>
          <h2 className="trip-summary__title">Trip completed</h2>
          {completedAt && (
            <p className="trip-summary__subtitle">Finished at {completedAt}</p>
          )}
        </div>

        {ride?.fare != null && (
          <div className="trip-summary__fare-block">
            <span className="trip-summary__fare-label">Fare</span>
            <strong className="trip-summary__fare">{formatMoney(ride.fare)}</strong>
          </div>
        )}

        <div className="trip-summary__rows">
          <SummaryRow label="Passenger" value={riderName} />
          {waitingFee > 0 && (
            <SummaryRow label="Waiting fee" value={formatMoney(waitingFee)} />
          )}
          <SummaryRow label="Distance" value={distance} />
          <SummaryRow label="Duration" value={duration} />
          <SummaryRow label="Payment" value={paymentMethod} />
          {driverEarning != null && (
            <SummaryRow label="Your earnings" value={formatMoney(driverEarning)} strong />
          )}
        </div>

        <p className="trip-summary__ready" aria-live="polite">
          Ready for next ride
        </p>

        <PrimaryButton
          fullWidth
          size="lg"
          onClick={onDismiss}
          aria-label="Return to dashboard"
        >
          Return to dashboard
        </PrimaryButton>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }
  return createPortal(content, document.body);
}
