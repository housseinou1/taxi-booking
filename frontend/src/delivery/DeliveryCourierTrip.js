import React, { useState } from "react";

import DeliveryDropoffProof from "./DeliveryDropoffProof";
import DeliveryPickupProof from "./DeliveryPickupProof";
import { DeliveryCategoryTag } from "./DeliveryShared";
import {
  getNavigationPoint,
  getTripHeadline,
  getTripStage,
  getTripSubtitle,
  openExternalNavigation,
  TRIP_STAGES,
} from "./deliveryTrip";

export default function DeliveryCourierTrip({
  delivery,
  onArrive,
  onPickup,
  onStart,
  onConfirm,
  onConfirmStop,
  onDeliveryException,
  onCancel,
  onCall,
  onChat,
  onResendPin,
  onAdminSupport,
  busy = false,
}) {
  const stage = getTripStage(delivery);
  const navPoint = getNavigationPoint(delivery);
  const [activeStopId, setActiveStopId] = useState(null);

  const pendingStops = (delivery.stops || []).filter((stop) => stop.status !== "delivered");
  const activeStop = pendingStops.find((stop) => stop.id === activeStopId) || pendingStops[0] || null;

  return (
    <div className="delivery-uber-trip">
      <div className="delivery-uber-trip__head">
        <span className="delivery-uber-trip__stage">{getTripHeadline(delivery)}</span>
        <strong className="delivery-uber-trip__id">#{delivery.id}</strong>
      </div>
      <p className="delivery-uber-trip__subtitle">{getTripSubtitle(delivery)}</p>

      <div className="delivery-uber-trip__route">
        <div className="delivery-uber-trip__stop">
          <span className="delivery-uber__job-dot" />
          <div>
            <small>Pickup</small>
            <strong>{delivery.pickup}</strong>
          </div>
        </div>
        <div className="delivery-uber-trip__stop">
          <span className="delivery-uber__job-dot is-drop" />
          <div>
            <small>Dropoff</small>
            <strong>{delivery.destination}</strong>
          </div>
        </div>
      </div>

      <div className="delivery-uber-trip__meta">
        <span className="delivery-uber-trip__fare">{delivery.fare} MRU</span>
        <span className="delivery-uber-trip__distance">{delivery.distance_km} km</span>
        <DeliveryCategoryTag category={delivery.service_category} />
      </div>

      {delivery.recipient_name ? (
        <div className="delivery-uber-trip__contact">
          <span className="delivery-uber-trip__contact-name">{delivery.recipient_name}</span>
          <span className="delivery-uber-trip__contact-phone">{delivery.recipient_phone}</span>
        </div>
      ) : null}

      {onCall || onChat ? (
        <div className="delivery-uber-trip__contact-actions">
          {onCall ? (
            <button type="button" className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--secondary" onClick={onCall}>
              <span className="delivery-uber-trip__btn-icon" aria-hidden="true">📞</span>
              Call
            </button>
          ) : null}
          {onChat ? (
            <button type="button" className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--secondary" onClick={onChat}>
              <span className="delivery-uber-trip__btn-icon" aria-hidden="true">💬</span>
              Chat
            </button>
          ) : null}
        </div>
      ) : null}

      {delivery.customer_notes ? (
        <p className="delivery-uber-trip__notes">{delivery.customer_notes}</p>
      ) : null}

      {navPoint ? (
        <button
          type="button"
          className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--navigate"
          onClick={() => openExternalNavigation(navPoint)}
        >
          <span className="delivery-uber-trip__btn-icon" aria-hidden="true">🧭</span>
          Navigate
        </button>
      ) : null}

      <div className="delivery-uber-trip__actions">
        {delivery.status === "delivery_exception" ? (
          <div className="delivery-uber-proof__review">
            <strong>Sent to Yala support</strong>
            <p>
              This delivery is waiting for admin review because the recipient could not provide the PIN.
            </p>
          </div>
        ) : null}

        {stage === TRIP_STAGES.PICKUP ? (
          <button type="button" className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--primary" disabled={busy} onClick={onArrive}>
            {busy ? "Updating..." : "Arrived at pickup"}
          </button>
        ) : null}

        {stage === TRIP_STAGES.ARRIVING ? (
          <DeliveryPickupProof
            delivery={delivery}
            busy={busy}
            onSubmit={(payload) => onPickup(delivery, payload)}
          />
        ) : null}

        {stage === TRIP_STAGES.TRANSIT ? (
          <button type="button" className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--primary" disabled={busy} onClick={onStart}>
            {busy ? "Starting..." : "Start delivery"}
          </button>
        ) : null}

        {stage === TRIP_STAGES.DROPOFF && delivery.stops?.length ? (
          <div className="delivery-uber-trip__stops">
            {pendingStops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                className={`delivery-uber-trip__stop-btn ${activeStop?.id === stop.id ? "is-active" : ""}`}
                onClick={() => setActiveStopId(stop.id)}
              >
                Stop #{stop.stop_order} · {stop.recipient_name}
              </button>
            ))}
            {activeStop ? (
              <DeliveryDropoffProof
                title={`Stop #${activeStop.stop_order}`}
                subtitle={`Deliver to ${activeStop.recipient_name}. Ask for the 4-digit PIN, then photograph the handoff.`}
                busy={busy}
                onSubmit={({ pin, proofFile }) => onConfirmStop(delivery, activeStop.id, pin, proofFile)}
                onCall={onCall}
                onChat={onChat}
                onResendPin={onResendPin}
                onAdminSupport={onAdminSupport}
              />
            ) : null}
          </div>
        ) : null}

        {stage === TRIP_STAGES.DROPOFF && !delivery.stops?.length ? (
          <DeliveryDropoffProof
            busy={busy}
            requiresPhoto={Boolean(delivery.requires_proof_photo)}
            onSubmit={({ pin, proofFile }) => onConfirm(delivery, pin, proofFile)}
            onException={(payload) => onDeliveryException?.(delivery, payload)}
            onCall={onCall}
            onChat={onChat}
            onResendPin={onResendPin}
            onAdminSupport={onAdminSupport}
          />
        ) : null}

        {onCancel && ["accepted", "courier_arriving"].includes(delivery.status) ? (
          <button
            type="button"
            className="delivery-uber-trip__action-btn delivery-uber-trip__action-btn--cancel"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this delivery? The customer will be notified.")) {
                onCancel(delivery);
              }
            }}
          >
            Cancel delivery
          </button>
        ) : null}
      </div>
    </div>
  );
}
