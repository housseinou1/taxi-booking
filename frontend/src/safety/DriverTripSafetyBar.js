import React from "react";

import { navigateInApp } from "../navigation/inAppNavigation";
import "./DriverTripSafetyBar.css";

export default function DriverTripSafetyBar({
  ride,
  gpsAccuracy = null,
  onEmergency,
  compact = false,
}) {
  if (!ride) return null;

  const rideId = ride.id || ride.ride_id;
  const riderName =
    ride.rider_name ||
    [ride.rider_first_name, ride.rider_last_name].filter(Boolean).join(" ") ||
    "Passenger";
  const pickup = ride.pickup || ride.pickup_address || "Pickup";
  const destination = ride.destination || ride.destination_address || "Destination";
  const accuracyLabel =
    gpsAccuracy != null && Number.isFinite(Number(gpsAccuracy))
      ? `${Math.round(Number(gpsAccuracy))} m`
      : "Checking GPS...";

  return (
    <section className={`driver-trip-safety${compact ? " driver-trip-safety--compact" : ""}`}>
      <div className="driver-trip-safety__header">
        <span className="driver-trip-safety__badge">Active trip safety</span>
        <span className="driver-trip-safety__gps">GPS ± {accuracyLabel}</span>
      </div>
      <div className="driver-trip-safety__grid">
        <div>
          <span className="driver-trip-safety__label">Passenger</span>
          <strong>{riderName}</strong>
        </div>
        <div>
          <span className="driver-trip-safety__label">Trip</span>
          <strong>#{rideId}</strong>
        </div>
      </div>
      <div className="driver-trip-safety__route">
        <div>
          <span className="driver-trip-safety__label">Pickup</span>
          <p>{pickup}</p>
        </div>
        <div>
          <span className="driver-trip-safety__label">Destination</span>
          <p>{destination}</p>
        </div>
      </div>
      <div className="driver-trip-safety__actions">
        <button type="button" className="driver-trip-safety__sos" onClick={onEmergency}>
          SOS
        </button>
        <button
          type="button"
          className="driver-trip-safety__support"
          onClick={() => navigateInApp("/driver/support?tab=contact")}
        >
          Support
        </button>
        <button
          type="button"
          className="driver-trip-safety__center"
          onClick={() => navigateInApp("/driver/safety")}
        >
          Safety Center
        </button>
      </div>
    </section>
  );
}
