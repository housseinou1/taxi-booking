import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "../../marketConfig";
import { playRideRequestAlert, stopRideRequestAlert } from "../../native/sound";
import "./RideRequestCard.css";

const RIDE_TYPE_ICONS = {
  Comfort:  "🚙",
  XL:       "🚐",
  Share:    "🤝",
  Delivery: "📦",
  Regular:  "🚗",
};

function getRideTypeIcon(rideType) {
  return RIDE_TYPE_ICONS[rideType] || "🚗";
}

function formatEtaMinutes(seconds) {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  return mins <= 1 ? "< 1 min" : `${mins} min`;
}

function SurgeBadge({ multiplier }) {
  if (!multiplier || multiplier <= 1) return null;
  return (
    <span className="ride-request-sheet__surge">
      ⚡ {multiplier}x
    </span>
  );
}

const COUNTDOWN_SECONDS = 30;
const RING_INTERVAL_MS = 2800;
const TIMER_RADIUS = 23;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

function getStopCount(ride) {
  if (!ride) return 0;
  if (Array.isArray(ride.stops) && ride.stops.length > 0) {
    return ride.stops.length;
  }
  if (typeof ride.stop_count === "number" && ride.stop_count > 0) {
    return ride.stop_count;
  }
  return 0;
}

function getRideId(ride) {
  return ride?.id || ride?.ride_id;
}

/**
 * Lyft/Uber-style incoming ride request sheet with countdown and alert sounds.
 */
export default function RideRequestCard({
  ride,
  onAccept,
  onDecline,
  onExpired,
  enableSound = true,
  accepting = false,
}) {
  const totalSeconds = ride?.countdown || COUNTDOWN_SECONDS;
  const [countdown, setCountdown] = useState(totalSeconds);
  const [expired, setExpired] = useState(false);
  const countdownRef = useRef(null);
  const stopCount = getStopCount(ride);
  const isUrgent = countdown <= 10;
  const countdownPercent = countdown / totalSeconds;
  const strokeOffset = TIMER_CIRCUMFERENCE * (1 - countdownPercent);

  const handleExpired = useCallback(() => {
    setExpired(true);
    if (onExpired) {
      onExpired();
    }
  }, [onExpired]);

  useEffect(() => {
    if (expired) return undefined;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          handleExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [expired, handleExpired]);

  useEffect(() => {
    const rideId = getRideId(ride);
    if (!enableSound || expired || !rideId) {
      return undefined;
    }

    let cancelled = false;
    const ring = async () => {
      if (!cancelled) {
        await playRideRequestAlert({ force: true });
      }
    };

    ring();
    const intervalId = window.setInterval(ring, RING_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      stopRideRequestAlert();
    };
  }, [enableSound, expired, getRideId(ride)]);

  const pickupLabel = ride?.pickup || ride?.pickup_address || "Pickup";
  const destinationLabel = ride?.destination || ride?.destination_address || "Destination";
  const rideTypeIcon = getRideTypeIcon(ride?.ride_type);
  const etaLabel = formatEtaMinutes(ride?.eta_to_pickup_seconds ?? ride?.driver_eta_seconds);
  const surgeMultiplier = ride?.surge_multiplier || ride?.price_multiplier || null;
  const driverEarning = ride?.driver_earning ?? ride?.driver_share ?? null;

  const content = expired ? (
    <div className="ride-request-overlay" role="alert" aria-live="assertive">
      <div className="ride-request-overlay__backdrop" />
      <section className="ride-request-sheet ride-request-sheet--expired">
        <p className="ride-request-sheet__expired-title">Request expired</p>
        <p className="ride-request-sheet__expired-copy">Waiting for the next rider nearby.</p>
      </section>
    </div>
  ) : (
    <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="New ride request">
      <div className="ride-request-overlay__backdrop" />
      <section className={`ride-request-sheet${isUrgent ? " ride-request-sheet--urgent" : ""}`}>
        <div className="ride-request-sheet__handle" aria-hidden="true" />

        <div className="ride-request-sheet__header">
          <div>
            <p className="ride-request-sheet__eyebrow">New ride offer</p>
            <h2 className="ride-request-sheet__title">Accept this trip?</h2>
          </div>
          <div
            className="ride-request-sheet__timer"
            role="progressbar"
            aria-valuenow={countdown}
            aria-valuemin={0}
            aria-valuemax={totalSeconds}
            aria-label={`${countdown} seconds remaining`}
          >
            <svg viewBox="0 0 54 54" aria-hidden="true">
              <circle className="ride-request-sheet__timer-track" cx="27" cy="27" r={TIMER_RADIUS} />
              <circle
                className={`ride-request-sheet__timer-progress${
                  isUrgent ? " ride-request-sheet__timer-progress--urgent" : ""
                }`}
                cx="27"
                cy="27"
                r={TIMER_RADIUS}
                strokeDasharray={TIMER_CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
              />
            </svg>
            <span className="ride-request-sheet__timer-label">{countdown}s</span>
          </div>
        </div>

        <div className="ride-request-sheet__fare-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 26 }}>{rideTypeIcon}</span>
            <strong className="ride-request-sheet__fare">{formatMoney(ride?.fare)}</strong>
            <SurgeBadge multiplier={surgeMultiplier} />
          </div>
          <div className="ride-request-sheet__meta">
            {etaLabel && (
              <span className="ride-request-sheet__pill ride-request-sheet__pill--eta">
                📍 {etaLabel}
              </span>
            )}
            {ride?.distance_km != null && (
              <span className="ride-request-sheet__pill">{ride.distance_km} km</span>
            )}
            {stopCount > 0 && (
              <span className="ride-request-sheet__pill ride-request-sheet__pill--stops">
                {stopCount} {stopCount === 1 ? "stop" : "stops"}
              </span>
            )}
          </div>
        </div>
        {driverEarning != null && (
          <p style={{ margin: "-6px 0 0", fontSize: 13, fontWeight: 700, color: "#059669" }}>
            Votre gain estimé : <strong>{formatMoney(driverEarning)}</strong>
          </p>
        )}

        <div className="ride-request-sheet__route">
          <div className="ride-request-sheet__route-row">
            <div className="ride-request-sheet__route-marker">
              <span className="ride-request-sheet__route-dot" />
              <span className="ride-request-sheet__route-line" />
            </div>
            <p className="ride-request-sheet__route-text">
              <span className="ride-request-sheet__route-label">Pickup</span>
              {pickupLabel}
            </p>
          </div>
          <div className="ride-request-sheet__route-row">
            <div className="ride-request-sheet__route-marker">
              <span className="ride-request-sheet__route-square" />
            </div>
            <p className="ride-request-sheet__route-text">
              <span className="ride-request-sheet__route-label">Drop-off</span>
              {destinationLabel}
            </p>
          </div>
        </div>

        <div className="ride-request-sheet__actions">
          <button
            type="button"
            className="ride-request-sheet__accept"
            onClick={onAccept}
            disabled={accepting}
            aria-label="Accept ride request"
          >
            {accepting ? "Accepting..." : "Accept"}
          </button>
          <button
            type="button"
            className="ride-request-sheet__decline"
            onClick={onDecline}
            disabled={accepting}
            aria-label="Decline ride request"
          >
            Decline
          </button>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
