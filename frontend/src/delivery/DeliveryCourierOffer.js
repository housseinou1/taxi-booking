import React from "react";

import DeliveryCourierRequestCard from "./components/DeliveryCourierRequestCard";

/**
 * Uber-style floating request card — sits above the home sheet and bottom nav.
 */
export default function DeliveryCourierOffer({ delivery, onAccept, onDecline, onTimeout, busy = false }) {
  if (!delivery) return null;

  return (
    <div className="cce-offer-float" role="dialog" aria-label="New delivery request" aria-modal="true">
      <div className="cce-offer-float__scrim" aria-hidden />
      <DeliveryCourierRequestCard
        className="cce-offer-float__card"
        delivery={delivery}
        busy={busy}
        onAccept={onAccept}
        onDecline={onDecline}
        onTimeout={onTimeout}
      />
    </div>
  );
}
