import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  exportBiReport,
  fetchBiExecutiveAnalytics,
  fetchBiGeographicIntelligence,
  fetchBiOverview,
  fetchBiPredictiveAnalytics,
  fetchBiSubjectAreas,
} from "./biAnalyticsApi";
import "../beta/BetaDashboard.css";
import "./BIAnalyticsCenter.css";

const TABS = [
  { id: "overview", label: "Data Warehouse Overview" },
  { id: "subjects", label: "Subject Areas" },
  { id: "executive", label: "Executive Analytics" },
  { id: "geo", label: "Geographic Intelligence" },
  { id: "predictive", label: "Predictive Analytics" },
  { id: "reports", label: "Self-Service Reports" },
];

const SUBJECT_NAMES = [
  "rides",
  "deliveries",
  "merchants",
  "drivers",
  "couriers",
  "customers",
  "wallets",
  "payments",
  "finance",
  "support",
  "trust_safety",
  "incentives",
  "marketing",
];

const PERIODS = ["daily", "weekly", "monthly", "quarterly", "annual"];
const REPORTS = [
  { id: "subject_areas", label: "Subject Areas Report" },
  { id: "executive_analytics", label: "Executive Analytics Report" },
  { id: "geographic", label: "Geographic Intelligence Report" },
  { id: "predictive", label: "Predictive Analytics Report" },
];
const FORMATS = ["csv", "excel", "pdf"];

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bi-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function BIAnalyticsCenter() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("monthly");
  const [cityId, setCityId] = useState("");
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = { period };
  if (cityId) params.city_id = cityId;

  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const overview = await fetchBiOverview(params);
      setData(overview);

      if (tab === "subjects") setDetail(await fetchBiSubjectAreas(params));
      if (tab === "executive") setDetail(await fetchBiExecutiveAnalytics(params));
      if (tab === "geo") setDetail(await fetchBiGeographicIntelligence(params));
      if (tab === "predictive") setDetail(await fetchBiPredictiveAnalytics(params));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load BI analytics");
    } finally {
      setLoading(false);
    }
  }, [tab, period, cityId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async (reportType, fmt) => {
    try {
      setError("");
      const response = await exportBiReport(reportType, fmt, params);
      const ext = fmt === "excel" ? "xlsx" : fmt;
      downloadBlob(response, `yala-bi-${reportType}-${period}.${ext}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Export failed");
    }
  };

  const renderSubjectCard = (subject, info) => {
    const metrics = Object.entries(info || {}).filter(([k]) => !["subject", "period"].includes(k));
    return (
      <div key={subject} className="bi-subject-card">
        <h4>{subject.replace(/_/g, " ").toUpperCase()}</h4>
        <div className="bi-subject-metrics">
          {metrics.slice(0, 6).map(([key, value]) => (
            <div key={key} className="bi-subject-metric">
              <span className="bi-metric-key">{key.replace(/_/g, " ")}</span>
              <span className="bi-metric-value">
                {typeof value === "number" ? (Number.isInteger(value) ? value : Number(value).toFixed(2)) : String(value ?? "—")}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    const subjectAreas = data?.subject_areas || {};
    const governance = data?.data_governance || {};
    const quality = data?.data_quality || {};
    return (
      <>
        <Section title="Data Governance">
          <div className="bi-grid">
            <MetricCard label="Subject Areas" value={(governance.subject_areas || []).length} />
            <MetricCard label="Refresh Schedule" value={governance.refresh_schedule} />
            <MetricCard label="Revenue QA Match" value={quality.revenue_matches_payments ? "Pass" : "Review"} />
            <MetricCard label="Driver Trips Today" value={quality.driver_trips_today} />
          </div>
        </Section>
        <Section title="Subject Areas">
          <div className="bi-subject-grid">
            {SUBJECT_NAMES.map((area) => renderSubjectCard(area, subjectAreas[area]))}
          </div>
        </Section>
      </>
    );
  };

  const renderSubjects = () => {
    const subjectAreas = detail?.subject_areas || {};
    return (
      <Section title="Subject Area Details">
        <div className="bi-subject-grid">
          {Object.entries(subjectAreas).map(([area, info]) => renderSubjectCard(area, info))}
        </div>
      </Section>
    );
  };

  const renderExecutive = () => {
    const e = detail || {};
    return (
      <div className="bi-grid">
        <MetricCard label="Revenue" value={formatMoney(e.revenue_mru)} />
        <MetricCard label="GMV" value={formatMoney(e.gmv_mru)} />
        <MetricCard label="Completed Rides" value={e.completed_rides} />
        <MetricCard label="Completed Deliveries" value={e.completed_deliveries} />
        <MetricCard label="Ride Growth" value={`${e.ride_growth_pct}%`} />
        <MetricCard label="Delivery Growth" value={`${e.delivery_growth_pct}%`} />
        <MetricCard label="Revenue Growth" value={`${e.revenue_growth_pct}%`} />
        <MetricCard label="Customer Retention" value={`${e.customer_retention_pct}%`} />
        <MetricCard label="Driver Retention" value={`${e.driver_retention_pct}%`} />
        <MetricCard label="Merchant Growth" value={e.merchant_growth} />
        <MetricCard label="Avg Response Time" value={`${e.avg_response_time_minutes} min`} />
        <MetricCard label="Avg Wait Time" value={`${e.avg_wait_time_minutes} min`} />
      </div>
    );
  };

  const renderGeo = () => {
    const g = detail || {};
    return (
      <>
        <div className="bi-grid">
          <MetricCard label="Demand Heatpoints" value={(g.demand_heatpoints || []).length} />
          <MetricCard label="Shortage Areas" value={(g.supply_demand?.shortage_areas || []).length} />
          <MetricCard label="Long ETA Areas" value={(g.supply_demand?.long_eta_areas || []).length} />
          <MetricCard label="Surge Zones" value={(g.supply_demand?.surge_zones || []).length} />
          <MetricCard label="Expansion Opportunities" value={(g.expansion_opportunities || []).length} />
        </div>
        <Section title="Ride Density">
          <ul className="bi-list">
            {(g.ride_density || []).map((row, idx) => (
              <li key={idx}>City {row.city_id} — {row.rides} rides</li>
            ))}
          </ul>
        </Section>
        <Section title="Revenue by District">
          <ul className="bi-list">
            {(g.revenue_by_district || []).map((row, idx) => (
              <li key={idx}>City {row.city_id} — {formatMoney(row.revenue_mru)}</li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderPredictive = () => {
    const p = detail || {};
    return (
      <>
        <div className="bi-grid">
          <MetricCard label="Daily Revenue Forecast" value={formatMoney(p.revenue_forecast?.daily_revenue)} />
          <MetricCard label="Weekly Revenue Forecast" value={formatMoney(p.revenue_forecast?.weekly_revenue)} />
          <MetricCard label="Predictive Alerts" value={(p.predictive_alerts || []).length} />
        </div>
        <Section title="Driver Supply Forecast">
          <pre className="bi-pre">{JSON.stringify(p.driver_supply_forecast || {}, null, 2)}</pre>
        </Section>
        <Section title="Peak Hours">
          <ul className="bi-list">
            {(p.demand_forecast?.peak_hours || []).map((h, idx) => (
              <li key={idx}>{h}</li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderReports = () => (
    <Section title="Self-Service Reports">
      <p className="beta__subtitle">Filter by period and city, then export CSV, Excel, or PDF.</p>
      <div className="bi-report-grid">
        {REPORTS.map((report) => (
          <div key={report.id} className="bi-report-card">
            <h4>{report.label}</h4>
            <div className="bi-report-actions">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className="bi-report-button"
                  onClick={() => handleExport(report.id, fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );

  const renderTab = () => {
    switch (tab) {
      case "overview":
        return renderOverview();
      case "subjects":
        return renderSubjects();
      case "executive":
        return renderExecutive();
      case "geo":
        return renderGeo();
      case "predictive":
        return renderPredictive();
      case "reports":
        return renderReports();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">Business Intelligence & Data Warehouse</h1>
          <p className="beta__subtitle">
            Unified analytics layer for operational, financial, and predictive insights.
          </p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading BI analytics…</p> : null}

      <div className="bi-controls">
        <label htmlFor="bi-period">Period:</label>
        <select id="bi-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <label htmlFor="bi-city">City ID:</label>
        <input
          id="bi-city"
          type="number"
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          placeholder="All"
        />
      </div>

      <div className="bi-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bi-tab ${tab === item.id ? "bi-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="bi-content">{renderTab()}</div>
    </div>
  );
}
