import React, { useCallback, useEffect, useState } from "react";

import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";
import { formatMoneyOrDash } from "../components/library/utils/formatters";
import {
  downloadBoardReport,
  saveBlob,
  fetchBoardBusinessKpis,
  fetchBoardExecutiveSummary,
  fetchBoardFinancialReport,
  fetchBoardGrowthReport,
  fetchBoardOperationalReport,
  fetchBoardReportingSuite,
  fetchBoardRiskDashboard,
  fetchBoardStrategicPlanning,
} from "./boardReportingApi";
import "../beta/BetaDashboard.css";
import "./BoardReportingSuite.css";

const DASH = "\u2014";

const TABS = [
  { id: "executive", label: "Executive Summary" },
  { id: "business-kpis", label: "Business KPIs" },
  { id: "financial", label: "Financial Reports" },
  { id: "operational", label: "Operational Reports" },
  { id: "growth", label: "Growth Reports" },
  { id: "risk", label: "Risk Dashboard" },
  { id: "strategic", label: "Strategic Planning" },
  { id: "export", label: "Export" },
];

const PERIODS = ["daily", "weekly", "monthly", "quarterly", "annual"];
// `presentation` is gone: the backend returned byte-identical PDF bytes for it, so
// it duplicated the PDF button without offering a different format.
const EXPORT_FORMATS = ["csv", "excel", "pdf"];
const EXPORT_REPORTS = [
  { id: "full", label: "Full Suite" },
  { id: "executive", label: "Executive Summary" },
  { id: "business_kpis", label: "Business KPIs" },
  { id: "financial", label: "Financial" },
  { id: "operational", label: "Operational" },
  { id: "growth", label: "Growth" },
  { id: "risk", label: "Risk" },
  { id: "strategic", label: "Strategic" },
];

// Which tabs the backend actually honours `period` for. board_reporting_views only reads the
// period for the suite, executive, financial and export views; the other endpoints are
// computed over fixed windows and ignore it. The UI says so rather than implying that a
// filter was applied when it was not.
const PERIOD_AWARE_TABS = new Set(["executive", "financial"]);

/** A percentage that is honest about absence - never "undefined%", never a fabricated 0. */
function pct(value, digits = 1) {
  if (value === null || value === undefined || value === "") return DASH;
  const num = Number(value);
  if (Number.isNaN(num)) return DASH;
  return `${num.toFixed(digits)}%`;
}

/** A plain count that is honest about absence - a real 0 stays 0. */
function count(value) {
  if (value === null || value === undefined || value === "") return DASH;
  return value;
}

/** Humanise a snake_case key for display. */
function humanise(key) {
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render a scalar for a table cell, keeping genuine zeros and dashes for absence. */
function cellValue(value) {
  if (value === null || value === undefined || value === "") return DASH;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function MetricCard({ label, value, sub, critical = false }) {
  return (
    <div className={`beta__card ${critical ? "board-report-critical" : ""}`}>
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? DASH}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="board-report-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * A professional table for object payloads.
 *
 * These sections used to dump raw `JSON.stringify` output into a <pre>, which is not a
 * report. Scalars render as a label/value table; arrays of objects render as a real
 * column table so the figures can actually be read.
 */
function DataTable({ data, emptyLabel = "No data available for this period." }) {
  const rows = React.useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter((r) => r && typeof r === "object");
    if (typeof data !== "object") return [];
    // {"total": 5, "by_status": {...}} -> a label/value table.
    return Object.entries(data).map(([key, value]) => ({ metric: humanise(key), value }));
  }, [data]);

  if (!rows.length) {
    return <p className="board-report-empty">{emptyLabel}</p>;
  }

  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return (
    <div className="board-report-table-wrap">
      <table className="board-report-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {humanise(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{cellValue(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BoardReportingSuite() {
  const [tab, setTab] = useState("executive");
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  const [exportNotice, setExportNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      // Clear the previous tab's payload first. Without this, a failed request for the new
      // tab leaves the old tab's data on screen, so one report's figures appear under
      // another report's heading.
      setDetail(null);

      const suite = await fetchBoardReportingSuite({ period });
      setData(suite);

      if (tab === "executive") setDetail(await fetchBoardExecutiveSummary({ period }));
      if (tab === "business-kpis") setDetail(await fetchBoardBusinessKpis({ period }));
      if (tab === "financial") setDetail(await fetchBoardFinancialReport({ period }));
      if (tab === "operational") setDetail(await fetchBoardOperationalReport({ period }));
      if (tab === "growth") setDetail(await fetchBoardGrowthReport({ period }));
      if (tab === "risk") setDetail(await fetchBoardRiskDashboard({ period }));
      if (tab === "strategic") setDetail(await fetchBoardStrategicPlanning({ period }));
    } catch (err) {
      setError(apiErrorMessage(err, { resource: "board reports" }));
    } finally {
      setLoading(false);
    }
  }, [tab, period]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = useCallback(
    async (reportId, format) => {
      const key = `${reportId}:${format}`;
      setExporting(key);
      setExportNotice(null);
      try {
        const { blob, filename, contentType } = await downloadBoardReport(reportId, format, { period });
        saveBlob(blob, filename);
        setExportNotice({
          ok: true,
          message: `Downloaded ${filename} (${contentType || "unknown type"}, ${blob.size} bytes).`,
        });
      } catch (err) {
        setExportNotice({
          ok: false,
          message: apiErrorMessage(err, { resource: "board report export", action: "export" }),
        });
      } finally {
        setExporting("");
      }
    },
    [period]
  );

  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);

  const renderExecutive = () => {
    const s = detail || {};
    return (
      <>
        <p className="beta__subtitle">{periodLabel} Executive Summary</p>
        <div className="board-report-grid">
          <MetricCard label="GMV" value={formatMoneyOrDash(s.gmv_mru)} sub={s.period} />
          <MetricCard label="Completed Rides" value={s.completed_rides} />
          <MetricCard label="Completed Deliveries" value={s.completed_deliveries} />
          <MetricCard label="Cancellation Rate" value={pct(s.cancellation_rate_pct)} />
          <MetricCard label="Active Riders" value={s.active_riders} />
          <MetricCard label="Active Drivers" value={s.active_drivers} />
        </div>
        <Section title="Highlights">
          <ul className="board-report-list">
            {(s.highlights || []).map((h, idx) => (
              <li key={idx}>{h}</li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderBusinessKpis = () => {
    const k = detail || {};
    return (
      <div className="board-report-grid">
        <MetricCard label="Revenue" value={formatMoneyOrDash(k.revenue_mru)} />
        <MetricCard label="GMV" value={formatMoneyOrDash(k.gmv_mru)} />
        <MetricCard label="Completed Rides" value={k.completed_rides} />
        <MetricCard label="Completed Deliveries" value={k.completed_deliveries} />
        <MetricCard label="Merchant Sales" value={formatMoneyOrDash(k.merchant_sales_mru)} />
        <MetricCard label="Active Riders" value={k.active_riders} />
        <MetricCard label="Active Drivers" value={k.active_drivers} />
        <MetricCard label="Active Couriers" value={k.active_couriers} />
        <MetricCard label="Driver Retention" value={pct(k.driver_retention_pct)} />
        <MetricCard label="Customer Retention" value={pct(k.customer_retention_pct)} />
        <MetricCard label="Avg Order Value" value={formatMoneyOrDash(k.average_order_value_mru)} />
        <MetricCard label="Avg Ride Fare" value={formatMoneyOrDash(k.average_ride_fare_mru)} />
        <MetricCard label="Revenue Growth" value={pct(k.revenue_growth_pct)} />
      </div>
    );
  };

  const renderFinancial = () => {
    const f = detail || {};
    const income = f.income_summary || {};
    const cashFlow = f.cash_flow_summary || {};
    return (
      <>
        <div className="board-report-grid">
          <MetricCard label="Gross Revenue" value={formatMoneyOrDash(income.gross_revenue_mru)} />
          <MetricCard label="Platform Commission" value={formatMoneyOrDash(income.platform_commission_mru)} />
          <MetricCard label="Merchant Commission" value={formatMoneyOrDash(income.merchant_commission_mru)} />
          <MetricCard label="Partner Revenue Share" value={formatMoneyOrDash(income.partner_revenue_share_mru)} />
          <MetricCard label="Operating Expenses" value={formatMoneyOrDash(f.operating_expenses_mru)} />
          <MetricCard label="Net Operating Income" value={formatMoneyOrDash(f.net_operating_income_mru)} />
          <MetricCard label="Wallet Balance" value={formatMoneyOrDash(f.wallet_balance_mru)} />
          <MetricCard label="Outstanding Liabilities" value={formatMoneyOrDash(f.outstanding_liabilities_mru)} />
          <MetricCard label="Outstanding Refunds" value={formatMoneyOrDash(f.refund_summary?.amount_mru)} sub={`${f.refund_summary?.count ?? 0} requests`} critical />
        </div>
        <Section title="Cash Flow Summary">
          <div className="board-report-grid">
            <MetricCard label="Cash In" value={formatMoneyOrDash(cashFlow.cash_in_mru)} />
            <MetricCard label="Cash Out" value={formatMoneyOrDash(cashFlow.cash_out_mru)} />
            <MetricCard label="Net Cash Flow" value={formatMoneyOrDash(cashFlow.net_cash_flow_mru)} />
          </div>
        </Section>
      </>
    );
  };

  const renderOperational = () => {
    const o = detail || {};
    const ride = o.ride_performance || {};
    const delivery = o.delivery_performance || {};
    const incident = o.incident_statistics || {};
    return (
      <>
        <div className="board-report-grid">
          <MetricCard label="Completed Rides" value={ride.completed} />
          <MetricCard label="Cancelled Rides" value={ride.cancelled} />
          <MetricCard label="Completed Deliveries" value={delivery.completed} />
          <MetricCard label="Cancelled Deliveries" value={delivery.cancelled} />
          <MetricCard label="Open Incidents" value={incident.open_count} critical={incident.open_count > 0} />
          <MetricCard label="Platform Uptime" value={pct(o.platform_uptime_pct)} />
        </div>
        <Section title="Safety Metrics">
          <div className="board-report-grid">
            <MetricCard label="Safety Score" value={o.safety_metrics?.safety_score} />
            <MetricCard label="Open Safety Incidents" value={o.safety_metrics?.open_incidents} critical={(o.safety_metrics?.open_incidents || 0) > 0} />
            <MetricCard label="Emergency Alerts (24h)" value={o.safety_metrics?.emergency_alerts_24h} />
            <MetricCard label="Avg Resolution (hrs)" value={o.safety_metrics?.avg_resolution_hours ?? DASH} />
          </div>
        </Section>
        <Section title="Support Metrics">
          <DataTable data={o.support_metrics} emptyLabel="No support metrics reported for this period." />
        </Section>
      </>
    );
  };

  const renderGrowth = () => {
    const g = detail || {};
    const cg = g.customer_growth || {};
    return (
      <>
        <div className="board-report-grid">
          <MetricCard label="New Riders (Month)" value={cg.new_riders_month} />
          <MetricCard label="New Drivers (Month)" value={cg.new_drivers_month} />
          <MetricCard label="New Merchants (Month)" value={cg.new_merchants_month} />
          <MetricCard label="Active Riders" value={cg.active_riders} />
          <MetricCard label="Active Drivers" value={cg.active_drivers} />
          <MetricCard label="Rider Referrals" value={g.referral_growth?.rider_referrals_month} />
          <MetricCard label="Driver Referrals" value={g.referral_growth?.driver_referrals_month} />
        </div>
        <Section title="Marketing Campaign Results">
          <DataTable
            data={g.marketing_campaign_results}
            emptyLabel="No marketing campaign results reported for this period."
          />
        </Section>
        <Section title="Top Cities">
          <ul className="board-report-list">
            {(g.city_growth || []).map((c) => (
              <li key={c.id || c.city_id}>
                {c.name} — {count(c.completed_rides)} rides
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderRisk = () => {
    const r = detail || {};
    return (
      <>
        <div className="board-report-score">
          <h2>
            Overall Risk Score: {r.overall_risk_score ?? DASH}
            {r.overall_risk_score === null || r.overall_risk_score === undefined ? null : "/100"}
          </h2>
          <p>
            Risk Level: <strong>{r.risk_level ?? DASH}</strong>
          </p>
        </div>
        <div className="board-report-grid">
          {Object.entries(r.categories || {}).map(([key, vals]) => (
            <MetricCard
              key={key}
              label={`${key.replace(/_/g, " ")} Score`}
              value={vals.score}
              sub={(vals.top_issues || []).slice(0, 2).join("; ")}
              critical={vals.score < 60}
            />
          ))}
        </div>
        <Section title="Mitigation Status">
          <p>
            {typeof r.mitigation_status === "string"
              ? r.mitigation_status
              : r.mitigation_status?.summary ?? DASH}
          </p>
        </Section>
      </>
    );
  };

  const renderStrategic = () => {
    const s = detail || {};
    return (
      <>
        <Section title="Top Opportunities">
          <ul className="board-report-list">
            {(s.top_opportunities || []).map((opp, idx) => (
              <li key={idx}>{opp}</li>
            ))}
          </ul>
        </Section>
        <Section title="Investment Priorities">
          <ul className="board-report-list">
            {(s.investment_priorities || []).map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
        </Section>
        <Section title="Hiring Priorities">
          <ul className="board-report-list">
            {(s.hiring_priorities || []).map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
        </Section>
        <Section title="Technology Priorities">
          <ul className="board-report-list">
            {(s.technology_priorities || []).map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
        </Section>
        <Section title="New City Readiness">
          <ul className="board-report-list">
            {(s.new_city_readiness || []).map((city, idx) => (
              <li key={idx}>
                {city.name} — {city.ready ? "Ready" : "Not Ready"}: {city.demand_signal}
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderExport = () => (
    <Section title="One-Click Board Exports">
      <p className="beta__subtitle">
        Export reports as CSV, Excel, or PDF ({periodLabel}).
      </p>

      <div className="board-report-export-warning" role="note">
        <strong>Excel exports are not yet genuine files.</strong> The export helper falls back to CSV
        bytes when <code>openpyxl</code> is unavailable, and it is not installed, so an{" "}
        <strong>XLSX download is really CSV</strong> under an <code>.xlsx</code> name.{" "}
        <strong>CSV and PDF are both genuine files</strong> (PDF is produced by <code>reportlab</code>,
        which is installed). Reported to the backend team — installing <code>openpyxl</code> fixes it.
      </div>

      {exportNotice ? (
        <p className={exportNotice.ok ? "board-report-export-ok" : "beta__error"} role="status">
          {exportNotice.message}
        </p>
      ) : null}

      <div className="board-report-export-grid">
        {EXPORT_REPORTS.map((report) => (
          <div key={report.id} className="board-report-export-card">
            <h4>{report.label}</h4>
            <div className="board-report-export-actions">
              {EXPORT_FORMATS.map((fmt) => {
                const key = `${report.id}:${fmt}`;
                const busy = exporting === key;
                return (
                  <button
                    key={fmt}
                    type="button"
                    className="board-report-export-button"
                    onClick={() => handleExport(report.id, fmt)}
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy ? "Preparing…" : fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );

  const renderTab = () => {
    switch (tab) {
      case "executive":
        return renderExecutive();
      case "business-kpis":
        return renderBusinessKpis();
      case "financial":
        return renderFinancial();
      case "operational":
        return renderOperational();
      case "growth":
        return renderGrowth();
      case "risk":
        return renderRisk();
      case "strategic":
        return renderStrategic();
      case "export":
        return renderExport();
      default:
        return renderExecutive();
    }
  };

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">Board & Investor Reporting Suite</h1>
          <p className="beta__subtitle">
            Board-ready reports across executive, KPIs, financial, operational, growth, risk, and strategy.
          </p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading ? <p className="board-report-loading">Loading board reports…</p> : null}

      <div className="board-report-controls">
        <label htmlFor="period-select">Period:</label>
        <select
          id="period-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
        {PERIOD_AWARE_TABS.has(tab) ? null : (
          <span className="board-report-controls-note">
            This report is computed over a fixed window; the period selector does not affect it.
          </span>
        )}
      </div>

      <div className="board-report-tabs" role="tablist" aria-label="Report sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`board-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="board-report-content"
            className={`board-report-tab ${tab === item.id ? "board-report-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="board-report-content"
        id="board-report-content"
        role="tabpanel"
        aria-labelledby={`board-tab-${tab}`}
      >
        {renderTab()}
      </div>
    </div>
  );
}
