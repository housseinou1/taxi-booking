import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "./apiConfig";

function RideStatusButtons({ ride, onStatusChange, distanceToNextKm }) {
  const [workingAction, setWorkingAction] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [navigationStarted, setNavigationStarted] = useState(() =>
    localStorage.getItem(`ride_${ride.id}_navigation_started`) === "true"
  );
  const sortedStops = Array.isArray(ride.stops)
    ? [...ride.stops].sort((a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0))
    : [];
  const activeStop = sortedStops.find((stop) => stop.arrived_at && !stop.departed_at);
  const nextStop = sortedStops.find((stop) => !stop.arrived_at);
  const hasUnfinishedStops = Boolean(activeStop || nextStop);
  const pickupNavigationUrls = getNavigationUrls(ride, "pickup");
  const stopNavigationUrls = nextStop ? getStopNavigationUrls(nextStop) : null;
  const finalNavigationUrls = getNavigationUrls(ride, "destination");
  const isApproachingPickup = ["accepted", "driver_arriving"].includes(ride.status);
  const hasReliablePickupDistance =
    isApproachingPickup && Number.isFinite(Number(distanceToNextKm));
  const isNearPickup =
    !hasReliablePickupDistance || Number(distanceToNextKm) <= 0.35;

  const markNavigationStarted = useCallback(() => {
    localStorage.setItem(`ride_${ride.id}_navigation_started`, "true");
    setNavigationStarted(true);
  }, [ride.id]);

  useEffect(() => {
    if (["accepted", "driver_arriving"].includes(ride.status) && !navigationStarted) {
      markNavigationStarted();
    }
  }, [markNavigationStarted, navigationStarted, ride.status]);

  const updateRideStatus = async (endpoint) => {
    try {
      setWorkingAction(endpoint);

      const response = await fetch(`${API_URL}/rides/${endpoint}/${ride.id}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
        body: JSON.stringify(endpoint === "start" ? { pickup_pin: pickupPin } : {}),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || data.error || "Action failed");
        return;
      }

      if (endpoint === "start") setPickupPin("");
      if (onStatusChange) onStatusChange(data);
    } catch (error) {
      console.error(error);
      alert("Server error updating ride");
    } finally {
      setWorkingAction("");
    }
  };

  const markStop = async (stop, endpoint) => {
    if (!stop) return;

    try {
      setWorkingAction(`${endpoint}-${stop.id}`);

      const response = await fetch(`${API_URL}/rides/${ride.id}/stops/${stop.id}/${endpoint}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || data.error || "Stop action failed");
        return;
      }

      if (onStatusChange) onStatusChange(data);
    } catch (error) {
      console.error(error);
      alert("Server error updating stop");
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
            label={
              isNearPickup
                ? "Slide Right to Arrive"
                : `Pickup is ${Number(distanceToNextKm).toFixed(1)} km away`
            }
            completeLabel="Marking arrived..."
            color="#0F8F4D"
            disabled={Boolean(workingAction) || !isNearPickup}
            isWorking={workingAction === "arrived"}
            onComplete={() => updateRideStatus("arrived")}
            onDisabledAttempt={() =>
              alert("Move closer to the rider pickup before marking arrived.")
            }
          />
        </>
      )}

      {ride.status === "driver_arrived" && (
        <>
          <div style={pickupPinCardStyle}>
            <label htmlFor={`pickup-pin-${ride.id}`} style={pickupPinLabelStyle}>
              Rider pickup PIN
            </label>
            <input
              id={`pickup-pin-${ride.id}`}
              value={pickupPin}
              onChange={(event) =>
                setPickupPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              placeholder="4-digit PIN"
              style={pickupPinInputStyle}
            />
            <span style={pickupPinHelpStyle}>
              Ask the rider for the PIN after confirming their identity.
            </span>
          </div>
          <SlideRideAction
            label="Slide Right to Start Ride"
            completeLabel="Verifying PIN..."
            color="#2563EB"
            disabled={Boolean(workingAction) || pickupPin.length !== 4}
            isWorking={workingAction === "start"}
            onComplete={() => updateRideStatus("start")}
            onDisabledAttempt={() => alert("Enter the rider's 4-digit pickup PIN first.")}
          />
        </>
      )}

      {ride.status === "in_progress" && sortedStops.length > 0 && (
        <StopProgressCard stops={sortedStops} />
      )}

      {ride.status === "in_progress" && nextStop && (
        <>
          <NavigationChoice
            urls={stopNavigationUrls}
            selected={localStorage.getItem(`ride_${ride.id}_stop_${nextStop.id}_navigation_started`) === "true"}
            onChoose={() => localStorage.setItem(`ride_${ride.id}_stop_${nextStop.id}_navigation_started`, "true")}
            title={`Navigate to stop ${nextStop.stop_order}`}
          />
          <SlideRideAction
            label={`Slide: arrived at stop ${nextStop.stop_order}`}
            completeLabel="Marking stop arrived..."
            color="#d4af37"
            disabled={Boolean(workingAction)}
            isWorking={workingAction === `arrived-${nextStop.id}`}
            onComplete={() => markStop(nextStop, "arrived")}
          />
        </>
      )}

      {ride.status === "in_progress" && activeStop && (
        <SlideRideAction
          label={`Slide: depart stop ${activeStop.stop_order}`}
          completeLabel="Marking stop departed..."
          color="#0F8F4D"
          disabled={Boolean(workingAction)}
          isWorking={workingAction === `departed-${activeStop.id}`}
          onComplete={() => markStop(activeStop, "departed")}
        />
      )}

      {ride.status === "in_progress" && !hasUnfinishedStops && (
        <>
          {sortedStops.length > 0 && (
            <NavigationChoice
              urls={finalNavigationUrls}
              selected
              onChoose={() => {}}
              title="All stops complete. Navigate to drop-off"
            />
          )}
          <SlideRideAction
            label="Slide Right to Finish Ride"
            completeLabel="Finishing ride..."
            color="#D4AF37"
            disabled={Boolean(workingAction)}
            isWorking={workingAction === "complete"}
            onComplete={() => updateRideStatus("complete")}
          />
        </>
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

const getStopNavigationUrls = (stop) => {
  if (!stop || stop.latitude === null || stop.latitude === undefined || stop.longitude === null || stop.longitude === undefined) {
    return null;
  }

  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const destination = `${lat},${lng}`;

  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`,
    waze: `https://www.waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17`,
  };
};

function NavigationChoice({ urls, selected, onChoose, title }) {
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
        {title || (selected ? "Navigation selected" : "Choose map before starting")}
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

function StopProgressCard({ stops }) {
  return (
    <div style={stopProgressStyle}>
      <strong style={stopProgressTitleStyle}>Ride stops</strong>
      {stops.map((stop) => {
        const status = stop.departed_at ? "Departed" : stop.arrived_at ? "Arrived" : "Pending";
        return (
          <div key={stop.id} style={stopProgressRowStyle}>
            <span style={stopProgressNumberStyle}>{stop.stop_order}</span>
            <div>
              <strong>{stop.location_name}</strong>
              <small>{status}</small>
            </div>
          </div>
        );
      })}
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

    if (progress >= 0.95 && !disabled) {
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

const pickupPinCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "14px",
  borderRadius: "14px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
};

const pickupPinLabelStyle = {
  color: "#9a3412",
  fontWeight: 950,
  fontSize: "0.82rem",
  textTransform: "uppercase",
};

const pickupPinInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: "52px",
  borderRadius: "12px",
  border: "2px solid #fb923c",
  background: "#fff",
  color: "#111827",
  textAlign: "center",
  fontSize: "1.5rem",
  fontWeight: 950,
  letterSpacing: 0,
};

const pickupPinHelpStyle = {
  color: "#7c2d12",
  fontSize: "0.8rem",
  fontWeight: 750,
  lineHeight: 1.4,
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

const stopProgressStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(15, 143, 77, 0.08)",
  border: "1px solid rgba(15, 143, 77, 0.18)",
};

const stopProgressTitleStyle = {
  color: "#111827",
  fontSize: "0.86rem",
};

const stopProgressRowStyle = {
  display: "grid",
  gridTemplateColumns: "32px 1fr",
  gap: "10px",
  alignItems: "center",
};

const stopProgressNumberStyle = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#0F8F4D",
  color: "white",
  fontWeight: 950,
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
