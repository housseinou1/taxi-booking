import React, { useCallback, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { fetchRideDetail } from "./driverEarningsHub";
import { tripDrivingMinutes, toAmount } from "./earningsNormalize";
import {
  printDriverReceipt,
  shareDriverReceipt,
} from "../utils/driverReceipt";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TripDetailRows({ ride }) {
  const fare = toAmount(ride.fare);
  const commission = toAmount(ride.app_fee);
  const net = toAmount(ride.driver_earning ?? ride.driver_share);
  const waitingFee = toAmount(ride.waiting_fee);
  const minutes = tripDrivingMinutes(ride);

  return (
    <div className="earnings-hub__trip-meta">
      {ride.distance_km != null ? <span>Distance: {Number(ride.distance_km).toFixed(1)} km</span> : null}
      {minutes != null ? <span>Duration: {minutes} min</span> : null}
      <span>Fare: {formatMoney(fare)}</span>
      {waitingFee > 0 ? <span>Waiting fee: {formatMoney(waitingFee)}</span> : null}
      {commission > 0 ? <span>Commission: {formatMoney(commission)}</span> : null}
      <span>Net earning: {formatMoney(net)}</span>
      {ride.payment_status ? (
        <span>Payment: {String(ride.payment_status).replace(/_/g, " ")}</span>
      ) : null}
      <span>Completed: {formatDateTime(ride.completed_at || ride.created_at)}</span>
    </div>
  );
}

export default function DriverTripBreakdownList({ trips = [], onLoadMore, hasMore = false, loading = false }) {
  const [expandedId, setExpandedId] = useState(null);
  const [detailById, setDetailById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);

  const handleExpand = useCallback(async (trip) => {
    const next = expandedId === trip.id ? null : trip.id;
    setExpandedId(next);
    if (!next || detailById[trip.id]) return;

    setDetailLoadingId(trip.id);
    try {
      const detail = await fetchRideDetail(trip.id);
      if (detail) {
        setDetailById((prev) => ({ ...prev, [trip.id]: detail }));
      }
    } finally {
      setDetailLoadingId(null);
    }
  }, [detailById, expandedId]);

  if (!trips.length && !loading) {
    return <div className="earnings-hub__empty">No completed trips yet.</div>;
  }

  return (
    <section className="earnings-hub__section" aria-label="Trip breakdown">
      <h3 className="earnings-hub__section-title">Recent trips</h3>
      {trips.map((trip) => {
        const expanded = expandedId === trip.id;
        const detail = detailById[trip.id] || trip;
        return (
          <article key={trip.id} className="earnings-hub__trip">
            <div className="earnings-hub__trip-head">
              <span>{formatDateTime(trip.completed_at || trip.created_at)}</span>
              <strong>{formatMoney(toAmount(trip.driver_earning ?? trip.fare))}</strong>
            </div>
            <div className="earnings-hub__trip-route">
              <div>📍 {trip.pickup || trip.pickup_address || "Pickup"}</div>
              <div>🏁 {trip.destination || trip.destination_address || "Destination"}</div>
            </div>
            {expanded ? (
              detailLoadingId === trip.id ? (
                <div className="earnings-hub__empty">Loading trip details...</div>
              ) : (
                <TripDetailRows ride={detail} />
              )
            ) : null}
            <div className="earnings-hub__trip-actions">
              <button type="button" onClick={() => handleExpand(trip)}>
                {expanded ? "Hide details" : "Trip breakdown"}
              </button>
              {expanded ? (
                <>
                  <button type="button" onClick={() => printDriverReceipt(detail)}>
                    Print receipt
                  </button>
                  <button type="button" onClick={() => shareDriverReceipt(detail)}>
                    Share receipt
                  </button>
                </>
              ) : null}
            </div>
          </article>
        );
      })}
      {hasMore ? (
        <button type="button" className="earnings-hub__btn" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading..." : "Load more trips"}
        </button>
      ) : null}
    </section>
  );
}
