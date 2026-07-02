import React from "react";

export default function DeliverySearchingScreen({ etaMinutes = 25, onCancel }) {
  return (
    <div className="delivery-dash__searching">
      <div className="delivery-dash__searching-pulse" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2>Finding courier</h2>
      <p>Matching you with a nearby Yala courier</p>
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
