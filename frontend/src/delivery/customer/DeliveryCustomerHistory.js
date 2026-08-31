import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../../apiConfig";
import YalaEmptyState from "../../components/YalaEmptyState";
import YalaErrorState from "../../components/YalaErrorState";
import YalaLoadingState from "../../components/YalaLoadingState";
import { formatMoney } from "../../marketConfig";
import { apiRequest } from "../DeliveryShared";

const STATUS_LABELS = {
  delivered: "Delivered",
  cancelled: "Cancelled",
  requested: "Requested",
  accepted: "Accepted",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivering: "Delivering",
};

export default function DeliveryCustomerHistory({ onBack }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest(`${API_URL}/deliveries/mine/`);
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load order history.");
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="delivery-home">
      <div className="delivery-home__section-head">
        <h2>Your orders</h2>
        <button type="button" className="delivery-track__secondary-btn" onClick={onBack}>
          Back
        </button>
      </div>

      {loading ? <YalaLoadingState label="Loading your orders…" compact /> : null}
      {!loading && error ? (
        <YalaErrorState message={error} onRetry={loadHistory} />
      ) : null}
      {!loading && !error && !deliveries.length ? (
        <YalaEmptyState
          icon="🛍️"
          title="No orders yet"
          message="Place your first order from the home screen."
          actionLabel="Browse stores"
          onAction={onBack}
        />
      ) : null}

      <div className="delivery-uber__history-list">
        {deliveries.map((item) => (
          <article key={item.id} className="delivery-uber__history-item">
            <div>
              <strong>#{item.id}</strong>
              <p>{item.pickup || "Pickup"} → {item.destination || "Destination"}</p>
              <small>{STATUS_LABELS[item.status] || item.status}</small>
            </div>
            <div className="delivery-uber__history-meta">
              <span>{formatMoney(item.fare || item.total || 0)}</span>
              <small>
                {item.created_at
                  ? new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : ""}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
