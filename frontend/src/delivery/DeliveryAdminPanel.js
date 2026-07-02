import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import SecurityAdminPanel from "../security/SecurityAdminPanel";
import DeliveryAdminChatPanel from "./DeliveryAdminChatPanel";
import { apiRequest } from "./DeliveryShared";
import { getDeliveryCategoryLabel } from "./deliveryCategories";
import "./delivery-admin-uber.css";
import "./delivery-customer-dashboard.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "deliveries", label: "Orders" },
  { key: "couriers", label: "Couriers" },
  { key: "merchants", label: "Merchants" },
  { key: "approvals", label: "Approvals" },
  { key: "legal", label: "Legal" },
  { key: "disputes", label: "Disputes" },
  { key: "chat", label: "Chat safety" },
];

function resolveInitialTab() {
  if (typeof window === "undefined") return "overview";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((item) => item.key === tab) ? tab : "overview";
}

function statusClass(status) {
  if (status === "cancelled") return "is-cancelled";
  if (status === "delivery_exception") return "is-warning";
  if (["accepted", "picked_up", "in_transit", "courier_arriving", "requested"].includes(status)) return "is-active";
  return "";
}

export default function DeliveryAdminPanel({ embedded = false }) {
  const [tab, setTab] = useState(resolveInitialTab);
  const [deliveries, setDeliveries] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: "", date_to: "", category: "" });
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [chatDeliveryId, setChatDeliveryId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.category) params.set("category", filters.category);
      const query = params.toString() ? `?${params.toString()}` : "";

      const [analyticsRes, deliveriesRes, disputesRes] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/admin/analytics/${query}`),
        apiRequest(`${API_URL}/deliveries/mine/`),
        apiRequest(`${API_URL}/deliveries/admin/disputes/`).catch(() => []),
      ]);
      setAnalytics(analyticsRes);
      setDeliveries(deliveriesRes);
      setDisputes(disputesRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pendingDeliveries = useMemo(
    () => deliveries.filter((item) => item.status === "requested"),
    [deliveries]
  );

  const cancelledDeliveries = useMemo(
    () => deliveries.filter((item) => item.status === "cancelled"),
    [deliveries]
  );

  const exceptionDeliveries = useMemo(
    () => deliveries.filter((item) => item.status === "delivery_exception"),
    [deliveries]
  );

  const filteredDeliveries = useMemo(() => {
    if (deliveryFilter === "pending") return pendingDeliveries;
    if (deliveryFilter === "exceptions") return exceptionDeliveries;
    if (deliveryFilter === "cancelled") return cancelledDeliveries;
    if (deliveryFilter === "active") {
      return deliveries.filter((item) =>
        ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"].includes(item.status)
      );
    }
    return deliveries;
  }, [deliveryFilter, deliveries, pendingDeliveries, exceptionDeliveries, cancelledDeliveries]);

  const activeCouriers = useMemo(() => {
    const map = new Map();
    deliveries.forEach((delivery) => {
      if (
        !delivery.driver_name ||
        !["accepted", "picked_up", "in_transit", "courier_arriving", "delivering"].includes(delivery.status)
      ) {
        return;
      }
      map.set(delivery.driver_name, {
        name: delivery.driver_name,
        vehicle: delivery.courier_vehicle_label || delivery.vehicle || "Courier",
        plate: delivery.plate_number || "—",
        activeDeliveryId: delivery.id,
        city: delivery.service_city || "Nouakchott",
      });
    });
    return [...map.values()];
  }, [deliveries]);

  const chartRows = useMemo(() => {
    const entries = Object.entries(analytics?.revenue_by_category || {});
    const max = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
    return entries.map(([category, revenue]) => ({
      category,
      revenue: Number(revenue) || 0,
      width: `${Math.max(8, (Number(revenue) / max) * 100)}%`,
    }));
  }, [analytics]);

  const resolveDispute = async (disputeId, action) => {
    try {
      await apiRequest(`${API_URL}/deliveries/admin/disputes/${disputeId}/resolve/`, {
        method: "POST",
        body: JSON.stringify({ action, notes: "Resolved by admin." }),
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const resolveException = async (deliveryId, action) => {
    try {
      await apiRequest(`${API_URL}/deliveries/admin/deliveries/${deliveryId}/exceptions/${action}/`, {
        method: "POST",
        body: JSON.stringify({ note: `Admin ${action} from delivery dashboard.` }),
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className={`delivery-admin-uber ${embedded ? "delivery-admin-uber--embedded" : ""}`}>
      {!embedded ? (
        <header className="delivery-admin-uber__header">
          <div>
            <h1>Yala Delivery Admin</h1>
            <p>Operations dashboard · Revenue, couriers, merchants, and analytics</p>
          </div>
          <button type="button" className="delivery-admin-uber__back" onClick={() => (window.location.href = "/admin")}>
            Back to admin
          </button>
        </header>
      ) : null}

      <div className="delivery-admin-uber__body">
        <div className="delivery-admin-uber__tabs">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`delivery-admin-uber__tab ${tab === item.key ? "is-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="delivery-admin-uber__error">{error}</div> : null}

        {tab === "overview" ? (
          <>
            <div className="delivery-admin-uber__filters">
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
              />
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
              />
              <select value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}>
                <option value="">All categories</option>
                <option value="food">Food</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="grocery">Grocery</option>
                <option value="package">Parcel</option>
                <option value="documents">Documents</option>
                <option value="shopping">Shopping</option>
              </select>
            </div>

            {analytics ? (
              <div className="delivery-admin-uber__stats">
                <div className="delivery-admin-uber__stat">
                  <strong>{analytics.total}</strong>
                  <span>Total deliveries</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{analytics.active}</strong>
                  <span>Active deliveries</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{activeCouriers.length}</strong>
                  <span>Active couriers</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{pendingDeliveries.length}</strong>
                  <span>Pending deliveries</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{analytics.cancelled}</strong>
                  <span>Cancelled</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{analytics.exceptions || exceptionDeliveries.length}</strong>
                  <span>Delivery exceptions</span>
                </div>
                <div className="delivery-admin-uber__stat">
                  <strong>{Number(analytics.revenue).toFixed(0)} MRU</strong>
                  <span>Delivery revenue</span>
                </div>
              </div>
            ) : null}

            <div className="delivery-admin-uber__panel">
              <h3>Revenue by category</h3>
              {chartRows.length === 0 ? (
                <div className="delivery-admin-uber__empty">No revenue data yet.</div>
              ) : (
                <div className="delivery-admin-uber__chart">
                  {chartRows.map((row) => (
                    <div key={row.category} className="delivery-admin-uber__chart-row">
                      <span>{getDeliveryCategoryLabel(row.category)}</span>
                      <div className="delivery-admin-uber__chart-bar">
                        <span style={{ width: row.width }} />
                      </div>
                      <strong>{row.revenue.toFixed(0)} MRU</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analytics?.avg_delivery_minutes ? (
              <div className="delivery-admin-uber__panel">
                <h3>Performance</h3>
                <p>
                  Average delivery time: <strong>{analytics.avg_delivery_minutes} min</strong>
                </p>
                <p>
                  Open disputes: <strong>{analytics.dispute_count || 0}</strong>
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "deliveries" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Delivery orders</h3>
            <div className="delivery-dash__chip-row" style={{ marginBottom: 12 }}>
              {[
                { key: "all", label: "All" },
                { key: "pending", label: "Pending" },
                { key: "active", label: "Active" },
                { key: "exceptions", label: `Exceptions (${exceptionDeliveries.length})` },
                { key: "cancelled", label: "Cancelled" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`delivery-dash__chip ${deliveryFilter === item.key ? "is-active" : ""}`}
                  onClick={() => setDeliveryFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {loading ? <div className="delivery-admin-uber__empty">Loading deliveries...</div> : null}
            {!loading && filteredDeliveries.length === 0 ? (
              <div className="delivery-admin-uber__empty">No deliveries in this filter.</div>
            ) : null}
            {filteredDeliveries.length > 0 ? (
              <div className="delivery-admin-uber__table-wrap">
                <table className="delivery-admin-uber__table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Category</th>
                      <th>City</th>
                      <th>Customer</th>
                      <th>Courier</th>
                      <th>Route</th>
                      <th>Fare</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td>#{delivery.id}</td>
                        <td>
                          <span className={`delivery-admin-uber__badge ${statusClass(delivery.status)}`}>
                            {delivery.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>{getDeliveryCategoryLabel(delivery.service_category)}</td>
                        <td>{delivery.service_city || "—"}</td>
                        <td>{delivery.customer_name || "—"}</td>
                        <td>{delivery.driver_name || "Waiting"}</td>
                        <td>
                          {delivery.pickup} → {delivery.destination}
                        </td>
                        <td>{delivery.fare} MRU</td>
                        <td>
                          {delivery.status === "delivery_exception" ? (
                            <div className="delivery-admin-uber__exception-actions">
                              <strong>{delivery.exception_reason?.replace(/_/g, " ") || "No PIN"}</strong>
                              <span>{delivery.recipient_name} · {delivery.recipient_phone}</span>
                              {delivery.exception_note ? <span>{delivery.exception_note}</span> : null}
                              {delivery.proof_of_delivery ? (
                                <a href={delivery.proof_of_delivery} target="_blank" rel="noreferrer">View proof photo</a>
                              ) : null}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChatDeliveryId(delivery.id);
                                    setTab("chat");
                                  }}
                                >
                                  View chat
                                </button>
                                <button type="button" onClick={() => resolveException(delivery.id, "approve")}>Approve delivery</button>
                                <button type="button" onClick={() => resolveException(delivery.id, "reject")}>Reject</button>
                                <button type="button" onClick={() => resolveException(delivery.id, "refund")}>Refund</button>
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "couriers" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Active couriers</h3>
            {activeCouriers.length === 0 ? (
              <div className="delivery-admin-uber__empty">No active couriers right now.</div>
            ) : (
              <div className="delivery-admin-uber__courier-grid">
                {activeCouriers.map((courier) => (
                  <article key={courier.name} className="delivery-admin-uber__courier-card">
                    <strong>{courier.name}</strong>
                    <p>{courier.vehicle}</p>
                    <p>Plate: {courier.plate}</p>
                    <p>City: {courier.city}</p>
                    <p>Delivery #{courier.activeDeliveryId}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "merchants" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Merchant & store management</h3>
            <SecurityAdminPanel defaultTab="merchants" title="Stores & merchants" />
          </div>
        ) : null}

        {tab === "approvals" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Courier & merchant approvals</h3>
            <SecurityAdminPanel defaultTab="couriers" title="Pending approvals" />
          </div>
        ) : null}

        {tab === "legal" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Legal center</h3>
            <SecurityAdminPanel defaultTab="legal" title="Legal compliance" />
          </div>
        ) : null}

        {tab === "disputes" ? (
          <div className="delivery-admin-uber__panel">
            <h3>Disputes</h3>
            {disputes.length === 0 ? <div className="delivery-admin-uber__empty">No open disputes.</div> : null}
            {disputes.map((dispute) => (
              <article key={dispute.id} className="delivery-admin-uber__courier-card" style={{ marginBottom: 12 }}>
                <strong>Dispute #{dispute.id}</strong>
                <p>
                  Delivery #{dispute.delivery_id} · {dispute.rider_email}
                </p>
                <p>
                  {dispute.reason}: {dispute.description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="delivery-admin-uber__tab"
                    onClick={() => {
                      setChatDeliveryId(dispute.delivery_id);
                      setTab("chat");
                    }}
                  >
                    View chat
                  </button>
                {dispute.status !== "resolved" ? (
                  <>
                    <button
                      type="button"
                      className="delivery-admin-uber__tab is-active"
                      onClick={() => resolveDispute(dispute.id, "refund_full")}
                    >
                      Full refund
                    </button>
                    <button
                      type="button"
                      className="delivery-admin-uber__tab"
                      onClick={() => resolveDispute(dispute.id, "refund_partial")}
                    >
                      Partial refund
                    </button>
                    <button
                      type="button"
                      className="delivery-admin-uber__tab"
                      onClick={() => resolveDispute(dispute.id, "reject")}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <p>Resolved: {dispute.resolution}</p>
                )}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "chat" ? (
          <div className="delivery-admin-uber__panel delivery-admin-uber__panel--chat">
            <h3>Delivery chat safety</h3>
            <p className="delivery-admin-uber__muted">
              Review chat only for disputes, complaints, failed deliveries, PIN issues, and delivery exceptions.
            </p>
            <DeliveryAdminChatPanel initialDeliveryId={chatDeliveryId} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
