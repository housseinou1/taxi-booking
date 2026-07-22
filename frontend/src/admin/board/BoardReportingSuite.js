import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  boardReportExportUrl,
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
const EXPORT_FORMATS = ["csv", "excel", "pdf", "presentation"];
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

function MetricCard({ label, value, sub, critical = false }) {
  return (
    <div className={`beta__card ${critical ? "board-report-critical" : ""}`}>
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "ù"}</div>
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

export default function BoardReportingSuite() {
  const [tab, setTab] = useState("executive");
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const suite = await fetchBoardReportingSuite({ period });
      setData(suite);

      if (tab === "executive") setDetail(await fetchBoardExecutiveSummary({ period }));
      if (tab === "business-kpis") setDetail(await fetchBoardBusinessKpis());
      if (tab === "financial") setDetail(await fetchBoardFinancialReport({ period }));
      if (tab === "operational") setDetail(await fetchBoardOperationalReport());
      if (tab === "growth") setDetail(await fetchBoardGrowthReport());
      if (tab === "risk") setDetail(await fetchBoardRiskDashboard());
      if (tab === "strategic") setDetail(await fetchBoardStrategicPlanning());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load board reports");
    } finally {
      setLoading(false);
    }
  }, [tab, period]);

  useEffect(() => {
    load();
  }, [load]);

  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);

  const renderExecutive = () => {
    const s = detail || {};
    return (
      <>
        <p className="beta__subtitle">{periodLabel} Executive Summary</p>
        <div className="board-report-grid">
          <MetricCard label="GMV" value={formatMoney(s.gmv_mru)} sub={s.period} />
          <MetricCard label="Completed Rides" value={s.completed_rides} />
          <MetricCard label="Completed Deliveries" value={s.completed_deliveries} />
          <MetricCard label="Cancellation Rate" value={`${s.cancellation_rate_pct}%`} />
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
        <MetricCard label="Revenue" value={formatMoney(k.revenue_mru)} />
        <MetricCard label="GMV" value={formatMoney(k.gmv_mru)} />
        <MetricCard label="Completed Rides" value={k.completed_rides} />
        <MetricCard label="Completed Deliveries" value={k.completed_deliveries} />
        <MetricCard label="Merchant Sales" value={formatMoney(k.merchant_sales_mru)} />
        <MetricCard label="Active Riders" value={k.active_riders} />
        <MetricCard label="Active Drivers" value={k.active_drivers} />
        <MetricCard label="Active Couriers" value={k.active_couriers} />
        <MetricCard label="Driver Retention" value={`${k.driver_retention_pct}%`} />
        <MetricCard label="Customer Retention" value={`${k.customer_retention_pct}%`} />
        <MetricCard label="Avg Order Value" value={formatMoney(k.average_order_value_mru)} />
        <MetricCard label="Avg Ride Fare" value={formatMoney(k.average_ride_fare_mru)} />
        <MetricCard label="Revenue Growth" value={`${k.revenue_growth_pct}%`} />
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
          <MetricCard label="Gross Revenue" value={formatMoney(income.gross_revenue_mru)} />
          <MetricCard label="Platform Commission" value={formatMoney(income.platform_commission_mru)} />
          <MetricCard label="Merchant Commission" value={formatMoney(income.merchant_commission_mru)} />
          <MetricCard label="Partner Revenue Share" value={formatMoney(income.partner_revenue_share_mru)} />
          <MetricCard label="Operating Expenses" value={formatMoney(f.operating_expenses_mru)} />
          <MetricCard label="Net Operating Income" value={formatMoney(f.net_operating_income_mru)} />
          <MetricCard label="Wallet Balance" value={formatMoney(f.wallet_balance_mru)} />
          <MetricCard label="Outstanding Liabilities" value={formatMoney(f.outstanding_liabilities_mru)} />
          <MetricCard label="Outstanding Refunds" value={formatMoney(f.refund_summary?.amount_mru)} sub={`${f.refund_summary?.count ?? 0} requests`} critical />
        </div>
        <Section title="Cash Flow Summary">
          <div className="board-report-grid">
            <MetricCard label="Cash In" value={formatMoney(cashFlow.cash_in_mru)} />
            <MetricCard label="Cash Out" value={formatMoney(cashFlow.cash_out_mru)} />
            <MetricCard label="Net Cash Flow" value={formatMoney(cashFlow.net_cash_flow_mru)} />
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
          <MetricCard label="Platform Uptime" value={`${o.platform_uptime_pct}%`} />
        </div>
        <Section title="Safety Metrics">
          <div className="board-report-grid">
            <MetricCard label="Safety Score" value={o.safety_metrics?.safety_score} />
            <MetricCard label="Open Safety Incidents" value={o.safety_metrics?.open_incidents} critical={(o.safety_metrics?.open_incidents || 0) > 0} />
            <MetricCard label="Emergency Alerts (24h)" value={o.safety_metrics?.emergency_alerts_24h} />
            <MetricCard label="Avg Resolution (hrs)" value={o.safety_metrics?.avg_resolution_hours ?? "ù"} />
          </div>
        </Section>
        <Section title="Support Metrics">
          <pre className="board-report-pre">{JSON.stringify(o.support_metrics || {}, null, 2)}</pre>
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
          <pre className="board-report-pre">{JSON.stringify(g.marketing_campaign_results || {}, null, 2)}</pre>
        </Section>
        <Section title="Top Cities">
          <ul className="board-report-list">
            {(g.city_growth || []).map((c) => (
              <li key={c.id || c.city_id}>
                {c.name} ù {c.completed_rides} rides
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
          <h2>Overall Risk Score: {r.overall_risk_score}/100</h2>
          <p>Risk Level: <strong>{r.risk_level}</strong></p>
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
          <p>{typeof r.mitigation_status === "string" ? r.mitigation_status : r.mitigation_status?.summary}</p>
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
                {city.name} ù {city.ready ? "Ready" : "Not Ready"}: {city.demand_signal}
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderExport = () => (
    <Section title="One-Click Board Exports">
      <p className="beta__subtitle">Export reports as CSV, Excel, PDF, or Executive Presentation ({periodLabel}).</p>
      <div className="board-report-export-grid">
        {EXPORT_REPORTS.map((report) => (
          <div key={report.id} className="board-report-export-card">
            <h4>{report.label}</h4>
            <div className="board-report-export-actions">
              {EXPORT_FORMATS.map((fmt) => (
                <a
                  key={fmt}
                  href={boardReportExportUrl(report.id, fmt, { period })}
                  className="board-report-export-button"
                  download
                >
                  {fmt === "presentation" ? "Presentation" : fmt.toUpperCase()}
                </a>
              ))}
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
      {loading && !data ? <p>Loading board reportsÖ</p> : null}

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
      </div>

      <div className="board-report-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`board-report-tab ${tab === item.id ? "board-report-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="board-report-content">{renderTab()}</div>
    </div>
  );
}
