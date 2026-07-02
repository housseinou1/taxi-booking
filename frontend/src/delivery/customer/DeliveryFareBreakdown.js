import React from "react";

import { buildFareBreakdownLines } from "../deliveryPricing";

function formatAmount(amount) {
  const value = Number(amount) || 0;
  if (value < 0) return `−${Math.abs(value)} MRU`;
  return `${value} MRU`;
}

export default function DeliveryFareBreakdown({ fare, promoMessage = "" }) {
  if (!fare) return null;

  const lines = buildFareBreakdownLines(fare);

  return (
    <div className="delivery-uber__fare-card">
      <div className="delivery-uber__fare-card-head">
        <strong>Fare breakdown</strong>
        <span>{fare.distanceKm} km</span>
      </div>

      <div className="delivery-uber__fare-lines">
        {lines.map((line) => (
          <div
            key={line.key}
            className={`delivery-uber__fare-line ${line.muted ? "is-muted" : ""} ${line.key === "discount" ? "is-discount" : ""}`}
          >
            <span>{line.label}</span>
            <span>{formatAmount(line.amount)}</span>
          </div>
        ))}
      </div>

      {promoMessage ? <p className="delivery-uber__fare-promo">{promoMessage}</p> : null}

      <div className="delivery-uber__fare-total">
        <span>Total price</span>
        <strong>{fare.total} MRU</strong>
      </div>

      <div className="delivery-uber__fare-split">
        <small>Courier earns {fare.courierEarning || fare.driverEarning} MRU</small>
        <small>Yala fee {fare.appFee || fare.platformCommission} MRU</small>
      </div>
    </div>
  );
}
