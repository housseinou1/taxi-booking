import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import "./Delivery.css";

export default function DeliveryAdminView() {
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setDeliveries(await apiRequest(`${API_URL}/deliveries/mine/`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => ({
    total: deliveries.length,
    active: deliveries.filter((item) => ["requested", "accepted", "picked_up", "delivering"].includes(item.status)).length,
    delivered: deliveries.filter((item) => item.status === "delivered").length,
    revenue: deliveries.filter((item) => item.status === "delivered").reduce((sum, item) => sum + Number(item.fare || 0), 0),
  }), [deliveries]);

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Delivery operations and handoff monitoring" backPath="/admin" />
      <div className="delivery-layout" style={{ gridTemplateColumns: "1fr" }}>
        <section className="delivery-panel">
          <h1>Delivery operations</h1>
          <p className="delivery-panel-copy">Monitor package requests, assigned drivers, recipient handoffs, and completed delivery revenue.</p>
          {error && <p className="delivery-notice delivery-notice-error">{error}</p>}
          <div className="delivery-admin-stats">
            <div className="delivery-stat"><strong>{stats.total}</strong><span>Total</span></div>
            <div className="delivery-stat"><strong>{stats.active}</strong><span>Active</span></div>
            <div className="delivery-stat"><strong>{stats.delivered}</strong><span>Delivered</span></div>
            <div className="delivery-stat"><strong>{stats.revenue.toFixed(0)} MRU</strong><span>Revenue</span></div>
          </div>
          <div className="delivery-list">
            {loading && <div className="delivery-empty">Loading delivery operations...</div>}
            {!loading && deliveries.length === 0 && <div className="delivery-empty">No delivery activity yet.</div>}
            {deliveries.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery}>
                <p><strong>Customer:</strong> {delivery.customer_name || "Unknown"} · <strong>Driver:</strong> {delivery.driver_name || "Waiting for driver"}</p>
              </DeliveryCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
