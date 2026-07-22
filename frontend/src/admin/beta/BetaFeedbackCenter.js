import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  APP_OPTIONS,
  fetchSupportList,
  QUEUE_TABS,
  SEVERITY_OPTIONS,
  updateSupportTicket,
} from "./supportApi";
import "../beta/BetaDashboard.css";

const CATEGORY_OPTIONS = [
  "emergency",
  "ride",
  "payment",
  "driver",
  "rider",
  "gps",
  "bug",
  "suggestion",
  "contact",
  "vehicle",
  "withdrawal",
  "customer",
  "store",
  "delivery",
  "other",
];

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function SeverityBadge({ severity }) {
  const cls = severity === "P0" ? "p0" : severity === "P1" ? "p1" : "ok";
  return <span className={`beta__badge beta__badge--${cls}`}>{severity}</span>;
}

export default function BetaFeedbackCenter() {
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState("open");
  const [filters, setFilters] = useState({
    app: "",
    severity: "",
    category: "",
    owner_id: "",
    emergency: "",
  });
  const [selected, setSelected] = useState(null);
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("");

  const queryParams = useMemo(() => {
    const params = { queue: activeQueue };
    if (filters.app) params.app = filters.app;
    if (filters.severity) params.priority = filters.severity;
    if (filters.category) params.category = filters.category;
    if (filters.owner_id) params.owner_id = filters.owner_id;
    if (filters.emergency) params.emergency = "true";
    return params;
  }, [activeQueue, filters]);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetchSupportList(queryParams);
      setDashboard(response.data.dashboard);
      setReports(response.data.reports || []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load support queue");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const openReport = (report) => {
    setSelected(report);
    setOwnerId(report.owner_id || "");
    setStatus(report.status);
  };

  const handleSave = async () => {
    if (!selected) return;
    await updateSupportTicket(selected.id, {
      owner_id: ownerId ? Number(ownerId) : null,
      status,
    });
    setSelected(null);
    await load();
  };

  const queueCounts = dashboard?.queue_counts || {};

  if (loading && !dashboard) {
    return <div className="beta">Loading support center…</div>;
  }

  return (
    <div className="beta">
      <a href="/admin" className="beta__back">
        ← Admin
      </a>
      <div className="beta__header">
        <div>
          <h1 className="beta__title">Support Center</h1>
          <p className="beta__subtitle">In-app support queue for rider, driver, and delivery closed beta</p>
        </div>
        <button type="button" className="beta__btn" onClick={load}>
          Refresh
        </button>
      </div>

      {error ? <div className="beta__error">{error}</div> : null}

      <section className="beta__section">
        <h2 className="beta__section-title">Dashboard</h2>
        <div className="beta__grid beta__grid--wide">
          <MetricCard label="Open tickets" value={dashboard?.open_tickets} />
          <MetricCard label="Critical (P0)" value={dashboard?.critical_issues} />
          <MetricCard
            label="Avg response"
            value={dashboard?.average_response_hours != null ? `${dashboard.average_response_hours} h` : "—"}
          />
          <MetricCard
            label="Avg resolution"
            value={dashboard?.average_resolution_hours != null ? `${dashboard.average_resolution_hours} h` : "—"}
          />
          <MetricCard label="Total reports" value={dashboard?.total_reports} />
        </div>
        {dashboard?.top_categories?.length ? (
          <div className="beta__panel" style={{ marginTop: 12 }}>
            <h4>Top issue categories</h4>
            <ul>
              {dashboard.top_categories.map((row) => (
                <li key={row.category}>
                  {row.category}: {row.count}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="beta__section">
        <h2 className="beta__section-title">Queue</h2>
        <div className="beta__panel" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {QUEUE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`beta__btn ${activeQueue === tab ? "beta__btn--primary" : ""}`}
              onClick={() => setActiveQueue(tab)}
            >
              {tab} ({queueCounts[tab] ?? 0})
            </button>
          ))}
        </div>
      </section>

      <section className="beta__section">
        <h2 className="beta__section-title">Filters</h2>
        <div className="beta__panel" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label>
            App{" "}
            <select value={filters.app} onChange={(e) => setFilters((f) => ({ ...f, app: e.target.value }))}>
              <option value="">All</option>
              {APP_OPTIONS.map((app) => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority{" "}
            <select value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
              <option value="">All</option>
              {SEVERITY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category{" "}
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
              <option value="">All</option>
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigned agent (user ID){" "}
            <input
              value={filters.owner_id}
              onChange={(e) => setFilters((f) => ({ ...f, owner_id: e.target.value }))}
              placeholder="Staff user ID"
            />
          </label>
          <label>
            Emergency only{" "}
            <select value={filters.emergency} onChange={(e) => setFilters((f) => ({ ...f, emergency: e.target.value }))}>
              <option value="">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
        </div>
      </section>

      <section className="beta__section">
        <h2 className="beta__section-title">
          {activeQueue} ({reports.length})
        </h2>
        <div className="beta__panel">
          <table className="beta__table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>App</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Subject</th>
                <th>User</th>
                <th>Agent</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.reference}</td>
                  <td>{report.app_type}</td>
                  <td>{report.category}</td>
                  <td>
                    <SeverityBadge severity={report.severity} />
                  </td>
                  <td>{report.status}</td>
                  <td>{report.subject || "—"}</td>
                  <td>{report.user_email || report.user_id}</td>
                  <td>{report.owner_email || "—"}</td>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" className="beta__btn" onClick={() => openReport(report)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="beta__section">
          <h2 className="beta__section-title">{selected.reference}</h2>
          <div className="beta__panel">
            {selected.is_emergency ? <p className="beta__badge beta__badge--p0">Emergency</p> : null}
            <p>
              <strong>Subject:</strong> {selected.subject || "—"}
            </p>
            <p>
              <strong>Description:</strong> {selected.description}
            </p>
            <p>
              <strong>First response:</strong>{" "}
              {selected.first_response_at ? new Date(selected.first_response_at).toLocaleString() : "—"}
            </p>
            <p>
              <strong>Timestamp:</strong> {new Date(selected.created_at).toLocaleString()}
            </p>
            {selected.screenshot_url ? (
              <p>
                <a href={selected.screenshot_url} target="_blank" rel="noreferrer">
                  View screenshot
                </a>
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <label>
                Status{" "}
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {QUEUE_TABS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned agent (staff user ID){" "}
                <input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="User ID" />
              </label>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" className="beta__btn beta__btn--primary" onClick={handleSave}>
                Save
              </button>
              <button type="button" className="beta__btn" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
