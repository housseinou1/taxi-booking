import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import { API_URL } from "./apiConfig";
import authenticatedApi from "./auth/authenticatedApi";
import WaitingFeeBanner from "./components/WaitingFeeBanner";
import { isNative } from "./native/platform";
import { ARRIVE_MAX_DISTANCE_M } from "./utils/rideGeo";

function RideStatusButtons({
  ride,
  onStatusChange,
  distanceToNextKm,
  driverPosition = null,
  arriveGate = null,
  gpsUnavailable = false,
}) {
  const [workingAction, setWorkingAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const pinVerified = Boolean(ride.pickup_pin_verified);
  const startRideButtonRef = useRef(null);
  const actionInFlightRef = useRef(false);
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
  const hasReliablePickupDistance = Boolean(arriveGate?.reliable);
  const hasDriverCoords = Boolean(arriveGate?.driver || driverPosition || arriveGate?.arriveBody);
  const isNearPickup = Boolean(arriveGate?.near);
  const pickupDistanceKm = arriveGate?.distanceKm ?? distanceToNextKm;
  // >50 km from pickup means GPS is wrong/out-of-market (not a real approach).
  const ABSURD_DISTANCE_KM = 50;
  const distanceAbsurd =
    Number.isFinite(Number(pickupDistanceKm)) && Number(pickupDistanceKm) > ABSURD_DISTANCE_KM;
  const gpsOutsideService = Boolean(arriveGate?.outsideServiceArea);

  // Allow Mark Arrived when near pickup OR when GPS is missing/wrong so the trip can continue.
  const canMarkArrivedByGps = isNearPickup;
  const canMarkArrivedManually =
    Boolean(ride.pickup_lat && ride.pickup_lng) &&
    (!hasDriverCoords || !hasReliablePickupDistance || distanceAbsurd || gpsOutsideService);
  const canMarkArrived = canMarkArrivedByGps || canMarkArrivedManually;

  const arriveBodyOverride =
    canMarkArrivedManually && !canMarkArrivedByGps
      ? {
          lat: Number(ride.pickup_lat),
          lng: Number(ride.pickup_lng),
          gps_fallback: true,
        }
      : null;

  const arriveSlideLabel = canMarkArrivedManually && !canMarkArrivedByGps
    ? "Mark Arrived"
    : "Slide Right to Arrive";
  const arriveStatusHint =
    canMarkArrivedManually && !canMarkArrivedByGps
      ? distanceAbsurd || gpsOutsideService
        ? "GPS looks wrong — tap Mark Arrived only if you are at the pickup"
        : "GPS unavailable — tap Mark Arrived only if you are at the pickup"
      : !hasDriverCoords
      ? gpsUnavailable
        ? "Waiting for your location — enable GPS"
        : "Waiting for your location"
      : !isNearPickup && hasReliablePickupDistance
      ? `${Number(pickupDistanceKm).toFixed(1)} km away — move within ${Math.round(ARRIVE_MAX_DISTANCE_M)}m`
      : null;

  useEffect(() => {
    if (!["accepted", "driver_arriving"].includes(ride.status)) return;
    console.warn("[driver-trip] slide-gate", {
      rideId: ride.id,
      status: ride.status,
      hasDriverCoords,
      distanceM: arriveGate?.distanceM ?? null,
      near: isNearPickup,
      slideEnabled: canMarkArrived,
      hint: arriveStatusHint,
    });
  }, [
    arriveGate?.distanceM,
    arriveStatusHint,
    canMarkArrived,
    hasDriverCoords,
    isNearPickup,
    ride.id,
    ride.status,
  ]);
  const markNavigationStarted = useCallback(() => {
    localStorage.setItem(`ride_${ride.id}_navigation_started`, "true");
    setNavigationStarted(true);
  }, [ride.id]);

  useEffect(() => {
    if (["accepted", "driver_arriving"].includes(ride.status) && !navigationStarted) {
      markNavigationStarted();
    }
  }, [markNavigationStarted, navigationStarted, ride.status]);

  useEffect(() => {
    setPickupPin("");
    setActionError("");
  }, [ride.id]);

  useEffect(() => {
    // Drop stale errors from a previous step (e.g. Start Ride 400 still showing on Complete).
    setActionError("");
  }, [ride.status, pinVerified]);

  useEffect(() => {
    if (!pinVerified || !startRideButtonRef.current) return;
    // Instant scroll — smooth scroll + keyboard dismiss was eating the first tap.
    startRideButtonRef.current.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [pinVerified]);

  const postRideAction = async (endpoint, body = {}) => {
    const rideId = ride.id || ride.ride_id;
    const response = await authenticatedApi.post(
      `${API_URL}/rides/${endpoint}/${rideId}/`,
      body,
      { timeout: 45000 }
    );
    return response.data;
  };

  const extractApiError = (error, fallback) =>
    error.response?.data?.detail ||
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message ||
    fallback;

  const recoverRideAfterAction = async (rideId, endpoint) => {
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/${rideId}/`);
      const status = response.data?.status;
      if (!status || !onStatusChange) return false;

      if (endpoint === "start" && (status === "in_progress" || status === "completed")) {
        onStatusChange(response.data);
        setActionError("");
        return true;
      }
      if (endpoint === "complete" && status === "completed") {
        onStatusChange(response.data);
        setActionError("");
        return true;
      }
      if (endpoint === "arrived" && ["driver_arrived", "in_progress", "completed"].includes(status)) {
        onStatusChange(response.data);
        setActionError("");
        return true;
      }
    } catch (recoveryError) {
      console.error(recoveryError);
    }
    // If UI already advanced past this step, drop the contradictory error.
    if (endpoint === "start" && ["in_progress", "completed"].includes(ride.status)) {
      setActionError("");
      return true;
    }
    if (endpoint === "complete" && ride.status === "completed") {
      setActionError("");
      return true;
    }
    return false;
  };

  const updateRideStatus = async (endpoint) => {
    if (actionInFlightRef.current) return;
    setActionError("");
    try {
      actionInFlightRef.current = true;
      setWorkingAction(endpoint);
      let body = {};
      if (endpoint === "arrived") {
        if (arriveBodyOverride) {
          body = arriveBodyOverride;
        } else if (arriveGate?.arriveBody) {
          body = arriveGate.arriveBody;
        } else {
          setActionError(
            hasDriverCoords
              ? `Move within ${Math.round(ARRIVE_MAX_DISTANCE_M)}m of pickup before marking arrived.`
              : "Waiting for your location. Please enable GPS and try again."
          );
          actionInFlightRef.current = false;
          setWorkingAction("");
          return;
        }
      }
      const data = await postRideAction(endpoint, body);
      // Clear in-flight BEFORE status change so the next action button
      // (e.g. Start Ride after PIN/arrive) is not born disabled.
      actionInFlightRef.current = false;
      setWorkingAction("");
      if (endpoint === "start") {
        setPickupPin("");
      }
      if (onStatusChange) onStatusChange(data);
    } catch (error) {
      console.error(error);
      const rideId = ride.id || ride.ride_id;
      const statusCode = error.response?.status;
      const shouldRecover =
        rideId &&
        ["arrived", "start", "complete"].includes(endpoint) &&
        (statusCode === 400 || statusCode === 503 || statusCode === 504 || !statusCode);
      if (shouldRecover) {
        const recovered = await recoverRideAfterAction(rideId, endpoint);
        if (recovered) return;
      }
      setActionError(extractApiError(error, "Server error. Please try again."));
    } finally {
      actionInFlightRef.current = false;
      setWorkingAction("");
    }
  };

  const verifyPickupPin = async () => {
    if (pickupPin.length !== 4 || actionInFlightRef.current) return;
    setActionError("");
    try {
      actionInFlightRef.current = true;
      setWorkingAction("verify-pin");
      // Dismiss soft keyboard so the first Start Ride tap is not eaten.
      if (typeof document !== "undefined" && document.activeElement?.blur) {
        document.activeElement.blur();
      }
      const data = await postRideAction("verify-pin", { pickup_pin: pickupPin });
      actionInFlightRef.current = false;
      setWorkingAction("");
      if (onStatusChange) {
        onStatusChange({
          ...data,
          pickup_pin_verified: data.pickup_pin_verified ?? true,
          status: data.status || ride.status,
        });
      }
    } catch (error) {
      console.error(error);
      setActionError(extractApiError(error, "Could not verify pickup PIN. Check the code and try again."));
    } finally {
      actionInFlightRef.current = false;
      setWorkingAction("");
    }
  };

  const markStop = async (stop, endpoint) => {
    if (!stop) return;
    setActionError("");
    try {
      setWorkingAction(`${endpoint}-${stop.id}`);

      const response = await authenticatedApi.post(
        `${API_URL}/rides/${ride.id}/stops/${stop.id}/${endpoint}/`,
        {}
      );

      const data = response.data;

      if (onStatusChange) onStatusChange(data);
    } catch (error) {
      console.error(error);
      setActionError(
        error.response?.data?.detail || error.response?.data?.error || "Server error updating stop."
      );
    } finally {
      setWorkingAction("");
    }
  };

  return (
    <div style={actionRowStyle}>
      {actionError ? (
        <div style={actionErrorStyle} role="alert">
          {actionError}
        </div>
      ) : null}
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
            label={arriveSlideLabel}
            statusHint={arriveStatusHint}
            completeLabel="Marking arrived..."
            color="#0F8F4D"
            disabled={Boolean(workingAction) || !canMarkArrived}
            isWorking={workingAction === "arrived"}
            onComplete={() => updateRideStatus("arrived")}
            onDisabledAttempt={() => {
              if (hasReliablePickupDistance && !isNearPickup) {
                setActionError(
                  `Move closer to the pickup point before tapping Arrived (${Math.round(
                    Number(arriveGate?.distanceM ?? pickupDistanceKm * 1000)
                  )}m away, max ${Math.round(ARRIVE_MAX_DISTANCE_M)}m).`
                );
              } else if (!canMarkArrived) {
                setActionError("GPS unavailable. Please enable location services and try again.");
              }
            }}
          />
        </>
      )}

      {ride.status === "driver_arrived" && (
        <>
          <WaitingFeeBanner ride={ride} audience="driver" />
          {!pinVerified ? (
            <div style={pickupPinCardStyle}>
              <label htmlFor={`pickup-pin-${ride.id}`} style={pickupPinLabelStyle}>
                Rider pickup PIN
              </label>
              <input
                id={`pickup-pin-${ride.id}`}
                value={pickupPin}
                onChange={(event) => {
                  setActionError("");
                  setPickupPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                placeholder="4-digit PIN"
                style={pickupPinInputStyle}
              />
              <span style={pickupPinHelpStyle}>
                Ask the rider for the PIN after confirming their identity.
              </span>
              <button
                type="button"
                onClick={verifyPickupPin}
                disabled={Boolean(workingAction) || pickupPin.length !== 4}
                style={{
                  ...primaryButtonStyle,
                  background: "#F97316",
                  opacity: workingAction || pickupPin.length !== 4 ? 0.72 : 1,
                  cursor: workingAction || pickupPin.length !== 4 ? "wait" : "pointer",
                }}
                aria-label="Verify PIN"
              >
                {workingAction === "verify-pin" ? "Verifying PIN..." : "Verify PIN"}
              </button>
            </div>
          ) : (
            <>
              <div style={pinVerifiedStyle}>PIN verified — you can still cancel if needed.</div>
              <button
                ref={startRideButtonRef}
                type="button"
                onClick={() => updateRideStatus("start")}
                disabled={Boolean(workingAction)}
                style={{
                  ...primaryButtonStyle,
                  background: "#2563EB",
                  opacity: workingAction ? 0.72 : 1,
                  cursor: workingAction ? "wait" : "pointer",
                  touchAction: "manipulation",
                }}
                aria-label="Start Ride"
              >
                {workingAction === "start" ? "Starting ride..." : "Start Ride"}
              </button>
            </>
          )}
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

function nativeActionLabel(label) {
  if (/arrive/i.test(label) && !/stop/i.test(label)) return "Mark Arrived";
  if (/finish/i.test(label)) return "Complete Ride";
  return label.replace(/^Slide:\s*/i, "").replace(/^Slide Right to\s*/i, "").trim() || label;
}

function SlideRideAction({
  label,
  statusHint = "",
  completeLabel,
  color,
  disabled = false,
  isWorking = false,
  onComplete,
  onDisabledAttempt,
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const progressRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const setProgressFromClientX = useCallback((clientX) => {
    const track = trackRef.current;
    if (!track || clientX == null) return;

    const rect = track.getBoundingClientRect();
    const knobSize = 52;
    const max = Math.max(1, rect.width - knobSize - 8);
    const nextProgress = Math.min(1, Math.max(0, (clientX - rect.left - knobSize / 2) / max));
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  const finishDrag = useCallback(() => {
    if (!draggingRef.current) return;

    draggingRef.current = false;
    setDragging(false);

    const completed = progressRef.current >= 0.88 && !disabled;
    if (completed) {
      progressRef.current = 1;
      setProgress(1);
      onComplete();
      return;
    }

    progressRef.current = 0;
    setProgress(0);
  }, [disabled, onComplete]);

  const startDrag = useCallback(
    (clientX) => {
      if (disabled || isWorking) {
        onDisabledAttempt?.();
        return;
      }
      draggingRef.current = true;
      setDragging(true);
      setProgressFromClientX(clientX);
    },
    [disabled, isWorking, onDisabledAttempt, setProgressFromClientX]
  );

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (event) => {
      if (!draggingRef.current || disabled) return;
      const point = event.touches?.[0] || event;
      setProgressFromClientX(point.clientX);
    };

    const onEnd = () => finishDrag();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [dragging, disabled, finishDrag, setProgressFromClientX]);

  const handlePointerDown = (event) => {
    if (disabled || isWorking) {
      event.preventDefault();
      onDisabledAttempt?.();
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on some WebViews.
    }
    startDrag(event.clientX);
  };

  const handleTouchStart = (event) => {
    if (disabled || isWorking) {
      event.preventDefault();
      onDisabledAttempt?.();
      return;
    }

    event.preventDefault();
    startDrag(event.touches[0]?.clientX);
  };

  const knobLeft = `calc(4px + ${progress * 100}% - ${progress * 58}px)`;
  const nativeTapLabel = nativeActionLabel(label);

  if (isNative()) {
    return (
      <div style={nativeActionWrapStyle}>
        <button
          type="button"
          onClick={() => {
            if (disabled || isWorking) return;
            onComplete();
          }}
          disabled={disabled || isWorking}
          style={{
            ...nativeActionButtonStyle,
            background: isWorking ? "#d1d5db" : color,
            opacity: disabled || isWorking ? 0.72 : 1,
          }}
          aria-label={nativeTapLabel}
        >
          {isWorking ? completeLabel : nativeTapLabel}
        </button>
        {statusHint && !isWorking ? (
          <span style={nativeActionHintStyle}>{statusHint}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      style={{
        ...slideTrackStyle,
        background: isWorking ? "#d1d5db" : "#f3f4f6",
        cursor: disabled ? "not-allowed" : "grab",
        opacity: disabled ? 0.72 : 1,
      }}
      role="button"
      aria-label={label}
      aria-disabled={disabled || isWorking}
      tabIndex={disabled || isWorking ? -1 : 0}
    >
      <div
        style={{
          ...slideFillStyle,
          width: `${Math.max(10, progress * 100)}%`,
          background: color,
          transition: dragging ? "none" : slideFillStyle.transition,
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

const pinVerifiedStyle = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(37, 99, 235, 0.12)",
  border: "1px solid rgba(37, 99, 235, 0.28)",
  color: "#1d4ed8",
  fontSize: "0.9rem",
  fontWeight: 800,
  textAlign: "center",
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

const nativeActionWrapStyle = {
  display: "grid",
  gap: "6px",
};

const nativeActionButtonStyle = {
  width: "100%",
  minHeight: "56px",
  border: "none",
  borderRadius: "14px",
  color: "#fff",
  fontWeight: 900,
  fontSize: "1rem",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.2)",
};

const nativeActionHintStyle = {
  color: "#9ca3af",
  fontSize: "0.82rem",
  fontWeight: 700,
  textAlign: "center",
  lineHeight: 1.35,
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

const actionErrorStyle = {
  padding: "10px 14px",
  borderRadius: "12px",
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  color: "#ef4444",
  fontSize: "0.85rem",
  fontWeight: 700,
  textAlign: "center",
};

export default memo(RideStatusButtons, (prev, next) => {
  if (prev.gpsUnavailable !== next.gpsUnavailable) return false;
  if (prev.arriveGate?.near !== next.arriveGate?.near) return false;
  if (prev.arriveGate?.reliable !== next.arriveGate?.reliable) return false;
  if (prev.arriveGate?.distanceM !== next.arriveGate?.distanceM) return false;
  if (prev.ride?.id !== next.ride?.id) return false;
  if (prev.ride?.status !== next.ride?.status) return false;
  if (prev.ride?.pickup_pin_verified !== next.ride?.pickup_pin_verified) return false;
  if (JSON.stringify(prev.ride?.stops) !== JSON.stringify(next.ride?.stops)) return false;
  return true;
});
