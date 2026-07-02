import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import CourierSubpageShell from "./CourierSubpageShell";
import { apiRequest } from "./DeliveryShared";
import "./delivery-courier-flow.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "delivery_exception", label: "Exception" },
];

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusClass(status) {
  if (status === "delivered") return "is-delivered";
  if (status === "cancelled") return "is-cancelled";
  if (status === "delivery_exception") return "is-exception";
  return "";
}

function getStatusLabel(status) {
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  if (status === "delivery_exception") return "Exception";
  return status || "Unknown";
}

export default function DeliveryHistory() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`${API_URL}/deliveries/mine/`);
      const terminal = (Array.isArray(data) ? data : []).filter((item) =>
        ["delivered", "cancelled", "delivery_exception"].includes(item.status)
      );
      terminal.sort((a, b) => {
        const aTime = new Date(a.delivered_at || a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.delivered_at || b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
      setOrders(terminal);
    } catch (err) {
      setError(err.message || "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((item) => item.status === filter);
  }, [orders, filter]);

  return (
    <CourierSubpageShell title="Orders" activeNav="orders">
      <div className="ccf-filters" role="tablist" aria-label="Order filters">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={filter === item.key ? "is-active" : ""}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="delivery-uber__toast is-error">{error}</p> : null}
      {loading ? <p className="ccf-empty">Loading orders…</p> : null}
      {!loading && filtered.length === 0 ? (
        <div className="ccf-empty-state">
          <strong>No orders found</strong>
          <p>Completed deliveries appear here.</p>
        </div>
      ) : null}

      {filtered.map((delivery) => (
        <article key={delivery.id} className="ccf-history-item">
          <div>
            <strong>
              {delivery.pickup} → {delivery.destination}
            </strong>
            <p>{formatDateTime(delivery.delivered_at || delivery.updated_at || delivery.created_at)}</p>
            <span className={`ccf-status-pill ${getStatusClass(delivery.status)}`}>
              {getStatusLabel(delivery.status)}
            </span>
          </div>
          <div className="ccf-history-item__meta">
            <strong>{Number(delivery.driver_earning || delivery.fare || 0).toFixed(0)} MRU</strong>
          </div>
        </article>
      ))}
    </CourierSubpageShell>
  );
}
