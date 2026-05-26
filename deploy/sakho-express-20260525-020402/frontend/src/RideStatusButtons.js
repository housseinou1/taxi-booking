import React from "react";
import { API_URL } from "./apiConfig";

function RideStatusButtons({ ride, onStatusChange }) {
  const updateRideStatus = async (endpoint) => {
    const response = await fetch(`${API_URL}/rides/${endpoint}/${ride.id}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("access")}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.detail || data.error || "Action failed");
      return;
    }

    if (onStatusChange) onStatusChange(data);
  };

  return (
    <div style={actionRowStyle}>
      {ride.status === "requested" && (
        <button onClick={() => updateRideStatus("accept")} style={primaryButtonStyle}>
          Accept trip
        </button>
      )}

      {ride.status === "driver_arriving" && (
        <button onClick={() => updateRideStatus("start")} style={warningButtonStyle}>
          Start trip
        </button>
      )}

      {ride.status === "in_progress" && (
        <button onClick={() => updateRideStatus("complete")} style={successButtonStyle}>
          Complete trip
        </button>
      )}

      {ride.status === "completed" && <span style={stateTextStyle}>Completed</span>}
      {ride.status === "cancelled" && <span style={stateTextStyle}>Cancelled</span>}
    </div>
  );
}

const actionRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "10px",
};

const baseButtonStyle = {
  width: "100%",
  minHeight: "48px",
  border: "none",
  borderRadius: "14px",
  color: "white",
  fontWeight: 900,
  fontSize: "0.98rem",
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(0, 0, 0, 0.18)",
};

const primaryButtonStyle = {
  ...baseButtonStyle,
  background: "#12b76a",
};

const warningButtonStyle = {
  ...baseButtonStyle,
  background: "#f97316",
};

const successButtonStyle = {
  ...baseButtonStyle,
  background: "#2563eb",
};

const stateTextStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  borderRadius: "12px",
  background: "rgba(255, 255, 255, 0.08)",
  color: "#d1d5db",
  fontWeight: 900,
};

export default RideStatusButtons;
