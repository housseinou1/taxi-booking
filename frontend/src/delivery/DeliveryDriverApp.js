import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import "./Delivery.css";

export default function DeliveryDriverApp() {
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [codes, setCodes] = useState({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    load();
  }, [load]);

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

  const active = mine.filter((delivery) => !["delivered", "cancelled"].includes(delivery.status));

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Verified driver delivery workspace" backPath="/driver" />
      <div className="delivery-layout">
        <section className="delivery-panel">
          <h1>Available deliveries</h1>
          <p className="delivery-panel-copy">Accept one request at a time. Package and recipient details stay inside Yala.</p>
          {notice && <p className="delivery-notice">{notice}</p>}
          {error && <p className="delivery-notice delivery-notice-error">{error}</p>}
          <div className="delivery-list">
            {loading && <div className="delivery-empty">Loading deliveries...</div>}
            {!loading && available.length === 0 && <div className="delivery-empty">No available delivery requests.</div>}
            {available.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery}>
                <div className="delivery-card-actions">
                  <button className="delivery-button delivery-button-gold" disabled={active.length > 0} onClick={() => act(delivery, "accept")}>Accept delivery</button>
                </div>
              </DeliveryCard>
            ))}
          </div>
        </section>

        <section className="delivery-panel">
          <h2>Your delivery work</h2>
          <p className="delivery-panel-copy">Confirm each handoff step. The recipient code is required to finish delivery.</p>
          <div className="delivery-list">
            {!loading && mine.length === 0 && <div className="delivery-empty">You have not accepted a delivery yet.</div>}
            {mine.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery}>
                <p><strong>Recipient:</strong> {delivery.recipient_name} · {delivery.recipient_phone}</p>
                <div className="delivery-card-actions">
                  {delivery.status === "accepted" && <button className="delivery-button" onClick={() => act(delivery, "pickup")}>Package picked up</button>}
                  {delivery.status === "picked_up" && <button className="delivery-button" onClick={() => act(delivery, "start")}>Start delivery</button>}
                  {["picked_up", "delivering"].includes(delivery.status) && (
                    <>
                      <input className="delivery-code-input" maxLength="4" inputMode="numeric" placeholder="Recipient code" value={codes[delivery.id] || ""} onChange={(event) => setCodes((current) => ({ ...current, [delivery.id]: event.target.value }))} />
                      <button className="delivery-button delivery-button-gold" onClick={() => act(delivery, "confirm", { recipient_code: codes[delivery.id] || "" })}>Confirm handoff</button>
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
