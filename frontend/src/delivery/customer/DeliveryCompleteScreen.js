import React, { useState } from "react";

import { formatDeliveryDuration } from "../deliveryTrackingStatus";
import { DELIVERY_PAYMENT_METHODS } from "../../payments/paymentApi";
import { getDeliveryPaymentLabel } from "../../payments/deliveryPayment";

export default function DeliveryCompleteScreen({ delivery, onContinue, busy = false }) {
  const duration = delivery.delivery_duration_minutes;
  const totalPaid = Number(delivery.fare || 0) + Number(delivery.tip_amount || 0);

  return (
    <div className="delivery-track__complete">
      <div className="delivery-track__success-animation" aria-hidden>
        <span className="delivery-track__success-ring" />
        <span className="delivery-track__success-check">✓</span>
      </div>

      <div className="delivery-track__complete-hero">
        <h2>Delivered!</h2>
        <p>Your package arrived safely.</p>
      </div>

      <section className="delivery-track__payment-card">
        <h3>Delivery summary</h3>
        <div className="delivery-track__summary-row">
          <span>Delivery fare</span>
          <strong>{Number(delivery.fare || 0).toFixed(2)} MRU</strong>
        </div>
        {delivery.tip_amount ? (
          <div className="delivery-track__summary-row">
            <span>Tip</span>
            <strong>{Number(delivery.tip_amount || 0).toFixed(2)} MRU</strong>
          </div>
        ) : null}
        <div className="delivery-track__summary-row delivery-track__summary-row--total">
          <span>Total paid</span>
          <strong>{totalPaid.toFixed(2)} MRU</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Payment method</span>
          <strong>{getDeliveryPaymentLabel(delivery.payment_method)}</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Delivery duration</span>
          <strong>{formatDeliveryDuration(duration)}</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Courier</span>
          <strong>{delivery.driver_name || "Yala courier"}</strong>
        </div>
      </section>

      <button
        type="button"
        className="delivery-track__primary-btn"
        disabled={busy}
        onClick={onContinue}
      >
        {busy ? "Loading..." : "Rate courier"}
      </button>
    </div>
  );
}
