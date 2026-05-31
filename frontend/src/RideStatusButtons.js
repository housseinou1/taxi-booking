import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "./apiConfig";

function RideStatusButtons({ ride, onStatusChange }) {
  const [workingAction, setWorkingAction] = useState("");
  const [navigationStarted, setNavigationStarted] = useState(() =>
    localStorage.getItem(`ride_${ride.id}_navigation_started`) === "true"
  );
  const pickupNavigationUrls = getNavigationUrls(ride, "pickup");

  const markNavigationStarted = useCallback(() => {
    localStorage.setItem(`ride_${ride.id}_navigation_started`, "true");
    setNavigationStarted(true);
  }, [ride.id]);

  useEffect(() => {
    if (
      !["accepted", "driver_arriving"].includes(ride.status) ||
      navigationStarted ||
      !pickupNavigationUrls
    ) {
      return;
    }

    markNavigationStarted();
    window.open(pickupNavigationUrls.google, "_blank", "noopener,noreferrer");
  }, [markNavigationStarted, navigationStarted, pickupNavigationUrls, ride.status]);

  const updateRideStatus = async (endpoint) => {
    if (endpoint === "start" && !navigationStarted) {
      alert("Choose Google Maps or Waze before starting the ride.");
      return;
    }

    try {
      setWorkingAction(endpoint);

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
    } catch (error) {
      console.error(error);
      alert("Server error updating ride");
    } finally {
      setWorkingAction("");
    }
  };

  return (
    <div style={actionRowStyle}>
      {ride.status === "requested" && (
        <button
          onClick={() => updateRideStatus("accept")}
          disabled={Boolean(workingAction)}
          style={{
            ...primaryButtonStyle,
            opacity: workingAction ? 0.72 : 1,
            cursor: workingAction ? "wait" : "pointer",
          }}
        >
          {workingAction === "accept" ? "Accepting..." : "Accept trip"}
        </button>
      )}

      {["accepted", "driver_arriving"].includes(ride.status) && (
        <>
          <NavigationChoice
            urls={pickupNavigationUrls}
            selected={navigationStarted}
            onChoose={markNavigationStarted}
          />
          <SlideRideAction
            label={navigationStarted ? "Slide: I've arrived" : "Opening map..."}
            completeLabel="Marking arrived..."
            color="#0F8F4D"
            disabled={Boolean(workingAction) || !navigationStarted}
            isWorking={workingAction === "arrived"}
            onComplete={() => updateRideStatus("arrived")}
            onDisabledAttempt={() => alert("Choose Google Maps or Waze before marking arrived.")}
          />
        </>
      )}

      {ride.status === "driver_arrived" && (
        <SlideRideAction
          label="Slide to start ride"
          completeLabel="Starting ride..."
          color="#f97316"
          disabled={Boolean(workingAction)}
          isWorking={workingAction === "start"}
          onComplete={() => updateRideStatus("start")}
        />
      )}

      {ride.status === "in_progress" && (
        <SlideRideAction
          label="Slide to finish ride"
          completeLabel="Finishing ride..."
          color="#2563eb"
          disabled={Boolean(workingAction)}
          isWorking={workingAction === "complete"}
          onComplete={() => updateRideStatus("complete")}
        />
      )}

      {ride.status === "completed" && <span style={stateTextStyle}>Completed</span>}
      {ride.status === "cancelled" && <span style={stateTextStyle}>Cancelled</span>}
    </div>
  );
}

const getRidePoint = (ride, target) => {
  const lat = target === "pickup" ? ride.pickup_lat : ride.destination_lat;
  const lng = target === "pickup" ? ride.pickup_lng : ride.destination_lng;

  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }

  return {
    lat: Number(lat),
    lng: Number(lng),
  };
};

const getNavigationUrls = (ride, target) => {
  const point = getRidePoint(ride, target);

  if (!point || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
    return null;
  }

  const destination = `${point.lat},${point.lng}`;

  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`,
    waze: `https://www.waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17`,
  };
};

function NavigationChoice({ urls, selected, onChoose }) {
  if (!urls) {
    return (
      <div style={navigationNoticeStyle}>
        Pickup GPS is missing. Admin must update the ride pickup location.
      </div>
    );
  }

  return (
    <div style={navigationChoiceStyle}>
      <span style={navigationTitleStyle}>
        {selected ? "Navigation selected" : "Choose map before starting"}
      </span>
      <div style={navigationButtonGridStyle}>
        <a
          href={urls.google}
          target="_blank"
          rel="noreferrer"
          onClick={onChoose}
          style={navigationButtonStyle}
        >
          Google Maps
        </a>
        <a
          href={urls.waze}
          target="_blank"
          rel="noreferrer"
          onClick={onChoose}
          style={{ ...navigationButtonStyle, ...wazeButtonStyle }}
        >
          Waze
        </a>
      </div>
    </div>
  );
}

function SlideRideAction({
  label,
  completeLabel,
  color,
  disabled = false,
  isWorking = false,
  onComplete,
  onDisabledAttempt,
}) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const setProgressFromPointer = (clientX) => {
    const track = trackRef.current;

    if (!track) return;

    const rect = track.getBoundingClientRect();
    const knobSize = 52;
    const max = Math.max(1, rect.width - knobSize - 8);
    const nextProgress = Math.min(1, Math.max(0, (clientX - rect.left - knobSize / 2) / max));

    setProgress(nextProgress);
  };

  const finishDrag = () => {
    if (!dragging) return;

    setDragging(false);

    if (progress >= 0.82 && !disabled) {
      setProgress(1);
      onComplete();
      return;
    }

    setProgress(0);
  };

  const handlePointerDown = (event) => {
    if (disabled) {
      onDisabledAttempt?.();
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setProgressFromPointer(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (!dragging || disabled) return;

    setProgressFromPointer(event.clientX);
  };

  const knobLeft = `calc(4px + ${progress * 100}% - ${progress * 58}px)`;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        ...slideTrackStyle,
        background: isWorking ? "#d1d5db" : "#f3f4f6",
        cursor: disabled ? "wait" : "grab",
      }}
      role="button"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
    >
      <div
        style={{
          ...slideFillStyle,
          width: `${Math.max(10, progress * 100)}%`,
          background: color,
        }}
      />
      <span style={slideLabelStyle}>{isWorking ? completeLabel : label}</span>
      <span
        style={{
          ...slideKnobStyle,
          left: knobLeft,
          background: color,
        }}
      >
        {isWorking ? "..." : ">"}
      </span>
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

const navigationChoiceStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(17, 24, 39, 0.06)",
  border: "1px solid rgba(17, 24, 39, 0.1)",
};

const navigationTitleStyle = {
  color: "#374151",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const navigationButtonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
};

const navigationButtonStyle = {
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  textDecoration: "none",
  textAlign: "center",
  padding: "0 10px",
};

const wazeButtonStyle = {
  background: "#0891b2",
};

const navigationNoticeStyle = {
  padding: "12px",
  borderRadius: "14px",
  background: "#fef3c7",
  color: "#92400e",
  fontWeight: 800,
};

const slideTrackStyle = {
  position: "relative",
  height: "58px",
  borderRadius: "999px",
  overflow: "hidden",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  userSelect: "none",
  touchAction: "none",
  boxShadow: "inset 0 0 0 1px rgba(17, 24, 39, 0.06)",
};

const slideFillStyle = {
  position: "absolute",
  inset: "0 auto 0 0",
  opacity: 0.18,
  transition: "width 120ms ease",
};

const slideLabelStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#111827",
  fontWeight: 950,
  fontSize: "0.98rem",
  pointerEvents: "none",
};

const slideKnobStyle = {
  position: "absolute",
  top: "4px",
  width: "50px",
  height: "50px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "white",
  fontWeight: 950,
  fontSize: "1.35rem",
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.22)",
  transition: "left 120ms ease",
  pointerEvents: "none",
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
