import React, { useEffect, useRef } from "react";

import { InlineError, StatusChip } from "../components/library";

const TIMELINE_FIELDS = [
  { key: "created_at", label: "Requested" },
  { key: "scheduled_at", label: "Scheduled" },
  { key: "driver_arrived_at", label: "Driver arrived" },
  { key: "completed_at", label: "Completed" },
  { key: "cancelled_at", label: "Cancelled" },
];

function formatTimestamp(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value} MRU`;
}

function Field({ label, children }) {
  return (
    <div className="admin-drawer__field">
      <span className="admin-drawer__field-label">{label}</span>
      <span className="admin-drawer__field-value">{children ?? "N/A"}</span>
    </div>
  );
}

/**
 * RideDetailsDrawer — responsive, read-only ride detail panel for Rides Management.
 * Renders only the fields the backend admin detail endpoint returns.
 */
export default function RideDetailsDrawer({ ride, loading, error, onClose, onRetry }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!ride && !loading && !error) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ride, loading, error, onClose]);

  if (!ride && !loading && !error) return null;

  return (
    <div className="admin-drawer__overlay" role="presentation" onClick={onClose}>
      <aside
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ride ? `Ride ${ride.id} details` : "Ride details"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">
              {ride ? `Ride #${ride.id}` : "Ride details"}
            </h2>
            {ride?.status ? <StatusChip label={ride.status} /> : null}
          </div>
          <button
            type="button"
            ref={closeRef}
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="admin-drawer__body">
          {loading ? <p className="admin-drawer__state">Loading ride details…</p> : null}

          {error ? (
            <InlineError message={error}>
              {onRetry ? (
                <button type="button" className="admin-lib-btn" onClick={onRetry}>
                  Retry
          {ride && !loading && !error ? (
            <>
              <section className="admin-drawer__section">
                <h3>Route</h3>
                <Field label="Pickup">{ride.pickup}</Field>
                <Field label="Drop-off">{ride.destination}</Field>
                <Field label="Ride type">{ride.ride_type}</Field>
                <Field label="Distance">
                  {ride.distance_km ? `${ride.distance_km} km` : "N/A"}
                </Field>
              </section>

              <section className="admin-drawer__section">
                <h3>Rider</h3>
                <Field label="Name">{ride.rider_name}</Field>
                <Field label="Email">{ride.rider_email}</Field>
                <Field label="Phone">{ride.rider_phone}</Field>
              </section>

              <section className="admin-drawer__section">
                <h3>Driver</h3>
                <Field label="Name">{ride.driver_name}</Field>
                <Field label="Email">{ride.driver_email}</Field>
                <Field label="Phone">{ride.driver_phone}</Field>
                <Field label="Rating given to rider">{ride.driver_rating ?? "N/A"}</Field>
                <Field label="Rating received">{ride.rating ?? "N/A"}</Field>
              </section>

              <section className="admin-drawer__section">
                <h3>Fare &amp; payment</h3>
                <Field label="Fare">{formatMoney(ride.fare)}</Field>
                <Field label="Driver earning">{formatMoney(ride.driver_earning)}</Field>
                <Field label="Platform fee">{formatMoney(ride.app_fee)}</Field>
                <Field label="Waiting fee">{formatMoney(ride.waiting_fee)}</Field>
                <Field label="Cancellation fee">{formatMoney(ride.cancellation_fee)}</Field>
                <Field label="Payment status">{ride.payment_status || "N/A"}</Field>
              </section>

              <section className="admin-drawer__section">
                <h3>Timeline</h3>
                {TIMELINE_FIELDS.map((entry) => (
                  <Field key={entry.key} label={entry.label}>
                    {formatTimestamp(ride[entry.key])}
                  </Field>
                ))}
              </section>

              {ride.status === "cancelled" ? (
                <section className="admin-drawer__section">
                  <h3>Cancellation</h3>
                  <Field label="Cancelled by">{ride.cancelled_by || "N/A"}</Field>
                  <Field label="Reason">{ride.cancellation_reason || "N/A"}</Field>
                  <Field label="Details">{ride.cancellation_reason_details || "N/A"}</Field>
                </section>
              ) : null}
            </>
          ) : null}

                </button>
              ) : null}
            </InlineError>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
