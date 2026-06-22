import React from "react";
import GoOnlineButton from "./GoOnlineButton";
import DriverLevelBadge from "./DriverLevelBadge";
import MultiStopProgress, { getNextPendingStop } from "./MultiStopProgress";
import "./DriverStatusPanel.css";

function openStopNavigation(stop) {
  const lat = Number(stop?.latitude);
  const lng = Number(stop?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    "_blank",
    "noopener,noreferrer"
  );
}

/**
 * DriverStatusPanel - Sliding bottom panel with status info, driver level, and Go Online button.
 *
 * Props:
 * - isOnline: boolean
 * - loading: boolean (toggle loading state)
 * - onToggle: function (go online/offline)
 * - activeRide: object|null (with pickup, destination, fare, ride_type, status, etc.)
 * - driverLevel: { level: string, points: number, nextLevelPoints: number }
 */
export default function DriverStatusPanel({
  isOnline,
  loading,
  onToggle,
  activeRide,
  driverLevel = { level: "bronze", points: 0, nextLevelPoints: 2000 },
  onCancelRide,
  rideActions,
}) {
  const hasActiveRide = activeRide && activeRide.status;
  const riderName =
    activeRide?.rider_name ||
    activeRide?.rider?.full_name ||
    [activeRide?.rider_first_name, activeRide?.rider_last_name].filter(Boolean).join(" ").trim() ||
    "Rider";
  const riderPicture =
    activeRide?.rider_picture ||
    activeRide?.rider_photo ||
    activeRide?.rider?.profile_picture ||
    activeRide?.rider?.photo_url ||
    "";
  const riderPhone =
    activeRide?.rider_phone ||
    activeRide?.rider?.phone_number ||
    activeRide?.rider?.phone ||
    "";
  const riderCoords =
    Number.isFinite(Number(activeRide?.rider_lat)) && Number.isFinite(Number(activeRide?.rider_lng))
      ? `${Number(activeRide.rider_lat).toFixed(5)}, ${Number(activeRide.rider_lng).toFixed(5)}`
      : "";
  const riderLocation =
    activeRide?.rider_location ||
    activeRide?.pickup_address ||
    activeRide?.pickup ||
    riderCoords ||
    "Location unavailable";
  const rideStops = Array.isArray(activeRide?.stops)
    ? activeRide.stops
    : Array.isArray(activeRide?.intermediate_stops)
      ? activeRide.intermediate_stops
      : [];
  const stopLabels = rideStops
    .map((stop, index) => stop?.location_name || stop?.label || stop?.address || `Stop ${index + 1}`)
    .filter(Boolean);
  const nextPendingStop =
    activeRide?.status === "in_progress" ? getNextPendingStop(rideStops) : null;
  const nextPendingStopLabel = nextPendingStop?.location_name || nextPendingStop?.label || "";

  return (
    <div className="driver-status-panel driver-status-panel--animate">
      {/* Handle bar */}
      <div className="driver-status-panel__handle" />

      {hasActiveRide ? (
        /* Active ride content */
        <div className="driver-status-panel__ride">
          <div className="driver-status-panel__rider">
            {riderPicture ? (
              <img
                className="driver-status-panel__rider-photo"
                src={riderPicture}
                alt={riderName}
              />
            ) : (
              <span className="driver-status-panel__rider-photo driver-status-panel__rider-photo--fallback">
                {(riderName || "R").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <span className="driver-status-panel__rider-label">Rider</span>
              <strong className="driver-status-panel__rider-name">
                {riderName}
              </strong>
            </div>
          </div>
          <div className="driver-status-panel__rider-meta">
            <span className="driver-status-panel__rider-phone">
              📞 {riderPhone || "Phone unavailable"}
            </span>
            <span className="driver-status-panel__rider-location">
              📍 {riderLocation}
            </span>
          </div>
          <div className="driver-status-panel__ride-route">
            <span>{activeRide.pickup || "Pickup"}</span>
            <span className="driver-status-panel__ride-route-arrow">→</span>
            <span>
              {stopLabels.length
                ? [...stopLabels, activeRide.destination || "Destination"].join(" → ")
                : activeRide.destination || "Destination"}
            </span>
          </div>
          {nextPendingStopLabel && (
            <div className="driver-status-panel__rider-location">
              🛑 Next stop: {nextPendingStopLabel}
            </div>
          )}
          {!nextPendingStopLabel &&
            activeRide?.status === "in_progress" &&
            rideStops.length > 0 && (
              <div className="driver-status-panel__rider-location">
                🏁 Heading to final destination
              </div>
            )}
          {rideStops.length > 0 && (
            <div className="driver-status-panel__stops">
              <MultiStopProgress
                stops={rideStops}
                rideStatus={activeRide.status}
                onNavigateToStop={openStopNavigation}
              />
            </div>
          )}
          <div className="driver-status-panel__ride-info">
            <span className="driver-status-panel__ride-fare">
              {activeRide.fare != null ? `${activeRide.fare} MRU` : "--"}
            </span>
            {activeRide.ride_type && (
              <span className="driver-status-panel__ride-type">
                {activeRide.ride_type}
              </span>
            )}
          </div>
          {rideActions && (
            <div className="driver-status-panel__ride-actions">
              {rideActions}
            </div>
          )}
          {onCancelRide && (
            <button
              type="button"
              onClick={onCancelRide}
              className="driver-status-panel__cancel-btn"
            >
              Cancel Ride
            </button>
          )}
        </div>
      ) : (
        /* Offline / Online content */
        <>
          <h2 className="driver-status-panel__title">
            {isOnline ? "You're online" : "You're offline"}
          </h2>
          <p
            className={`driver-status-panel__subtitle ${
              isOnline
                ? "driver-status-panel__subtitle--online"
                : "driver-status-panel__subtitle--offline"
            }`}
          >
            {isOnline
              ? "Waiting for ride requests"
              : "You won't receive any ride requests"}
          </p>

          <div className="driver-status-panel__level">
            <DriverLevelBadge
              level={driverLevel.level}
              points={driverLevel.points}
              nextLevelPoints={driverLevel.nextLevelPoints}
            />
          </div>

          <GoOnlineButton
            isOnline={isOnline}
            loading={loading}
            onToggle={onToggle}
          />
        </>
      )}
    </div>
  );
}
