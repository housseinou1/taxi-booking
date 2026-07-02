import React, { useCallback, useEffect, useRef, useState } from "react";

import { API_URL, WS_URL } from "../apiConfig";
import { apiRequest, DeliveryHeader, DeliveryStatus } from "./DeliveryShared";
import "./Delivery.css";

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export default function DeliveryTracking({ deliveryId, onBack }) {
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const wsRef = useRef(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const loadDelivery = useCallback(async () => {
    try {
      const data = await apiRequest(`${API_URL}/deliveries/${deliveryId}/`);
      setDelivery(data);
    } catch (err) {
      setError(err.message);
    }
  }, [deliveryId]);

  // WebSocket connection with exponential backoff
  const connectWs = useCallback(() => {
    if (!WS_URL) return;

    const token = localStorage.getItem("access");
    const separator = WS_URL.includes("?") ? "&" : "?";
    const url = `${WS_URL}${separator}token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      attemptRef.current = 0;
      // Join delivery group
      ws.send(JSON.stringify({ type: "join_delivery", delivery_id: deliveryId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "delivery_status_update" && msg.delivery_id === deliveryId) {
          setDelivery((prev) => prev ? { ...prev, status: msg.status } : prev);
        } else if (msg.type === "delivery_location_update" && msg.delivery_id === deliveryId) {
          // Could update map marker here
        } else if (msg.type === "delivery_stop_completed" && msg.delivery_id === deliveryId) {
          loadDelivery(); // Refresh for stop status update
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = RECONNECT_DELAYS[Math.min(attemptRef.current, RECONNECT_DELAYS.length - 1)];
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connectWs, delay);
    };

    ws.onerror = () => ws.close();
  }, [deliveryId, loadDelivery]);

  useEffect(() => {
    loadDelivery();
    connectWs();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [loadDelivery, connectWs]);

  if (!delivery) {
    return (
      <main className="delivery-shell">
        <DeliveryHeader subtitle="Delivery tracking" backPath="/delivery" />
        <div className="delivery-layout" style={{ gridTemplateColumns: "1fr" }}>
          <section className="delivery-panel">
            {error ? <p className="delivery-notice delivery-notice-error">{error}</p> : <p>Loading delivery...</p>}
          </section>
        </div>
      </main>
    );
  }

  const canDispute = delivery.status === "delivered" && !disputeOpen;

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Delivery tracking" backPath="/delivery" />
      <div className="delivery-layout" style={{ gridTemplateColumns: "1fr" }}>
        <section className="delivery-panel">
          <div className="delivery-tracking-header">
            <h1>Delivery #{delivery.id}</h1>
            <span className={`delivery-badge ${delivery.status}`}>{delivery.status.replace("_", " ")}</span>
            {!connected && <span className="delivery-badge offline">Reconnecting...</span>}
          </div>

          <DeliveryStatus status={delivery.status} />

          {/* Driver info */}
          {delivery.driver_name && (
            <div className="delivery-driver-info">
              <strong>{delivery.driver_name}</strong>
              {delivery.courier_vehicle_label && <span>{delivery.courier_vehicle_label}</span>}
              {delivery.vehicle && delivery.courier_vehicle_type === "car" && <span>{delivery.vehicle}</span>}
              {delivery.plate_number && delivery.courier_vehicle_type === "car" && (
                <span className="delivery-plate">{delivery.plate_number}</span>
              )}
              {delivery.driver_phone && <a href={`tel:${delivery.driver_phone}`} className="delivery-button delivery-button-sm">Call courier</a>}
            </div>
          )}

          {/* Route info */}
          <div className="delivery-tracking-route">
            <div className="delivery-route-point">
              <span className="route-dot pickup" />
              <div><strong>Pickup</strong><p>{delivery.pickup}</p></div>
            </div>

            {/* Multi-stop progress */}
            {delivery.stops && delivery.stops.map((stop) => (
              <div key={stop.id} className={`delivery-route-point ${stop.status === "delivered" ? "done" : ""}`}>
                <span className={`route-dot ${stop.status === "delivered" ? "delivered" : "pending"}`} />
                <div>
                  <strong>Stop {stop.stop_order}: {stop.recipient_name}</strong>
                  <p>{stop.address}</p>
                  <span className="delivery-badge">{stop.status}</span>
                </div>
              </div>
            ))}

            <div className="delivery-route-point">
              <span className="route-dot destination" />
              <div><strong>Destination</strong><p>{delivery.destination}</p></div>
            </div>
          </div>

          {/* Fare breakdown */}
          <div className="delivery-fare-breakdown">
            <h3>Fare breakdown</h3>
            <div className="delivery-fare-row"><span>Base fee</span><span>{delivery.base_fee} MRU</span></div>
            <div className="delivery-fare-row"><span>Distance</span><span>{delivery.distance_fee} MRU</span></div>
            {Number(delivery.extra_stop_fee) > 0 && <div className="delivery-fare-row"><span>Extra stops</span><span>{delivery.extra_stop_fee} MRU</span></div>}
            {Number(delivery.fragile_surcharge) > 0 && <div className="delivery-fare-row"><span>Fragile handling</span><span>{delivery.fragile_surcharge} MRU</span></div>}
            {Number(delivery.express_surcharge) > 0 && <div className="delivery-fare-row"><span>Express</span><span>{delivery.express_surcharge} MRU</span></div>}
            {Number(delivery.discount_amount) > 0 && <div className="delivery-fare-row discount"><span>Discount</span><span>-{delivery.discount_amount} MRU</span></div>}
            <div className="delivery-fare-row total"><span>Total</span><span>{delivery.fare} MRU</span></div>
          </div>

          {/* Proof of delivery */}
          {delivery.status === "delivered" && delivery.proof_of_delivery && (
            <div className="delivery-proof">
              <h3>Proof of delivery</h3>
              <img src={delivery.proof_of_delivery} alt="Proof of delivery" />
            </div>
          )}

          {/* Actions */}
          <div className="delivery-card-actions">
            <button className="delivery-button delivery-button-secondary" onClick={onBack}>Back to deliveries</button>
            {canDispute && (
              <button className="delivery-button delivery-button-danger" onClick={() => setDisputeOpen(true)}>
                Report an issue
              </button>
            )}
          </div>

          {/* Dispute form */}
          {disputeOpen && <DisputeForm deliveryId={deliveryId} onDone={() => { setDisputeOpen(false); loadDelivery(); }} />}
        </section>
      </div>
    </main>
  );
}

function DisputeForm({ deliveryId, onDone }) {
  const [reason, setReason] = useState("damaged");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(`${API_URL}/deliveries/${deliveryId}/dispute/`, {
        method: "POST",
        body: JSON.stringify({ reason, description }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="delivery-dispute-form" onSubmit={submit}>
      <h3>Report an issue</h3>
      {error && <p className="delivery-notice delivery-notice-error">{error}</p>}
      <label>
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="damaged">Package damaged</option>
          <option value="lost">Package lost</option>
          <option value="late">Delivery too late</option>
          <option value="wrong_item">Wrong item</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Description ({description.length}/500)
        <textarea
          required
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue..."
        />
      </label>
      <div className="delivery-card-actions">
        <button type="submit" className="delivery-button delivery-button-gold" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit dispute"}
        </button>
        <button type="button" className="delivery-button delivery-button-secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
