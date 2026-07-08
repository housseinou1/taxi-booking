import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MARKET } from "../marketConfig";
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

/** Standard driver reasons (may affect fee / points). */
export const DRIVER_STANDARD_CANCELLATION_REASONS = [
  "Emergency",
  "Vehicle issue",
  "Personal issue",
  "Safety concern",
  "Traffic / road blocked",
  "App/GPS issue",
  "Other",
];

/** No-show family — penalty-free only after free wait + 2 logged calls. */
export const DRIVER_NO_SHOW_CANCELLATION_REASONS = [
  "Rider no-show",
  "Rider not answering calls",
  "Wrong pickup / cannot locate rider",
  "Rider refused to board",
];

export const DRIVER_CANCELLATION_REASONS = [
  ...DRIVER_NO_SHOW_CANCELLATION_REASONS,
  ...DRIVER_STANDARD_CANCELLATION_REASONS,
];

/** @deprecated Use RIDER_CANCELLATION_REASONS */
export const CANCELLATION_REASONS = RIDER_CANCELLATION_REASONS;

const OTHER_MIN_LENGTH = 10;
const MIN_CALLS_FOR_NO_SHOW = 2;

function freeWaitSeconds() {
  return Number(MARKET?.waiting?.freeMinutes || 3) * 60;
}

function computeNoShowGate(ride) {
  const freeSecs = freeWaitSeconds();
  const arrivedAt = ride?.driver_arrived_at ? new Date(ride.driver_arrived_at).getTime() : null;
  const nowMs = Date.now();
  const waitedSeconds =
    arrivedAt && Number.isFinite(arrivedAt)
      ? Math.max(0, Math.floor((nowMs - arrivedAt) / 1000))
      : 0;
  const callAttempts = Number(
    ride?.rider_call_attempt_count ?? ride?.call_attempts ?? 0
  );
  const statusOk = ride?.status === "driver_arrived";
  const waitOk = waitedSeconds >= freeSecs;
  const callsOk = callAttempts >= MIN_CALLS_FOR_NO_SHOW;
  return {
    statusOk,
    waitOk,
    callsOk,
    unlocked: statusOk && waitOk && callsOk,
    waitedSeconds,
    freeSeconds: freeSecs,
    freeSecondsRemaining: Math.max(0, freeSecs - waitedSeconds),
    callAttempts,
    minCalls: MIN_CALLS_FOR_NO_SHOW,
  };
}

export function isDriverNoShowReason(reason) {
  return DRIVER_NO_SHOW_CANCELLATION_REASONS.includes(reason);
}

export default function RideCancellationModal({
  role,
  ride,
  saving,
  error,
  onCancel,
  onClose,
  onCallRider,
}) {
  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (role !== "driver" || ride?.status !== "driver_arrived") return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [role, ride?.status, ride?.driver_arrived_at]);

  const noShowGate = useMemo(() => {
    void tick;
    return role === "driver" ? computeNoShowGate(ride) : null;
  }, [role, ride, tick]);

  const reasons = role === "driver" ? DRIVER_CANCELLATION_REASONS : RIDER_CANCELLATION_REASONS;
  const isOther = reason === "Other";
  const otherLength = reasonDetails.trim().length;
  const otherValid = !isOther || otherLength >= OTHER_MIN_LENGTH;
  const selectedNoShow = role === "driver" && isDriverNoShowReason(reason);
  const noShowBlocked = selectedNoShow && noShowGate && !noShowGate.unlocked;

  const canConfirm = Boolean(reason) && otherValid && !saving && !noShowBlocked;

  const fee = useMemo(() => {
    const hasAssignedDriver = Boolean(ride?.driver || ride?.driver_name);
    if (role === "rider" && hasAssignedDriver) {
      return "A 100 MRU cancellation fee may apply.";
    }
    if (role === "driver") {
      if (selectedNoShow && noShowGate?.unlocked) {
        return "No-show cancel unlocked: no fee and no performance points lost.";
      }
      if (selectedNoShow) {
        return "No-show cancel unlocks after free wait ends and 2 Call Rider attempts.";
      }
      return "A 150 MRU driver cancellation penalty may apply. Your performance score may also be reduced.";
    }
    return "No cancellation fee applies before a driver accepts.";
  }, [role, ride?.driver, ride?.driver_name, selectedNoShow, noShowGate]);

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

  const formatClock = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
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
        <div className={`ride-cancel-fee${selectedNoShow && noShowGate?.unlocked ? " is-waived" : ""}`}>
          {fee}
        </div>

        {role === "driver" && noShowGate ? (
          <div className="ride-cancel-gate" aria-live="polite">
            <div className="ride-cancel-gate__title">No-show checklist</div>
            <ul className="ride-cancel-gate__list">
              <li className={noShowGate.statusOk ? "is-done" : ""}>
                Arrived at pickup {noShowGate.statusOk ? "✓" : ""}
              </li>
              <li className={noShowGate.waitOk ? "is-done" : ""}>
                Free wait ended
                {!noShowGate.waitOk
                  ? ` (${formatClock(noShowGate.freeSecondsRemaining)} left)`
                  : " ✓"}
              </li>
              <li className={noShowGate.callsOk ? "is-done" : ""}>
                Called rider {noShowGate.callAttempts}/{noShowGate.minCalls}
                {noShowGate.callsOk ? " ✓" : ""}
              </li>
            </ul>
            {typeof onCallRider === "function" ? (
              <button
                type="button"
                className="ride-cancel-call"
                onClick={() => onCallRider(ride)}
              >
                Call Rider
              </button>
            ) : null}
            {!noShowGate.unlocked ? (
              <p className="ride-cancel-gate__hint">
                Complete the checklist to unlock no-show reasons without losing rate or points.
                Other reasons remain available but may affect your score.
              </p>
            ) : (
              <p className="ride-cancel-gate__hint is-ready">
                No-show reasons are unlocked.
              </p>
            )}
          </div>
        ) : null}

        <div className="ride-cancel-reasons" role="listbox" aria-label="Cancellation reasons">
          {reasons.map((item) => {
            const selected = reason === item;
            const isNoShow = role === "driver" && isDriverNoShowReason(item);
            const disabled = isNoShow && noShowGate && !noShowGate.unlocked;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={disabled}
                disabled={disabled}
                className={`ride-cancel-reason${selected ? " selected" : ""}${disabled ? " is-locked" : ""}${isNoShow ? " is-noshow" : ""}`}
                onClick={() => {
                  if (disabled) return;
                  setReason(item);
                  if (item !== "Other") {
                    setReasonDetails("");
                  }
                }}
              >
                <span className="ride-cancel-reason__label">
                  {item}
                  {isNoShow ? (
                    <span className="ride-cancel-reason__tag">No-show</span>
                  ) : null}
                </span>
                {disabled ? (
                  <span className="ride-cancel-reason__lock" aria-hidden="true">
                    🔒
                  </span>
                ) : selected ? (
                  <span className="ride-cancel-reason__check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
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
