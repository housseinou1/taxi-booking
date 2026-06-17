import React from "react";
import GoOnlineButton from "./GoOnlineButton";
import DriverLevelBadge from "./DriverLevelBadge";
import "./DriverStatusPanel.css";

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

  return (
    <div className="driver-status-panel driver-status-panel--animate">
      {/* Handle bar */}
      <div className="driver-status-panel__handle" />

      {hasActiveRide ? (
        /* Active ride content */
        <div className="driver-status-panel__ride">
          <div className="driver-status-panel__rider">
            {activeRide.rider_picture ? (
              <img
                className="driver-status-panel__rider-photo"
                src={activeRide.rider_picture}
                alt={activeRide.rider_name || "Rider"}
              />
            ) : (
              <span className="driver-status-panel__rider-photo driver-status-panel__rider-photo--fallback">
                {(activeRide.rider_name || "R").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <span className="driver-status-panel__rider-label">Rider</span>
              <strong className="driver-status-panel__rider-name">
                {activeRide.rider_name || "Rider"}
              </strong>
            </div>
          </div>
          <div className="driver-status-panel__ride-route">
            <span>{activeRide.pickup || "Pickup"}</span>
            <span className="driver-status-panel__ride-route-arrow">→</span>
            <span>{activeRide.destination || "Destination"}</span>
          </div>
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
