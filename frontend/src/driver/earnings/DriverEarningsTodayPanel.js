import React from "react";

import { formatEarningsMRU } from "./earningsNormalize";
import { averageTripValue, revenuePerHour } from "./earningsNormalize";

export default function DriverEarningsTodayPanel({ hub, formatAmount = formatEarningsMRU }) {
  if (!hub) return null;

  const today = hub.earnings?.today || {};
  const financials = hub.financials?.today || {};
  const hours = hub.onlineHours?.today ?? 0;
  const tripCount = today.rideCount || hub.summary?.todayCompletedRides || 0;
  const avgTrip = averageTripValue(today.totalEarnings, tripCount);
  const perHour = revenuePerHour(today.totalEarnings, hours);
  const drivingHours = financials.drivingMinutes
    ? (financials.drivingMinutes / 60).toFixed(1)
    : null;

  return (
    <section className="earnings-hub__section" aria-label="Today's earnings overview">
      <h3 className="earnings-hub__section-title">Today at a glance</h3>
      <div className="earnings-hub__grid">
        <div className="earnings-hub__stat">
          <strong>{formatAmount(today.totalEarnings)}</strong>
          <span>Total earnings</span>
        </div>
        <div className="earnings-hub__stat">
          <strong>{tripCount}</strong>
          <span>Completed trips</span>
        </div>
        <div className="earnings-hub__stat">
          <strong>{formatAmount(avgTrip)}</strong>
          <span>Avg trip value</span>
        </div>
        <div className="earnings-hub__stat">
          <strong>{hours} h</strong>
          <span>Online hours</span>
        </div>
        {drivingHours ? (
          <div className="earnings-hub__stat">
            <strong>{drivingHours} h</strong>
            <span>Trip driving time</span>
          </div>
        ) : null}
        {perHour != null ? (
          <div className="earnings-hub__stat">
            <strong>{formatAmount(perHour)}</strong>
            <span>Revenue / hour</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
