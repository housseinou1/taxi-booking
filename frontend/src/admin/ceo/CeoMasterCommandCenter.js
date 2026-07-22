import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  ceoMasterReportUrl,
  fetchCeoMasterAiInsights,
  fetchCeoMasterDashboard,
  fetchCeoMasterFinance,
  fetchCeoMasterFleet,
  fetchCeoMasterGrowth,
  fetchCeoMasterOperations,
  fetchCeoMasterReadiness,
  postCeoApproveIncentive,
  postCeoApproveOnboarding,
  postCeoApprovePayout,
  postCeoBroadcast,
  postCeoFreeze,
} from "./ceoMasterApi";
import "../beta/BetaDashboard.css";
import "./CeoMasterCommandCenter.css";

const TABS = [
  { id: "overview", label: "Executive Overview" },
  { id: "finance", label: "Financial Overview" },
  { id: "operations", label: "Operations" },
  { id: "growth", label: "Growth" },
  { id: "fleet", label: "Fleet" },
  { id: "ai", label: "AI Insights" },
  { id: "readiness", label: "Launch Readiness" },
  { id: "reports", label: "Executive Reports" },
  { id: "actions", label: "Executive Actions" },
];

const REPORT_TYPES = ["daily", "weekly", "monthly", "quarterly", "annual"];

function MetricCard({ label, value, sub, critical = false }) {
  return (
    <div className={`beta__card ${critical ? "ceo-master-critical" : ""}`}>
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="ceo-master-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function CeoMasterCommandCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    message: "",
    segment: "all",
  });
  const [freezeReason, setFreezeReason] = useState("");
  const [actionForm, setActionForm] = useState({
    entity_type: "merchant",
    entity_id: "",
    note: "",
    payment_id: "",
    campaign_id: "",
  });

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchCeoMasterDashboard();
      setData(dashboard);

      if (tab === "finance") setDetail(await fetchCeoMasterFinance());
      if (tab === "operations") setDetail(await fetchCeoMasterOperations());
      if (tab === "growth") setDetail(await fetchCeoMasterGrowth());
      if (tab === "fleet") setDetail(await fetchCeoMasterFleet());
      if (tab === "ai") setDetail(await fetchCeoMasterAiInsights());
      if (tab === "readiness") setDetail(await fetchCeoMasterReadiness());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load CEO Master Command Center");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBroadcast = async (e) => {
    e.preventDefault();
    try {
      const result = await postCeoBroadcast(broadcastForm);
      setMessage(`Broadcast sent to ${result.segment}: ${result.sent} recipients`);
      setBroadcastForm({ title: "", message: "", segment: "all" });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleFreeze = async (enabled) => {
    try {
      const result = await postCeoFreeze({ enabled, reason: freezeReason || "CEO emergency freeze" });
      setMessage(`Platform freeze set to ${result.maintenance_mode}`);
      setFreezeReason("");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleApproveOnboarding = async (e) => {
    e.preventDefault();
    try {
      const result = await postCeoApproveOnboarding({
        entity_type: actionForm.entity_type,
        entity_id: Number(actionForm.entity_id),
        note: actionForm.note,
      });
      setMessage(`Approved ${result.entity_type} #${result.entity_id}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleApprovePayout = async (e) => {
    e.preventDefault();
    try {
      const result = await postCeoApprovePayout({
        payment_id: Number(actionForm.payment_id),
        note: actionForm.note,
      });
      setMessage(`Approved payout #${result.id} — ${formatMoney(result.amount)}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleApproveIncentive = async (e) => {
    e.preventDefault();
    try {
      const result = await postCeoApproveIncentive({
        campaign_id: Number(actionForm.campaign_id),
        note: actionForm.note,
      });
      setMessage(`Activated incentive campaign: ${result.name}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const overview = data?.executive_overview || {};

  const renderOverview = () => (
    <>
      <div className="ceo-master-grid">
        <MetricCard label="Revenue Today" value={formatMoney(overview.total_revenue_today)} />
        <MetricCard label="Revenue This Week" value={formatMoney(overview.total_revenue_week)} />
        <MetricCard label="Revenue This Month" value={formatMoney(overview.total_revenue_month)} />
        <MetricCard label="Active Riders" value={overview.active_riders} />
        <MetricCard label="Active Drivers" value={overview.active_drivers} />
        <MetricCard label="Active Couriers" value={overview.active_couriers} />
        <MetricCard label="Active Merchants" value={overview.active_merchants} />
        <MetricCard label="Completed Rides Today" value={overview.completed_rides_today} />
        <MetricCard label="Completed Deliveries Today" value={overview.completed_deliveries_today} />
        <MetricCard label="Cancellation Rate" value={`${overview.cancellation_rate_pct}%`} />
        <MetricCard label="Driver Acceptance Rate" value={`${overview.driver_acceptance_rate_pct}%`} />
        <MetricCard label="Customer Satisfaction" value={overview.customer_satisfaction} />
        <MetricCard
          label="Platform Health Score"
          value={overview.platform_health_score}
          critical={overview.platform_health_score < 70}
        />
      </div>
      {data?.readiness && (
        <Section title="Launch Readiness Snapshot">
          <p>
            <strong>Overall Launch Score:</strong> {data.readiness.overall_launch_score}/100
          </p>
          <div className="ceo-master-grid" style={{ marginTop: "1rem" }}>
            {Object.entries(data.readiness.statuses || {}).map(([key, status]) => (
              <MetricCard
                key={key}
                label={key.replace(/_/g, " ")}
                value={status.ready ? "Ready" : "Pending"}
                critical={!status.ready}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );

  const renderFinance = () => {
    const f = detail || {};
    const cashFlow = f.cash_flow || {};
    return (
      <>
        <div className="ceo-master-grid">
          <MetricCard label="Wallet Balance" value={formatMoney(f.wallet_balance)} />
          <MetricCard label="Pending Withdrawals" value={formatMoney(f.pending_withdrawals?.amount)} sub={`${f.pending_withdrawals?.count} requests`} critical />
          <MetricCard label="Completed Withdrawals" value={formatMoney(f.completed_withdrawals?.amount)} sub={`${f.completed_withdrawals?.count} processed`} />
          <MetricCard label="Merchant Settlements" value={formatMoney(f.merchant_settlements_pending)} />
          <MetricCard label="Partner Settlements" value={formatMoney(f.partner_settlements_pending)} />
          <MetricCard label="Daily Profit" value={formatMoney(f.daily_profit)} />
          <MetricCard label="Monthly Profit" value={formatMoney(f.monthly_profit)} />
          <MetricCard label="Outstanding Refunds" value={formatMoney(f.outstanding_refunds?.amount)} sub={`${f.outstanding_refunds?.count} requests`} critical />
        </div>
        <Section title="Cash Flow">
          <div className="ceo-master-grid">
            <MetricCard label="Today In" value={formatMoney(cashFlow.today_in)} />
            <MetricCard label="Today Out" value={formatMoney(cashFlow.today_out)} />
            <MetricCard label="Month In" value={formatMoney(cashFlow.month_in)} />
            <MetricCard label="Month Out" value={formatMoney(cashFlow.month_out)} />
          </div>
        </Section>
      </>
    );
  };

  const renderOperations = () => {
    const o = detail || {};
    return (
      <>
        <div className="ceo-master-grid">
          <MetricCard label="Open Incidents" value={o.open_incidents} critical={o.open_incidents > 0} />
          <MetricCard label="Emergency Cases" value={o.emergency_cases} critical={o.emergency_cases > 0} />
          <MetricCard label="SOS Events (24h)" value={o.sos_events_24h} critical={o.sos_events_24h > 0} />
          <MetricCard label="Support Queue" value={o.support_queue} />
          <MetricCard label="Driver Verification Queue" value={o.driver_verification_queue} />
          <MetricCard label="Merchant Approval Queue" value={o.merchant_approval_queue} />
          <MetricCard label="Courier Approval Queue" value={o.courier_approval_queue} />
          <MetricCard label="Partner Approval Queue" value={o.partner_approval_queue} />
        </div>
      </>
    );
  };

  const renderGrowth = () => {
    const g = detail || {};
    return (
      <>
        <div className="ceo-master-grid">
          <MetricCard label="New Riders (7d)" value={g.new_riders_week} />
          <MetricCard label="New Drivers (7d)" value={g.new_drivers_week} />
          <MetricCard label="New Merchants (7d)" value={g.new_merchants_week} />
          <MetricCard label="Rider Referrals (7d)" value={g.referral_growth?.rider_referrals_week} />
          <MetricCard label="Driver Referrals (7d)" value={g.referral_growth?.driver_referrals_week} />
          <MetricCard label="Retention Rate" value={`${g.retention_rate_pct}%`} />
        </div>
        <Section title="Marketing Campaign Performance">
          <ul className="ceo-master-list">
            {Object.entries(g.marketing_campaign_performance || {}).length ? (
              Object.entries(g.marketing_campaign_performance).map(([key, val]) => (
                <li key={key}>
                  <strong>{key.replace(/_/g, " ")}:</strong> {typeof val === "object" ? JSON.stringify(val) : String(val)}
                </li>
              ))
            ) : (
              <li>No active campaign data</li>
            )}
          </ul>
        </Section>
        <Section title="Top Cities">
          <ul className="ceo-master-list">
            {(g.top_cities || []).map((city) => (
              <li key={city.city_id}>
                {city.name} — {city.completed_rides} rides
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Expansion Opportunities">
          <ul className="ceo-master-list">
            {(g.expansion_opportunities || []).map((opp, idx) => (
              <li key={idx}>
                {opp.label || opp.city_id} — {opp.suggested_action}
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderFleet = () => {
    const f = detail || {};
    const supply = f.supply_demand || {};
    return (
      <>
        <div className="ceo-master-grid">
          <MetricCard label="Drivers Online" value={f.drivers_online} />
          <MetricCard label="Drivers Offline" value={f.drivers_offline} />
          <MetricCard label="Fleet Utilization" value={`${f.fleet_utilization_pct}%`} />
          <MetricCard label="Average Wait Time" value={`${f.average_wait_time_minutes} min`} critical={f.average_wait_time_minutes > 10} />
          <MetricCard label="Waiting Riders" value={supply.waiting_riders} />
          <MetricCard label="Driver Density" value={supply.driver_density} />
        </div>
        <Section title="Peak Demand Areas">
          <ul className="ceo-master-list">
            {(f.peak_demand_areas || []).slice(0, 10).map((area, idx) => (
              <li key={idx}>
                {area.label || area.name || `Area ${idx + 1}`} — demand: {area.demand ?? area.weight ?? "—"}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Supply vs Demand">
          <ul className="ceo-master-list">
            {(supply.shortage_areas || []).map((area, idx) => (
              <li key={`short-${idx}`}>Shortage: {area.label || JSON.stringify(area)}</li>
            ))}
            {(supply.long_eta_areas || []).map((area, idx) => (
              <li key={`eta-${idx}`}>Long ETA: {area.label || JSON.stringify(area)}</li>
            ))}
          </ul>
        </Section>
        <Section title="Vehicle Categories">
          <ul className="ceo-master-list">
            {(f.vehicle_categories || []).map((v) => (
              <li key={v.vehicle_type}>
                {v.vehicle_type}: {v.count}
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderAi = () => {
    const a = detail || {};
    return (
      <>
        <Section title="Biggest Operational Issue">
          {a.biggest_operational_issue ? (
            <div className="ceo-master-alert">
              <strong>{a.biggest_operational_issue.message}</strong>
              <p>Severity: {a.biggest_operational_issue.severity}</p>
            </div>
          ) : (
            <p>No high-severity issues detected.</p>
          )}
        </Section>
        <Section title="Forecasts">
          <div className="ceo-master-grid">
            <MetricCard label="Fastest Growing Area" value={a.fastest_growing_area} />
            <MetricCard label="Daily Revenue Forecast" value={formatMoney(a.revenue_forecast?.daily)} />
            <MetricCard label="Weekly Revenue Forecast" value={formatMoney(a.revenue_forecast?.weekly)} />
            <MetricCard label="Monthly Revenue Forecast" value={formatMoney(a.revenue_forecast?.monthly)} />
          </div>
        </Section>
        <Section title="Fraud Alerts">
          <ul className="ceo-master-list">
            {(a.fraud_alerts || []).length ? (
              a.fraud_alerts.map((alert, idx) => (
                <li key={idx}>{alert.message || JSON.stringify(alert)}</li>
              ))
            ) : (
              <li>No fraud alerts</li>
            )}
          </ul>
        </Section>
        <Section title="Performance Recommendations">
          <ul className="ceo-master-list">
            {(a.performance_recommendations || []).map((rec, idx) => (
              <li key={idx}>{rec.message || JSON.stringify(rec)}</li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderReadiness = () => {
    const r = detail || {};
    return (
      <>
        <div className="ceo-master-score">
          <h2>Overall Launch Score: {r.overall_launch_score}/100</h2>
        </div>
        <div className="ceo-master-grid">
          {Object.entries(r.statuses || {}).map(([key, status]) => (
            <MetricCard
              key={key}
              label={key.replace(/_/g, " ")}
              value={status.ready ? "Ready" : "Pending"}
              sub={`Weight ${status.weight}`}
              critical={!status.ready}
            />
          ))}
        </div>
        <Section title="Notes">
          <ul className="ceo-master-list">
            {Object.entries(r.notes || {}).map(([key, note]) => (
              <li key={key}>
                <strong>{key.replace(/_/g, " ")}:</strong> {note}
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderReports = () => (
    <Section title="One-Click Export">
      <p className="beta__subtitle">Download CEO reports as CSV for board and investor review.</p>
      <div className="ceo-master-actions">
        {REPORT_TYPES.map((type) => (
          <a
            key={type}
            href={ceoMasterReportUrl(type)}
            className="ceo-master-button"
            download
          >
            {type === "daily" && "Daily CEO Report"}
            {type === "weekly" && "Weekly Executive Report"}
            {type === "monthly" && "Monthly Board Report"}
            {type === "quarterly" && "Quarterly Business Report"}
            {type === "annual" && "Annual Report"}
          </a>
        ))}
      </div>
    </Section>
  );

  const renderActions = () => (
    <>
      <Section title="Broadcast Announcement">
        <form onSubmit={handleBroadcast} className="ceo-master-form">
          <input
            type="text"
            placeholder="Title"
            value={broadcastForm.title}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Message"
            value={broadcastForm.message}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
            required
          />
          <select
            value={broadcastForm.segment}
            onChange={(e) => setBroadcastForm({ ...broadcastForm, segment: e.target.value })}
          >
            <option value="all">All Users</option>
            <option value="riders">Riders</option>
            <option value="drivers">Drivers</option>
            <option value="couriers">Couriers</option>
            <option value="staff">Staff</option>
          </select>
          <button type="submit">Send Broadcast</button>
        </form>
      </Section>

      <Section title="Platform Freeze">
        <div className="ceo-master-form">
          <input
            type="text"
            placeholder="Reason for freeze"
            value={freezeReason}
            onChange={(e) => setFreezeReason(e.target.value)}
          />
          <div className="ceo-master-actions">
            <button type="button" onClick={() => handleFreeze(true)} className="danger">
              Freeze Platform
            </button>
            <button type="button" onClick={() => handleFreeze(false)}>
              Unfreeze Platform
            </button>
          </div>
        </div>
      </Section>

      <Section title="Approve Onboarding">
        <form onSubmit={handleApproveOnboarding} className="ceo-master-form">
          <select
            value={actionForm.entity_type}
            onChange={(e) => setActionForm({ ...actionForm, entity_type: e.target.value })}
          >
            <option value="merchant">Merchant</option>
            <option value="partner">Partner</option>
            <option value="driver">Driver</option>
            <option value="courier">Courier</option>
          </select>
          <input
            type="number"
            placeholder="Entity ID"
            value={actionForm.entity_id}
            onChange={(e) => setActionForm({ ...actionForm, entity_id: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Note"
            value={actionForm.note}
            onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
          />
          <button type="submit">Approve</button>
        </form>
      </Section>

      <Section title="Approve Payout">
        <form onSubmit={handleApprovePayout} className="ceo-master-form">
          <input
            type="number"
            placeholder="Payment ID"
            value={actionForm.payment_id}
            onChange={(e) => setActionForm({ ...actionForm, payment_id: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Note"
            value={actionForm.note}
            onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
          />
          <button type="submit">Approve Payout</button>
        </form>
      </Section>

      <Section title="Approve Major Incentive">
        <form onSubmit={handleApproveIncentive} className="ceo-master-form">
          <input
            type="number"
            placeholder="Campaign ID"
            value={actionForm.campaign_id}
            onChange={(e) => setActionForm({ ...actionForm, campaign_id: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Note"
            value={actionForm.note}
            onChange={(e) => setActionForm({ ...actionForm, note: e.target.value })}
          />
          <button type="submit">Activate Campaign</button>
        </form>
      </Section>
    </>
  );

  const renderTab = () => {
    switch (tab) {
      case "overview":
        return renderOverview();
      case "finance":
        return renderFinance();
      case "operations":
        return renderOperations();
      case "growth":
        return renderGrowth();
      case "fleet":
        return renderFleet();
      case "ai":
        return renderAi();
      case "readiness":
        return renderReadiness();
      case "reports":
        return renderReports();
      case "actions":
        return renderActions();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">CEO Master Command Center</h1>
          <p className="beta__subtitle">
            Unified executive view across revenue, operations, growth, fleet, AI insights, readiness, and actions.
          </p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {message ? <p className="beta__success">{message}</p> : null}
      {loading && !data ? <p>Loading CEO Master Command Center…</p> : null}

      <div className="ceo-master-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ceo-master-tab ${tab === item.id ? "ceo-master-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ceo-master-content">{renderTab()}</div>
    </div>
  );
}
