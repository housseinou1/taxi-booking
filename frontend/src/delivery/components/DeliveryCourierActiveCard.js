import React from "react";

import { getDeliveryCategoryLabel } from "../deliveryCategories";

const STATUS_LABELS = {
  accepted: "Accepted",
  courier_arriving: "Heading to pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivering: "Delivering",
};

function getCustomerName(delivery) {
  return delivery?.customer_name || delivery?.sender_name || delivery?.recipient_name || "Customer";
}

export default function DeliveryCourierActiveCard({ delivery }) {
  if (!delivery) return null;

  const statusLabel = STATUS_LABELS[delivery.status] || delivery.status?.replace(/_/g, " ");

  return (
    <article className="cce-active-card">
      <div className="cce-active-card__head">
        <div>
          <p className="cce-active-card__fare">
            {delivery.fare} <span>MRU</span>
          </p>
          <p className="cce-active-card__meta">
            {delivery.distance_km} km · {getCustomerName(delivery)}
          </p>
        </div>
        <span className="cce-active-card__status">{statusLabel}</span>
      </div>

      <div className="cce-active-card__route">
        <div>
          <small>Pickup</small>
          <strong>{delivery.pickup}</strong>
        </div>
        <div>
          <small>Dropoff</small>
          <strong>{delivery.destination}</strong>
        </div>
      </div>

      {delivery.service_category ? (
        <span className="cce-pill">{getDeliveryCategoryLabel(delivery.service_category)}</span>
      ) : null}
    </article>
  );
}
