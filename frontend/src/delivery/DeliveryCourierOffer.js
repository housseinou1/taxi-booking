import React, { useEffect, useState } from "react";

import { CourierActionButton, CourierStickyActionBar } from "./components/CourierActionButton";
import { openExternalNavigation } from "./deliveryTrip";

const OFFER_SECONDS = 15;

function getCustomerLabel(delivery) {
  return delivery?.customer_name || delivery?.sender_name || delivery?.recipient_name || "Customer";
}

function getCustomerPhone(delivery) {
  return delivery?.customer_phone || delivery?.sender_phone || delivery?.recipient_phone || "";
}

function getRecipientLabel(delivery) {
  return delivery?.recipient_name || getCustomerLabel(delivery);
}

function getRecipientPhone(delivery) {
  return delivery?.recipient_phone || getCustomerPhone(delivery);
}

function formatPayment(delivery) {
  const method = delivery?.payment_method || delivery?.customer_payment_method;
  if (!method) return "Cash";
  return String(method).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCategory(category) {
  if (!category) return "Parcel";
  return String(category).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DeliveryCourierOffer({ delivery, onAccept, onDecline, onTimeout, busy = false }) {
  const [secondsLeft, setSecondsLeft] = useState(delivery?.offer_expires_in || OFFER_SECONDS);

  useEffect(() => {
    setSecondsLeft(delivery?.offer_expires_in || OFFER_SECONDS);
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          onTimeout?.();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [delivery?.id, onTimeout]);

  if (!delivery) return null;

  const eta = delivery.estimated_duration_minutes || 30;
  const pickupNav = delivery.pickup_lat
    ? { lat: delivery.pickup_lat, lng: delivery.pickup_lng, label: delivery.pickup }
    : null;
  const dropoffNav = delivery.destination_lat
    ? { lat: delivery.destination_lat, lng: delivery.destination_lng, label: delivery.destination }
    : null;

  return (
    <div className="cce-offer-overlay" role="dialog" aria-label="New delivery request">
      <div className="cce-offer-sheet">
        <div className="cce-offer-sheet__scroll">
          <div className="cce-offer-sheet__handle" aria-hidden />

          <div className="cce-offer-sheet__top">
            <span className="cce-offer-sheet__badge">New request</span>
            <div className="cce-offer-sheet__timer" aria-label={`${secondsLeft} seconds left`}>
              {secondsLeft}s
            </div>
          </div>

          <p className="cce-offer-sheet__fare">{delivery.fare} MRU</p>
          <p className="cce-offer-sheet__meta">
            {delivery.distance_km} km · ~{eta} min ETA · ~{eta + 5} min to complete
          </p>

          <div className="cce-offer-route">
            <div className="cce-offer-route__row">
              <span className="cce-offer-route__dot cce-offer-route__dot--pickup" aria-hidden />
              <div>
                <small>Pickup</small>
                <strong>{delivery.pickup}</strong>
                <p>{getCustomerLabel(delivery)}</p>
              </div>
              <div className="cce-offer-route__actions">
                {getCustomerPhone(delivery) ? (
                  <button type="button" onClick={() => { window.location.href = `tel:${getCustomerPhone(delivery)}`; }}>
                    Call
                  </button>
                ) : null}
                {pickupNav ? (
                  <button type="button" onClick={() => openExternalNavigation(pickupNav)}>
                    Navigate
                  </button>
                ) : null}
              </div>
            </div>

            <div className="cce-offer-route__row">
              <span className="cce-offer-route__dot cce-offer-route__dot--dropoff" aria-hidden />
              <div>
                <small>Dropoff</small>
                <strong>{delivery.destination}</strong>
                <p>
                  {getRecipientLabel(delivery)}
                  {getRecipientPhone(delivery) ? ` · ${getRecipientPhone(delivery)}` : ""}
                </p>
              </div>
              <div className="cce-offer-route__actions">
                {getRecipientPhone(delivery) ? (
                  <button type="button" onClick={() => { window.location.href = `tel:${getRecipientPhone(delivery)}`; }}>
                    Call
                  </button>
                ) : null}
                {dropoffNav ? (
                  <button type="button" onClick={() => openExternalNavigation(dropoffNav)}>
                    Navigate
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="cce-pill-row">
            <span className="cce-pill">{formatCategory(delivery.service_category)}</span>
            <span className="cce-pill">{(delivery.package_type || "small").toUpperCase()}</span>
            {delivery.weight_kg ? <span className="cce-pill">{delivery.weight_kg} kg</span> : null}
            <span className="cce-pill">{formatPayment(delivery)}</span>
            {delivery.is_urgent ? <span className="cce-pill">Urgent</span> : null}
            {delivery.is_fragile ? <span className="cce-pill">Fragile</span> : null}
          </div>
        </div>

        <CourierStickyActionBar split>
          <CourierActionButton
            variant="decline"
            iconName="close"
            disabled={busy}
            onClick={onDecline}
            ariaLabel="Decline delivery"
          >
            Decline
          </CourierActionButton>
          <CourierActionButton
            variant="accept"
            iconName="check"
            loading={busy}
            onClick={() => onAccept(delivery)}
            ariaLabel="Accept delivery"
          >
            Accept
          </CourierActionButton>
        </CourierStickyActionBar>
      </div>
    </div>
  );
}
