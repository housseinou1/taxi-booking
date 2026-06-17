import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import { apiRequest, DeliveryCard, DeliveryHeader } from "./DeliveryShared";
import "./Delivery.css";

const TABS = ["overview", "deliveries", "disputes", "business"];

export default function DeliveryAdminView() {
  const [tab, setTab] = useState("overview");
  const [deliveries, setDeliveries] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: "", date_to: "", category: "" });

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.category) params.set("category", filters.category);
      const query = params.toString() ? `?${params.toString()}` : "";

      const [analyticsRes, deliveriesRes, disputesRes, accountsRes] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/admin/analytics/${query}`),
        apiRequest(`${API_URL}/deliveries/mine/`),
        apiRequest(`${API_URL}/deliveries/admin/disputes/`).catch(() => []),
        apiRequest(`${API_URL}/deliveries/admin/business-accounts/`).catch(() => []),
      ]);
      setAnalytics(analyticsRes);
      setDeliveries(deliveriesRes);
      setDisputes(disputesRes);
      setAccounts(accountsRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  return (
    <main className="delivery-shell">
      <DeliveryHeader subtitle="Delivery operations and analytics" backPath="/admin" />
      <div className="delivery-layout" style={{ gridTemplateColumns: "1fr" }}>
        <section className="delivery-panel">
          {/* Tab navigation */}
          <div className="delivery-admin-tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={`delivery-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {error && <p className="delivery-notice delivery-notice-error">{error}</p>}

          {/* Filters */}
          {tab === "overview" && (
            <div className="delivery-admin-filters">
              <input type="date" value={filters.date_from} onChange={(e) => setFilters((p) => ({ ...p, date_from: e.target.value }))} />
              <input type="date" value={filters.date_to} onChange={(e) => setFilters((p) => ({ ...p, date_to: e.target.value }))} />
              <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}>
                <option value="">All categories</option>
                <option value="food">Food</option>
                <option value="package">Package</option>
                <option value="document">Document</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="shopping">Shopping</option>
              </select>
            </div>
          )}

          {/* Overview tab */}
          {tab === "overview" && analytics && (
            <>
              <div className="delivery-admin-stats">
                <div className="delivery-stat"><strong>{analytics.total}</strong><span>Total</span></div>
                <div className="delivery-stat"><strong>{analytics.active}</strong><span>Active</span></div>
                <div className="delivery-stat"><strong>{analytics.completed}</strong><span>Completed</span></div>
                <div className="delivery-stat"><strong>{analytics.cancelled}</strong><span>Cancelled</span></div>
                <div className="delivery-stat"><strong>{Number(analytics.revenue).toFixed(0)} MRU</strong><span>Revenue</span></div>
                {analytics.avg_delivery_minutes && (
                  <div className="delivery-stat"><strong>{analytics.avg_delivery_minutes} min</strong><span>Avg time</span></div>
                )}
              </div>

              {analytics.revenue_by_category && Object.keys(analytics.revenue_by_category).length > 0 && (
                <div className="delivery-revenue-breakdown">
                  <h3>Revenue by category</h3>
                  {Object.entries(analytics.revenue_by_category).map(([cat, rev]) => (
                    <div key={cat} className="delivery-fare-row">
                      <span>{cat}</span><span>{Number(rev).toFixed(0)} MRU</span>
                    </div>
                  ))}
                </div>
              )}

              {analytics.dispute_analytics && (
                <div className="delivery-dispute-stats">
                  <h3>Disputes</h3>
                  <p>Open: {analytics.dispute_analytics.open_count} | In review: {analytics.dispute_analytics.in_review_count} | Resolved: {analytics.dispute_analytics.resolved_count}</p>
                  {analytics.dispute_analytics.avg_resolution_hours && (
                    <p>Avg resolution: {analytics.dispute_analytics.avg_resolution_hours}h</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Deliveries tab */}
          {tab === "deliveries" && (
            <div className="delivery-list">
              {loading && <div className="delivery-empty">Loading...</div>}
              {!loading && deliveries.length === 0 && <div className="delivery-empty">No deliveries.</div>}
              {deliveries.map((d) => (
                <DeliveryCard key={d.id} delivery={d}>
                  <p><strong>Customer:</strong> {d.customer_name || "—"} · <strong>Driver:</strong> {d.driver_name || "Waiting"}</p>
                  <p className="delivery-muted">{d.service_category} · {d.distance_km} km</p>
                </DeliveryCard>
              ))}
            </div>
          )}

          {/* Disputes tab */}
          {tab === "disputes" && (
            <div className="delivery-list">
              {disputes.length === 0 && <div className="delivery-empty">No open disputes.</div>}
              {disputes.map((d) => (
                <article key={d.id} className="delivery-card">
                  <div className="delivery-card-top">
                    <div>
                      <h3>Dispute #{d.id}</h3>
                      <span className="delivery-muted">Delivery #{d.delivery_id} · {d.rider_email}</span>
                    </div>
                    <span className="delivery-badge">{d.status}</span>
                  </div>
                  <p><strong>Reason:</strong> {d.reason}</p>
                  <p>{d.description}</p>
                  {d.status !== "resolved" && (
                    <div className="delivery-card-actions">
                      <button className="delivery-button delivery-button-gold" onClick={() => resolveDispute(d.id, "refund_full")}>Full refund</button>
                      <button className="delivery-button" onClick={() => resolveDispute(d.id, "refund_partial")}>Partial refund</button>
                      <button className="delivery-button delivery-button-danger" onClick={() => resolveDispute(d.id, "reject")}>Reject</button>
                      <button className="delivery-button delivery-button-secondary" onClick={() => resolveDispute(d.id, "warn_driver")}>Warn driver</button>
                    </div>
                  )}
                  {d.status === "resolved" && (
                    <p className="delivery-muted">Resolved: {d.resolution} {d.refund_amount ? `(${d.refund_amount} MRU)` : ""}</p>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* Business accounts tab */}
          {tab === "business" && (
            <div className="delivery-list">
              {accounts.length === 0 && <div className="delivery-empty">No business accounts.</div>}
              {accounts.map((a) => (
                <article key={a.id} className="delivery-card">
                  <div className="delivery-card-top">
                    <div>
                      <h3>{a.company_name}</h3>
                      <span className="delivery-muted">{a.contact_person} · {a.contact_email}</span>
                    </div>
                    <span className={`delivery-badge ${a.is_active ? "active" : "inactive"}`}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="delivery-metrics">
                    <span><strong>{a.discount_percentage}%</strong> discount</span>
                    <span><strong>{a.daily_limit}</strong> daily limit</span>
                    <span><strong>{a.payment_terms}</strong> terms</span>
                    <span><strong>{a.delivery_count || 0}</strong> deliveries</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
