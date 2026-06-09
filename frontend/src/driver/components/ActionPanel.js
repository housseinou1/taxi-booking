import React, { useCallback, useState } from "react";
import axios from "axios";

import { API_URL } from "../../apiConfig";
import { useDriverContext } from "../context/DriverContext";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#9CA3AF",
  grayDark: "#374151",
  errorRed: "#EF4444",
};

// ─── Ride states that prevent going offline ─────────────────────────────────
const ACTIVE_RIDE_STATUSES = ["driver_arriving", "driver_arrived", "in_progress"];

// ─── Contextual action button mapping per ride state ────────────────────────
const RIDE_ACTION_MAP = {
  requested: { label: "Accept", endpoint: "accept", color: COLORS.primaryGreen },
  driver_arriving: { label: "Arrived", endpoint: "arrived", color: "#F59E0B" },
  driver_arrived: { label: "Start Ride", endpoint: "start", color: "#F97316" },
  in_progress: { label: "Complete Ride", endpoint: "complete", color: "#2563EB" },
};

/**
 * Returns the contextual action config for a given ride status.
 * Returns null if no action is available (completed, cancelled, or no ride).
 *
 * @param {string|null|undefined} rideStatus
 * @returns {{ label: string, endpoint: string, color: string } | null}
 */
export function getActionForRideStatus(rideStatus) {
  if (!rideStatus) return null;
  return RIDE_ACTION_MAP[rideStatus] || null;
}

/**
 * Determines whether the offline toggle should be disabled.
 * Returns true if there's an active ride in driver_arriving, driver_arrived, or in_progress.
 *
 * @param {Object|null} activeRide
 * @returns {boolean}
 */
export function isOfflineToggleDisabled(activeRide) {
  if (!activeRide || !activeRide.status) return false;
  return ACTIVE_RIDE_STATUSES.includes(activeRide.status);
}

/**
 * ActionPanel - Bottom panel with online/offline toggle and contextual ride action button.
 *
 * Requirements:
 * - 2.1: Go Online/Go Offline toggle occupying 50%+ width, green for online, gray for offline
 * - 2.2: Go Online sets availability to online
 * - 2.3: Go Offline sets availability to offline
 * - 2.5: Visual indicator using Primary Green for online, neutral gray for offline
 * - 2.6: Prevent offline when ride is active (driver_arriving/arrived/in_progress)
 * - 2.7: Revert toggle on API failure with error notification
 * - 3.7: Show only the contextually appropriate action button per ride state
 *
 * @param {Object} props
 * @param {Function} [props.onRideAction] - Callback after a ride action succeeds
 * @param {Function} [props.onError] - Callback when an error occurs (receives error message)
 */
export default function ActionPanel({ onRideAction, onError }) {
  const { state, setOnline, addNotification } = useDriverContext();
  const { isOnline, activeRide } = state;

  const [isToggling, setIsToggling] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [error, setError] = useState(null);
  const [pickupPin, setPickupPin] = useState("");

  const token = localStorage.getItem("access");
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // ─── Online/Offline Toggle Handler ──────────────────────────────────────
  const handleToggleAvailability = useCallback(async () => {
    // Prevent offline when ride is active
    if (isOnline && isOfflineToggleDisabled(activeRide)) {
      const msg = "Complete or cancel your active ride before going offline.";
      setError(msg);
      addNotification({ type: "error", message: msg, timestamp: Date.now() });
      if (onError) onError(msg);
      return;
    }

    const previousState = isOnline;
    const newState = !isOnline;

    // Optimistic update
    setOnline(newState);
    setIsToggling(true);
    setError(null);

    try {
      await axios.post(`${API_URL}/drivers/availability/toggle/`, {}, authHeaders);
    } catch (err) {
      // Revert on failure
      setOnline(previousState);
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to update availability. Please try again.";
      setError(errorMsg);
      addNotification({ type: "error", message: errorMsg, timestamp: Date.now() });
      if (onError) onError(errorMsg);
    } finally {
      setIsToggling(false);
    }
  }, [isOnline, activeRide, setOnline, addNotification, onError, authHeaders]);

  // ─── Contextual Ride Action Handler ─────────────────────────────────────
  const handleRideAction = useCallback(async () => {
    const action = getActionForRideStatus(activeRide?.status);
    if (!action || !activeRide) return;

    setIsActioning(true);
    setError(null);

    try {
      const response = await axios.post(
        `${API_URL}/rides/${action.endpoint}/${activeRide.id || activeRide.ride_id}/`,
        action.endpoint === "start" ? { pickup_pin: pickupPin } : {},
        authHeaders
      );

      if (action.endpoint === "start") setPickupPin("");
      if (onRideAction) onRideAction(response.data);
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        `Failed to ${action.label.toLowerCase()}. Please try again.`;
      setError(errorMsg);
      addNotification({ type: "error", message: errorMsg, timestamp: Date.now() });
      if (onError) onError(errorMsg);
    } finally {
      setIsActioning(false);
    }
  }, [activeRide, addNotification, onRideAction, onError, authHeaders, pickupPin]);

  // ─── Determine contextual action ───────────────────────────────────────
  const rideAction = getActionForRideStatus(activeRide?.status);
  const toggleDisabled = isToggling || (isOnline && isOfflineToggleDisabled(activeRide));

  return (
    <div style={panelContainerStyle}>
      {/* Error message */}
      {error && (
        <div style={errorBannerStyle} role="alert">
          {error}
        </div>
      )}

      {activeRide?.status === "driver_arrived" && (
        <div style={pickupPinCardStyle}>
          <label htmlFor="driver-pickup-pin" style={pickupPinLabelStyle}>
            Rider pickup PIN
          </label>
          <input
            id="driver-pickup-pin"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pickupPin}
            onChange={(event) => setPickupPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit PIN"
            style={pickupPinInputStyle}
          />
          <span style={pickupPinHelpStyle}>
            Ask the rider for the PIN after checking that they are at the pickup point.
          </span>
        </div>
      )}

      <div style={panelContentStyle}>
        {/* Go Online / Go Offline Toggle */}
        <button
          onClick={handleToggleAvailability}
          disabled={toggleDisabled}
          style={{
            ...toggleButtonStyle,
            backgroundColor: isOnline ? COLORS.primaryGreen : COLORS.gray,
            opacity: toggleDisabled ? 0.6 : 1,
            cursor: toggleDisabled ? "not-allowed" : "pointer",
          }}
          aria-label={isOnline ? "Go Offline" : "Go Online"}
          aria-pressed={isOnline}
        >
          <span style={toggleIconStyle}>{isOnline ? "●" : "○"}</span>
          <span style={toggleLabelStyle}>
            {isToggling
              ? "Updating..."
              : isOnline
              ? "Go Offline"
              : "Go Online"}
          </span>
        </button>

        {/* Contextual Ride Action Button */}
        {rideAction && (
          <button
            onClick={handleRideAction}
            disabled={isActioning || (rideAction.endpoint === "start" && pickupPin.length !== 4)}
            style={{
              ...actionButtonStyle,
              backgroundColor: rideAction.color,
              opacity: isActioning || (rideAction.endpoint === "start" && pickupPin.length !== 4) ? 0.7 : 1,
              cursor: isActioning || (rideAction.endpoint === "start" && pickupPin.length !== 4) ? "not-allowed" : "pointer",
            }}
            aria-label={rideAction.label}
          >
            {isActioning ? "Processing..." : rideAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const panelContainerStyle = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 300,
  padding: "12px 16px 24px",
  background: "linear-gradient(0deg, rgba(11, 18, 32, 0.95) 0%, rgba(11, 18, 32, 0.85) 80%, rgba(11, 18, 32, 0) 100%)",
  pointerEvents: "auto",
};

const panelContentStyle = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const pickupPinCardStyle = {
  display: "grid",
  gap: "7px",
  marginBottom: "10px",
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(249, 115, 22, 0.16)",
  border: "1px solid rgba(251, 146, 60, 0.55)",
};

const pickupPinLabelStyle = {
  color: "#fed7aa",
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
};

const pickupPinInputStyle = {
  width: "100%",
  minHeight: "48px",
  boxSizing: "border-box",
  borderRadius: "12px",
  border: "2px solid #fb923c",
  background: "#ffffff",
  color: "#111827",
  textAlign: "center",
  fontSize: "22px",
  fontWeight: 950,
  letterSpacing: 0,
};

const pickupPinHelpStyle = {
  color: "#ffedd5",
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: 1.4,
};

const toggleButtonStyle = {
  flex: "1 1 55%",
  minWidth: "55%",
  minHeight: "52px",
  border: "none",
  borderRadius: "14px",
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "15px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  transition: "background-color 0.3s ease, opacity 0.2s ease",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
};

const toggleIconStyle = {
  fontSize: "12px",
};

const toggleLabelStyle = {
  fontSize: "15px",
  fontWeight: 800,
};

const actionButtonStyle = {
  flex: "1 1 40%",
  minHeight: "52px",
  border: "none",
  borderRadius: "14px",
  color: COLORS.white,
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  transition: "background-color 0.3s ease, opacity 0.2s ease",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
};

const errorBannerStyle = {
  marginBottom: "8px",
  padding: "10px 14px",
  borderRadius: "10px",
  backgroundColor: "rgba(239, 68, 68, 0.15)",
  border: `1px solid ${COLORS.errorRed}`,
  color: COLORS.errorRed,
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
};
