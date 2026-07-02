import React, { useState } from "react";

import { formatDeliveryDuration } from "../deliveryTrackingStatus";

const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "wallet", label: "Wallet" },
];

export default function DeliveryCompleteScreen({ delivery, onContinue, busy = false }) {
  const [tip, setTip] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState(delivery.payment_method || "cash");
  const duration = delivery.delivery_duration_minutes;
  const tipAmount = Number(delivery.tip_amount || 0);
  const totalPaid = Number(delivery.fare || 0) + tipAmount;

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
        <h3>Payment summary</h3>
        <div className="delivery-track__summary-row">
          <span>Delivery fare</span>
          <strong>{Number(delivery.fare || 0).toFixed(2)} MRU</strong>
        </div>
        <div className="delivery-track__summary-row">
          <span>Tip</span>
          <strong>{tipAmount.toFixed(2)} MRU</strong>
        </div>
        <div className="delivery-track__summary-row delivery-track__summary-row--total">
          <span>Total paid</span>
          <strong>{totalPaid.toFixed(2)} MRU</strong>
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

      <p className="delivery-track__section-label">Payment method</p>
      <div className="delivery-track__chip-row">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            className={`delivery-track__chip ${paymentMethod === method.key ? "is-active" : ""}`}
            onClick={() => setPaymentMethod(method.key)}
          >
            {method.label}
          </button>
        ))}
      </div>

      <p className="delivery-track__section-label">Tip your courier</p>
      <div className="delivery-track__chip-row">
        {["0", "50", "100", "200"].map((amount) => (
          <button
            key={amount}
            type="button"
            className={`delivery-track__chip ${tip === amount ? "is-active" : ""}`}
            onClick={() => setTip(amount)}
          >
            {amount === "0" ? "No tip" : `${amount} MRU`}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="delivery-track__primary-btn"
        disabled={busy}
        onClick={() => onContinue({ paymentMethod, tip: Number(tip) })}
      >
        {busy ? "Processing..." : "Continue to rating"}
      </button>
    </div>
  );
}
