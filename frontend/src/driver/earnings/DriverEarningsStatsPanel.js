import React from "react";

import { formatEarningsMRU, revenuePerHour, toAmount } from "./earningsNormalize";

export default function DriverEarningsStatsPanel({ hub }) {
  const stats = hub?.stats || {};
  const todayEarnings = toAmount(hub?.earnings?.today?.totalEarnings);
  const onlineHours = toAmount(hub?.onlineHours?.today);
  const perHour = revenuePerHour(todayEarnings, onlineHours);

  const acceptance = toAmount(stats.acceptance_rate ?? stats.acceptance_rate_points);
  const completion = toAmount(stats.completion_rate);
  const rating = toAmount(stats.average_rating ?? stats.rating);
  const tripsToday = Number(stats.rides_today ?? stats.total_rides_today ?? hub?.summary?.todayCompletedRides ?? 0);
  const driverScore = toAmount(stats.driver_score ?? stats.performance_points);

  const hasStats =
    acceptance > 0 ||
    completion > 0 ||
    rating > 0 ||
    tripsToday > 0 ||
    driverScore > 0 ||
    perHour != null;

  if (!hasStats) return null;

  return (
    <section className="earnings-hub__section" aria-label="Performance analytics">
      <h3 className="earnings-hub__section-title">Performance</h3>
      <div className="earnings-hub__analytics-grid">
        {tripsToday > 0 ? (
          <div className="earnings-hub__stat">
            <strong>{tripsToday}</strong>
            <span>Trips today</span>
          </div>
        ) : null}
        {perHour != null ? (
          <div className="earnings-hub__stat">
            <strong>{formatEarningsMRU(perHour)}</strong>
            <span>Revenue / hour</span>
          </div>
        ) : null}
        {acceptance > 0 ? (
          <div className="earnings-hub__stat">
            <strong>{Math.round(acceptance)}%</strong>
            <span>Acceptance</span>
          </div>
        ) : null}
        {completion > 0 ? (
          <div className="earnings-hub__stat">
            <strong>{Math.round(completion)}%</strong>
            <span>Completion</span>
          </div>
        ) : null}
        {rating > 0 ? (
          <div className="earnings-hub__stat">
            <strong>{rating.toFixed(1)}</strong>
            <span>Rating</span>
          </div>
        ) : null}
        {driverScore > 0 ? (
          <div className="earnings-hub__stat">
            <strong>{Math.round(driverScore)}</strong>
            <span>Driver score</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
