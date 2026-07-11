import React from "react";

export default function DeliverySearchingScreen({
  etaMinutes = 25,
  onCancel,
  paymentSuccess = false,
}) {
  return (
    <div className="delivery-dash__searching">
      {paymentSuccess ? (
        <div className="delivery-dash__payment-success" role="status">
          <span className="delivery-dash__payment-success-icon" aria-hidden="true">✓</span>
          <div>
            <strong>Payment Successful</strong>
            <p>Searching for a courier...</p>
          </div>
        </div>
      ) : null}

      <div className="delivery-dash__searching-pulse" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2>{paymentSuccess ? "Matching courier" : "Finding courier"}</h2>
      <p>{paymentSuccess ? "We are connecting you with a nearby Yala courier" : "Matching you with a nearby Yala courier"}</p>
      <div className="delivery-dash__searching-eta">
        <strong>{etaMinutes}</strong>
        min estimated wait
      </div>
      <button type="button" className="delivery-dash__cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
