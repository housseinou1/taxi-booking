import React, { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import "./Delivery.css";

const CATEGORY_ICONS = { food: "🍕", package: "📦", document: "📄", pharmacy: "💊", shopping: "🛒" };

export default function DeliveryDriverApp() {
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [modeLoading, setModeLoading] = useState(true);
  const [codes, setCodes] = useState({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const signatureRef = useRef(null);

  const loadSettings = useCallback(async () => {
    try {
      setModeLoading(true);
      const settings = await apiRequest(`${API_URL}/deliveries/driver/mode/`);
      setDeliveryMode(settings.delivery_mode_enabled);
    } catch (_) {
      // Settings might not exist yet
    } finally {
      setModeLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [availableData, mineData] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/available/`),
        apiRequest(`${API_URL}/deliveries/mine/`),
      ]);
      setAvailable(availableData);
      setMine(mineData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    load();
  }, [loadSettings, load]);

  const toggleMode = async () => {
    try {
      setError("");
      const newValue = !deliveryMode;
      await apiRequest(`${API_URL}/deliveries/driver/mode/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_mode_enabled: newValue }),
      });
      setDeliveryMode(newValue);
      setNotice(newValue ? "Delivery mode enabled." : "Delivery mode disabled.");
    } catch (err) {
      setError(err.message);
    }
  };

  const act = async (delivery, action, body) => {
    try {
      setError("");
      await apiRequest(`${API_URL}/deliveries/${delivery.id}/${action}/`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setNotice(`Delivery #${delivery.id} updated.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmStop = async (delivery, stopId, code) => {
    try {
      setError("");
      const res = await apiRequest(`${API_URL}/deliveries/${delivery.id}/stops/${stopId}/confirm/`, {
        method: "POST",
        body: JSON.stringify({ recipient_code: code }),
      });
      if (res.all_stops_completed) {
        setNotice(`All stops completed! Delivery #${delivery.id} done.`);
      } else {
        setNotice(`Stop confirmed. Move to next stop.`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const active = mine.filter((d) => !["delivered", "cancelled"].includes(d.status));

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Verified driver delivery workspace" backPath="/driver" />
      <div className="delivery-layout">
        <section className="delivery-panel">
          {/* Delivery mode toggle */}
          <div className="delivery-mode-toggle">
            <h1>Delivery Mode</h1>
            {!modeLoading && (
              <button
                className={`delivery-button ${deliveryMode ? "delivery-button-gold" : "delivery-button-secondary"}`}
                onClick={toggleMode}
              >
                {deliveryMode ? "🟢 Active" : "⚪ Inactive"}
              </button>
            )}
          </div>
          <p className="delivery-panel-copy">
            {deliveryMode
              ? "You're receiving delivery requests. Accept one at a time."
              : "Enable delivery mode to receive package requests."}
          </p>

          {notice && <p className="delivery-notice">{notice}</p>}
          {error && <p className="delivery-notice delivery-notice-error">{error}</p>}

          <h2>Available deliveries</h2>
          <div className="delivery-list">
            {loading && <div className="delivery-empty">Loading...</div>}
            {!loading && available.length === 0 && <div className="delivery-empty">No available requests.</div>}
            {available.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery}>
                <div className="delivery-card-meta">
                  <span className="delivery-category-tag">
                    {CATEGORY_ICONS[delivery.service_category] || "📦"} {delivery.service_category}
                  </span>
                  {delivery.is_fragile && <span className="delivery-badge fragile">Fragile</span>}
                  {delivery.is_scheduled && <span className="delivery-badge scheduled">Scheduled</span>}
                  {delivery.stops && delivery.stops.length > 0 && (
                    <span className="delivery-badge">{delivery.stops.length} stops</span>
                  )}
                </div>
                <div className="delivery-card-actions">
                  <button
                    className="delivery-button delivery-button-gold"
                    disabled={active.length > 0}
                    onClick={() => act(delivery, "accept")}
                  >
                    Accept delivery
                  </button>
                </div>
              </DeliveryCard>
            ))}
          </div>
        </section>

        <section className="delivery-panel">
          <h2>Your active delivery</h2>
          <div className="delivery-list">
            {!loading && mine.length === 0 && <div className="delivery-empty">No deliveries yet.</div>}
            {mine.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery}>
                <p><strong>Recipient:</strong> {delivery.recipient_name} · {delivery.recipient_phone}</p>
                {delivery.customer_notes && <p className="delivery-muted">Notes: {delivery.customer_notes}</p>}

                {/* Multi-stop progress */}
                {delivery.stops && delivery.stops.length > 0 && (
                  <div className="delivery-stops-progress">
                    <h4>Delivery stops</h4>
                    {delivery.stops.map((stop) => (
                      <div key={stop.id} className={`delivery-stop-item ${stop.status}`}>
                        <span className="delivery-stop-order">#{stop.stop_order}</span>
                        <div>
                          <strong>{stop.recipient_name}</strong>
                          <p>{stop.address}</p>
                          <span className="delivery-badge">{stop.status}</span>
                        </div>
                        {stop.status !== "delivered" && ["picked_up", "delivering"].includes(delivery.status) && (
                          <div className="delivery-stop-actions">
                            <input
                              className="delivery-code-input"
                              maxLength="4"
                              inputMode="numeric"
                              placeholder="Code"
                              value={codes[`stop_${stop.id}`] || ""}
                              onChange={(e) => setCodes((prev) => ({ ...prev, [`stop_${stop.id}`]: e.target.value }))}
                            />
                            <button
                              className="delivery-button delivery-button-gold delivery-button-sm"
                              onClick={() => confirmStop(delivery, stop.id, codes[`stop_${stop.id}`] || "")}
                            >
                              Confirm
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Workflow buttons */}
                <div className="delivery-card-actions">
                  {delivery.status === "accepted" && (
                    <button className="delivery-button" onClick={() => act(delivery, "pickup")}>
                      📦 Package picked up
                    </button>
                  )}
                  {delivery.status === "picked_up" && (
                    <button className="delivery-button" onClick={() => act(delivery, "start")}>
                      🚗 Start delivery
                    </button>
                  )}
                  {["picked_up", "delivering"].includes(delivery.status) && (!delivery.stops || delivery.stops.length === 0) && (
                    <>
                      <input
                        className="delivery-code-input"
                        maxLength="4"
                        inputMode="numeric"
                        placeholder="Recipient code"
                        value={codes[delivery.id] || ""}
                        onChange={(e) => setCodes((prev) => ({ ...prev, [delivery.id]: e.target.value }))}
                      />
                      <button
                        className="delivery-button delivery-button-gold"
                        onClick={() => act(delivery, "confirm", { recipient_code: codes[delivery.id] || "" })}
                      >
                        ✅ Confirm handoff
                      </button>
                    </>
                  )}
                </div>
              </DeliveryCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
