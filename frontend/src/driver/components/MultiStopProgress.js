import React, { useMemo } from "react";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  gray: "#6B7280",
  lightGray: "#9CA3AF",
};

// ─── Stop Status Helpers ────────────────────────────────────────────────────

/**
 * Determines the status of a stop based on arrived_at and departed_at fields.
 * @param {object} stop - A stop object with arrived_at and departed_at fields
 * @returns {"pending" | "arrived" | "departed"}
 */
export function getStopStatus(stop) {
  if (!stop) return "pending";
  if (stop.arrived_at && stop.departed_at) return "departed";
  if (stop.arrived_at) return "arrived";
  return "pending";
}

/**
 * Finds the next pending stop from an ordered list of stops.
 * @param {Array} stops - Array of stop objects sorted by stop_order
 * @returns {object|null} The next pending stop, or null if all stops are departed
 */
export function getNextPendingStop(stops) {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const sorted = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  return sorted.find((stop) => getStopStatus(stop) === "pending") || null;
}

/**
 * Determines the navigation destination based on stops and ride status.
 * - When intermediate stops remain (pending), navigate to the next pending stop.
 * - When all intermediate stops are departed, navigate to the final destination (null).
 * @param {Array} stops - Array of stop objects sorted by stop_order
 * @param {string} rideStatus - Current ride status
 * @returns {object|null} The stop to navigate to, or null for final destination
 */
export function getNavigationDestination(stops, rideStatus) {
  if (rideStatus !== "in_progress") return null;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  return getNextPendingStop(stops);
}

// ─── Status Color Map ───────────────────────────────────────────────────────
const STATUS_COLORS = {
  departed: COLORS.primaryGreen,
  arrived: COLORS.goldAccent,
  pending: COLORS.gray,
};

const STATUS_LABELS = {
  departed: "Departed",
  arrived: "Arrived",
  pending: "Pending",
};

// ─── MultiStopProgress Component ────────────────────────────────────────────

/**
 * Displays a vertical timeline of stops with status indicators and navigation prompts.
 *
 * Props:
 * - stops: Array of stop objects with { stop_order, location_name, latitude, longitude, arrived_at, departed_at }
 * - rideStatus: Current ride status string (e.g., "in_progress", "driver_arriving")
 * - onNavigateToStop: Callback function called with the stop object when navigation is triggered
 */
export default function MultiStopProgress({ stops = [], rideStatus, onNavigateToStop }) {
  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.stop_order - b.stop_order),
    [stops]
  );

  const nextPendingStop = useMemo(
    () => getNextPendingStop(sortedStops),
    [sortedStops]
  );

  const navigationDest = useMemo(
    () => getNavigationDestination(sortedStops, rideStatus),
    [sortedStops, rideStatus]
  );

  if (sortedStops.length === 0) {
    return null;
  }

  return (
    <div style={containerStyle} role="list" aria-label="Multi-stop ride progress">
      {/* Next Stop Navigation Prompt */}
      {rideStatus === "in_progress" && navigationDest && (
        <div style={navigationPromptStyle}>
          <span style={navigationLabelStyle}>Next Stop:</span>
          <span style={navigationNameStyle}>{navigationDest.location_name}</span>
          {onNavigateToStop && (
            <button
              style={navigateButtonStyle}
              onClick={() => onNavigateToStop(navigationDest)}
              aria-label={`Navigate to ${navigationDest.location_name}`}
            >
              Navigate →
            </button>
          )}
        </div>
      )}

      {/* All stops departed - heading to final destination */}
      {rideStatus === "in_progress" && !navigationDest && sortedStops.length > 0 && (
        <div style={navigationPromptStyle}>
          <span style={navigationLabelStyle}>Heading to:</span>
          <span style={navigationNameStyle}>Final Destination</span>
        </div>
      )}

      {/* Stop Timeline */}
      <div style={timelineStyle}>
        {sortedStops.map((stop, index) => {
          const status = getStopStatus(stop);
          const isLast = index === sortedStops.length - 1;
          const color = STATUS_COLORS[status];

          return (
            <div
              key={stop.stop_order || index}
              style={stopItemStyle}
              role="listitem"
              aria-label={`Stop ${stop.stop_order}: ${stop.location_name}, ${STATUS_LABELS[status]}`}
            >
              {/* Timeline connector line */}
              <div style={timelineColumnStyle}>
                <div
                  style={{
                    ...stopIndicatorStyle,
                    backgroundColor: color,
                    borderColor: color,
                  }}
                  aria-hidden="true"
                />
                {!isLast && (
                  <div
                    style={{
                      ...connectorLineStyle,
                      backgroundColor:
                        status === "departed" ? COLORS.primaryGreen : COLORS.gray,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Stop Details */}
              <div style={stopDetailsStyle}>
                <div style={stopHeaderStyle}>
                  <span style={stopNumberStyle}>Stop {stop.stop_order}</span>
                  <span
                    style={{
                      ...statusBadgeStyle,
                      backgroundColor: `${color}20`,
                      color: color,
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                <span style={stopNameStyle}>{stop.location_name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  padding: "12px 16px",
  backgroundColor: "rgba(11, 18, 32, 0.95)",
  borderRadius: "16px",
  border: `1px solid rgba(255, 255, 255, 0.1)`,
  backdropFilter: "blur(12px)",
};

const navigationPromptStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 12px",
  marginBottom: "12px",
  borderRadius: "10px",
  backgroundColor: "rgba(212, 175, 55, 0.12)",
  border: `1px solid ${COLORS.goldAccent}40`,
};

const navigationLabelStyle = {
  color: COLORS.goldAccent,
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  flexShrink: 0,
};

const navigationNameStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 700,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const navigateButtonStyle = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontSize: "11px",
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
  transition: "opacity 0.2s ease",
};

const timelineStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0px",
};

const stopItemStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  minHeight: "48px",
};

const timelineColumnStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "20px",
  flexShrink: 0,
};

const stopIndicatorStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  border: "2px solid",
  flexShrink: 0,
};

const connectorLineStyle = {
  width: "2px",
  flex: 1,
  minHeight: "24px",
  borderRadius: "1px",
  opacity: 0.5,
};

const stopDetailsStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  paddingBottom: "12px",
  flex: 1,
};

const stopHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const stopNumberStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
};

const statusBadgeStyle = {
  padding: "2px 8px",
  borderRadius: "999px",
  fontSize: "10px",
  fontWeight: 800,
  textTransform: "uppercase",
};

const stopNameStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 700,
};
