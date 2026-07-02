import React from "react";

export default function DeliveryCourierComplete({ delivery, onDone }) {
  if (!delivery) return null;

  const earned = Number(delivery.driver_earning || delivery.fare || 0);
  const fare = Number(delivery.fare || 0);
  const commission = Number(delivery.platform_commission || 0);
  const tip = Number(delivery.tip || 0);

  return (
    <div className="ccf-complete" role="dialog" aria-label="Delivery complete">
      <div className="ccf-complete__card">
        <div className="ccf-complete__icon" aria-hidden="true">
          ✓
        </div>
        <h2>Delivery complete!</h2>
        <p className="ccf-complete__route">
          {delivery.pickup} → {delivery.destination}
        </p>

        <div className="ccf-complete__earned">
          <small>You earned</small>
          <strong>{earned.toFixed(0)} MRU</strong>
        </div>

        <div className="ccf-complete__breakdown">
          <div className="ccf-complete__row">
            <span>Delivery fare</span>
            <strong>{fare.toFixed(0)} MRU</strong>
          </div>
          {commission > 0 ? (
            <div className="ccf-complete__row">
              <span>Yala commission</span>
              <strong>-{commission.toFixed(0)} MRU</strong>
            </div>
          ) : null}
          {tip > 0 ? (
            <div className="ccf-complete__row">
              <span>Tip</span>
              <strong>+{tip.toFixed(0)} MRU</strong>
            </div>
          ) : null}
          <div className="ccf-complete__row ccf-complete__row--total">
            <span>Your payout</span>
            <strong>{earned.toFixed(0)} MRU</strong>
          </div>
        </div>

        <button type="button" className="ccf-btn ccf-btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
