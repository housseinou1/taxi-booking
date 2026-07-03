import React, { useEffect, useRef, useState } from "react";

import { getDeliveryCategoryLabel } from "../deliveryCategories";
import { CourierActionButton, CourierStickyActionBar } from "./CourierActionButton";

const OFFER_SECONDS = 15;

function getCustomerName(delivery) {
  return delivery?.customer_name || delivery?.sender_name || delivery?.recipient_name || "Customer";
}

function formatCategory(category) {
  if (!category) return "Parcel";
  return getDeliveryCategoryLabel(category);
}

export default function DeliveryCourierRequestCard({
  delivery,
  busy = false,
  disabled = false,
  onAccept,
  onDecline,
  onTimeout,
  className = "",
}) {
  const [secondsLeft, setSecondsLeft] = useState(delivery?.offer_expires_in || OFFER_SECONDS);
  const totalSeconds = delivery?.offer_expires_in || OFFER_SECONDS;
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    setSecondsLeft(totalSeconds);
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          onTimeoutRef.current?.();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [delivery?.id, totalSeconds]);

  if (!delivery) return null;

  const eta = delivery.estimated_duration_minutes || 30;

  return (
    <article className={["cce-request-card", className].filter(Boolean).join(" ")}>
      <div className="cce-request-card__head">
        <div>
          <p className="cce-request-card__label">New delivery</p>
          <p className="cce-request-card__fare">
            {delivery.fare} <span>MRU</span>
          </p>
        </div>
        <div className="cce-request-card__timer" aria-label={`${secondsLeft} seconds left`}>
          <span>{secondsLeft}s</span>
        </div>
      </div>

      <p className="cce-request-card__meta">
        {delivery.distance_km} km · ~{eta} min
      </p>

      <div className="cce-request-card__route">
        <div className="cce-request-card__stop">
          <span className="cce-request-card__dot cce-request-card__dot--pickup" aria-hidden />
          <div>
            <small>Pickup</small>
            <strong>{delivery.pickup}</strong>
          </div>
        </div>
        <div className="cce-request-card__stop">
          <span className="cce-request-card__dot cce-request-card__dot--dropoff" aria-hidden />
          <div>
            <small>Dropoff</small>
            <strong>{delivery.destination}</strong>
          </div>
        </div>
      </div>

      <div className="cce-request-card__details">
        <span className="cce-pill">{formatCategory(delivery.service_category)}</span>
        <span className="cce-pill">{(delivery.package_type || "small").toUpperCase()}</span>
        <span className="cce-pill">{getCustomerName(delivery)}</span>
      </div>

      <CourierStickyActionBar split className="cce-request-card__actions">
        <CourierActionButton
          variant="decline"
          iconName="close"
          disabled={busy}
          onClick={() => onDecline?.(delivery)}
          ariaLabel="Decline delivery"
        >
          Decline
        </CourierActionButton>
        <CourierActionButton
          variant="accept"
          iconName="check"
          loading={busy}
          disabled={disabled}
          onClick={() => onAccept?.(delivery)}
          ariaLabel="Accept delivery"
        >
          Accept
        </CourierActionButton>
      </CourierStickyActionBar>
    </article>
  );
}
