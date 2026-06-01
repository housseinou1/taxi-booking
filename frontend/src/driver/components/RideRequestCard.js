import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "../../marketConfig";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  errorRed: "#EF4444",
};

// ─── Constants ──────────────────────────────────────────────────────────────
const COUNTDOWN_SECONDS = 30;

/**
 * RideRequestCard - Displays an incoming ride request with a 30-second countdown timer.
 *
 * Props:
 * - ride: object with pickup, destination, fare, distance_km, stops/stop_count, countdown
 * - onAccept: callback when driver accepts the ride
 * - onDecline: callback when driver declines the ride
 * - onExpired: callback when the countdown reaches zero (auto-dismiss)
 *
 * Validates: Requirements 3.1, 3.9, Multi-stop rides
 */
export default function RideRequestCard({ ride, onAccept, onDecline, onExpired }) {
  const totalSeconds = ride?.countdown || COUNTDOWN_SECONDS;
  const [countdown, setCountdown] = useState(totalSeconds);
  const [expired, setExpired] = useState(false);
  const countdownRef = useRef(null);

  // Determine multi-stop info
  const stopCount = getStopCount(ride);
  const hasMultipleStops = stopCount > 0;

  // Handle countdown expiration
  const handleExpired = useCallback(() => {
    setExpired(true);
    if (onExpired) {
      onExpired();
    }
  }, [onExpired]);

  // Start countdown timer
  useEffect(() => {
    if (expired) return;

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

  // Auto-dismiss expired message after 3 seconds
  useEffect(() => {
    if (!expired) return;
    const timeout = setTimeout(() => {
      if (onDecline) onDecline();
    }, 3000);
    return () => clearTimeout(timeout);
  }, [expired, onDecline]);

  const countdownPercent = (countdown / totalSeconds) * 100;
  const isUrgent = countdown <= 10;

  // Expired state
  if (expired) {
    return (
      <div style={rideCardStyle} role="alert" aria-live="assertive">
        <div style={expiredContainerStyle}>
          <span style={expiredIconStyle}>⏱️</span>
          <span style={expiredTextStyle}>Request expired</span>
        </div>
      </div>
    );
  }

  return (
    <div style={rideCardStyle} role="region" aria-label="Ride request">
      {/* Countdown progress bar */}
      <div
        style={countdownBarContainerStyle}
        role="progressbar"
        aria-valuenow={countdown}
        aria-valuemin={0}
        aria-valuemax={totalSeconds}
        aria-label={`${countdown} seconds remaining`}
      >
        <div
          style={{
            ...countdownBarStyle,
            width: `${countdownPercent}%`,
            backgroundColor: isUrgent ? COLORS.errorRed : COLORS.primaryGreen,
          }}
        />
      </div>

      {/* Header: label + countdown timer */}
      <div style={rideCardHeaderStyle}>
        <span style={rideCardLabelStyle}>New Ride Request</span>
        <div
          style={{
            ...countdownTimerStyle,
            borderColor: isUrgent ? COLORS.errorRed : COLORS.primaryGreen,
          }}
        >
          <span style={countdownNumberStyle}>{countdown}s</span>
        </div>
      </div>

      {/* Fare and distance row */}
      <div style={rideCardFareRowStyle}>
        <strong style={rideCardFareStyle}>{formatMoney(ride?.fare)}</strong>
        <div style={fareMetaStyle}>
          {ride?.distance_km && (
            <span style={rideCardDistanceStyle}>{ride.distance_km} km</span>
          )}
          {hasMultipleStops && (
            <span style={multiStopBadgeStyle} aria-label={`${stopCount} stops`}>
              📍 {stopCount} {stopCount === 1 ? "stop" : "stops"}
            </span>
          )}
        </div>
      </div>

      {/* Route details */}
      <div style={rideCardBodyStyle}>
        <p style={rideCardRouteStyle}>
          <span style={routeIconStyle}>📍</span>
          <span>{ride?.pickup || ride?.pickup_address || "Pickup"}</span>
        </p>
        <p style={rideCardRouteStyle}>
          <span style={routeIconStyle}>🏁</span>
          <span>{ride?.destination || ride?.destination_address || "Destination"}</span>
        </p>
      </div>

      {/* Action buttons */}
      <div style={rideCardActionsStyle}>
        <button
          style={declineButtonStyle}
          onClick={onDecline}
          aria-label="Decline ride request"
        >
          Decline
        </button>
        <button
          style={acceptButtonStyle}
          onClick={onAccept}
          aria-label="Accept ride request"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determines the number of intermediate stops for a ride.
 * Supports both `ride.stops` (array) and `ride.stop_count` (number).
 */
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

// ─── Styles ─────────────────────────────────────────────────────────────────

const rideCardStyle = {
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "20px",
  padding: "0 18px 18px",
  border: `1px solid ${COLORS.goldAccent}`,
  backdropFilter: "blur(12px)",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
  overflow: "hidden",
};

const countdownBarContainerStyle = {
  width: "100%",
  height: "4px",
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  borderRadius: "2px",
  marginBottom: "14px",
  overflow: "hidden",
};

const countdownBarStyle = {
  height: "100%",
  borderRadius: "2px",
  transition: "width 1s linear, background-color 0.3s ease",
};

const rideCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const rideCardLabelStyle = {
  color: COLORS.goldAccent,
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
};

const countdownTimerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  border: `2px solid ${COLORS.primaryGreen}`,
  transition: "border-color 0.3s ease",
};

const countdownNumberStyle = {
  color: COLORS.white,
  fontSize: "12px",
  fontWeight: 900,
};

const rideCardFareRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
};

const rideCardFareStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
};

const fareMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const rideCardDistanceStyle = {
  color: "rgba(255, 255, 255, 0.6)",
  fontSize: "12px",
  fontWeight: 700,
};

const multiStopBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  padding: "3px 8px",
  borderRadius: "999px",
  backgroundColor: "rgba(212, 175, 55, 0.2)",
  border: `1px solid ${COLORS.goldAccent}`,
  color: COLORS.goldAccent,
  fontSize: "11px",
  fontWeight: 800,
};

const rideCardBodyStyle = {
  marginBottom: "14px",
};

const rideCardRouteStyle = {
  margin: "4px 0",
  color: "rgba(255, 255, 255, 0.85)",
  fontSize: "13px",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const routeIconStyle = {
  fontSize: "14px",
  flexShrink: 0,
};

const rideCardActionsStyle = {
  display: "flex",
  gap: "10px",
};

const declineButtonStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  backgroundColor: "transparent",
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
};

const acceptButtonStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  transition: "transform 0.2s ease, opacity 0.2s ease",
};

const expiredContainerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "18px 0",
};

const expiredIconStyle = {
  fontSize: "20px",
};

const expiredTextStyle = {
  color: COLORS.errorRed,
  fontSize: "15px",
  fontWeight: 800,
};
