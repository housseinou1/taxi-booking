import React from "react";

import MerchantStatusCard from "../components/MerchantStatusCard";
import DeliveryStatusTimeline from "../components/DeliveryStatusTimeline";
import { getStatusLabel, shouldShowPlate } from "../deliveryTrackingStatus";

export default function DeliveryLiveTracking({
  delivery,
  etaMinutes,
  pickupPin,
  dropoffPin,
  onCall,
  onChat,
  onReportIssue,
}) {
  const statusLabel = delivery.customer_display_label || getStatusLabel(delivery, etaMinutes);
  const courierLabel =
    delivery.courier_type_label || delivery.courier_vehicle_label || delivery.vehicle || "Courier";
  const courierType = delivery.courier_vehicle_type || delivery.courier_type_required || "";
  const showPickupPin =
    pickupPin && ["accepted", "courier_arriving"].includes(delivery.status) && delivery.requires_pickup_verification;
  const showDropoffPin =
    dropoffPin && ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"].includes(delivery.status);
  const photoUrl = delivery.driver_photo || delivery.courier_photo;
  const plate = delivery.plate_number || delivery.vehicle_plate || "";
  const showPlate = shouldShowPlate(courierType) && plate && plate !== "TEMP-PLATE";
  const hasDeliveryException = delivery.status === "delivery_exception";

  return (
    <div className="delivery-track">
      <div className="delivery-track__head">
        {etaMinutes ? (
          <div className={`delivery-track__eta ${delivery.arriving_soon ? "is-arriving" : ""}`}>
            <strong>{etaMinutes}</strong>
            <span>min</span>
          </div>
        ) : null}
        <div className="delivery-track__head-copy">
          <span className="delivery-track__status-pill">{statusLabel}</span>
          <p>{delivery.destination}</p>
        </div>
      </div>

      <MerchantStatusCard
        merchantOrder={delivery.merchant_order}
        merchantName={delivery.merchant_name}
      />

      {hasDeliveryException ? (
        <div className="delivery-track__exception" role="status">
          <strong>Delivery confirmation issue</strong>
          <p>Yala support is reviewing the courier proof photo and recipient confirmation issue.</p>
        </div>
      ) : null}

      <DeliveryStatusTimeline delivery={delivery} etaMinutes={etaMinutes} />

      {showPickupPin ? (
        <div className="delivery-track__pin">
          Pickup PIN <strong>{pickupPin}</strong>
        </div>
      ) : null}

      {showDropoffPin ? (
        <div className="delivery-track__pin delivery-track__pin--dropoff">
          <div className="delivery-track__pin-label">Recipient PIN</div>
          <strong className="delivery-track__pin-code">{dropoffPin}</strong>
          <p className="delivery-track__pin-hint">
            Share this PIN with {delivery.recipient_name || "the recipient"}. They must give it to the courier at delivery.
          </p>
        </div>
      ) : null}

      <section className="delivery-track__courier-card">
        <div className="delivery-track__courier-photo">
          {photoUrl ? <img src={photoUrl} alt="" /> : (delivery.driver_name || "C").charAt(0).toUpperCase()}
        </div>
        <div className="delivery-track__courier-body">
          <strong>{delivery.driver_name || "Your courier"}</strong>
          <div className="delivery-track__courier-meta">
            <span>★ {delivery.driver_rating || "4.9"}</span>
            <span className="delivery-track__pill">{courierLabel}</span>
            {showPlate ? <span>Plate {plate}</span> : null}
          </div>
        </div>
        <div className="delivery-track__courier-actions">
          {delivery.driver_phone ? (
            <button type="button" className="delivery-track__action-btn" onClick={onCall} aria-label="Call courier">
              📞
            </button>
          ) : null}
          <button type="button" className="delivery-track__action-btn" onClick={onChat} aria-label="Chat courier">
            💬
          </button>
          <button type="button" className="delivery-track__action-btn is-muted" onClick={onReportIssue} aria-label="Report issue">
            ⚠️
          </button>
        </div>
      </section>

      <section className="delivery-track__summary">
        <div className="delivery-track__summary-row">
          <span>Pickup</span>
          <strong>{delivery.pickup}</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Drop-off</span>
          <strong>{delivery.destination}</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Delivery fare</span>
          <strong>{delivery.fare} MRU</strong>
        </div>
      </section>
    </div>
  );
}
