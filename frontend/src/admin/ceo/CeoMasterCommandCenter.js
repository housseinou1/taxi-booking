import React, { useEffect, useRef, useState } from "react";

import { formatMoneyOrDash } from "../components/library/utils/formatters";
import { fetchExecutiveMetrics } from "./executiveMetricsApi";
import {
  ceoMasterReportUrl,
  fetchCeoMasterAiInsights,
  fetchCeoMasterFinance,
  fetchCeoMasterFleet,
  fetchCeoMasterGrowth,
  fetchCeoMasterOperations,
  fetchCeoMasterOverview,
  fetchCeoMasterReadiness,
  postCeoApproveIncentive,
  postCeoApproveOnboarding,
  postCeoApprovePayout,
  postCeoBroadcast,
  postCeoFreeze,
} from "./ceoMasterApi";
import { EmptyState, Section } from "../../design-system/components";
import "./CeoMasterCommandCenter.css";

const TABS = [
  { id: "overview", label: "Executive Overview", icon: "📊" },
  { id: "finance", label: "Financial Overview", icon: "💰" },
  { id: "operations", label: "Operations", icon: "⚙️" },
  { id: "growth", label: "Growth", icon: "📈" },
  { id: "fleet", label: "Fleet", icon: "🚗" },
  { id: "ai", label: "AI Insights", icon: "🤖" },
  { id: "readiness", label: "Launch Readiness", icon: "✅" },
  { id: "reports", label: "Executive Reports", icon: "📋" },
  { id: "actions", label: "Executive Actions", icon: "⚡" },
];

const REPORT_TYPES = ["daily", "weekly", "monthly", "quarterly", "annual"];

// Tabs backed by their own section endpoint. Overview, Reports and Actions need no detail fetch.
const TAB_DETAIL_LOADERS = {
  finance: fetchCeoMasterFinance,
  operations: fetchCeoMasterOperations,
  growth: fetchCeoMasterGrowth,
  fleet: fetchCeoMasterFleet,
  ai: fetchCeoMasterAiInsights,
  readiness: fetchCeoMasterReadiness,
};

function KPICard({ label, value, sub, critical = false, loading }) {
  if (loading) {
    return (
      <div className={`ceo-master-card ${critical ? "ceo-master-card--critical" : ""}`}>
        <div className="ceo-master-card-skeleton" />
      </div>
    );
  }
  return (
    <div className={`ceo-master-card ${critical ? "ceo-master-card--critical" : ""}`}>
      <div className="ceo-master-card-label">{label}</div>
      <div className="ceo-master-card-value">{value ?? "—"}</div>
      {sub ? <div className="ceo-master-card-sub">{sub}</div> : null}
    </div>
  );
}

export default function CeoMasterCommandCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [detail, setDetail] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const detailRequestSeq = useRef(0);
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

  // Performance: the overview tab only renders executive_overview + readiness, so it loads those
  // two sections (plus canonical metrics) in parallel instead of the full /ceo-master/ payload,
  // which builds all seven sections server-side. It loads once on mount, not on every tab switch,
  // so clicking through tabs no longer stacks concurrent full-dashboard requests on the backend.
  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    Promise.all([
      fetchCeoMasterOverview(),
      fetchCeoMasterReadiness(),
      // Canonical executive metrics — the single authoritative KPI source.
      fetchExecutiveMetrics({ period: "last_30_days" }).catch(() => null),
    ])
      .then(([executiveOverview, readinessStatus, executiveMetrics]) => {
        if (cancelled) return;
        setData({ executive_overview: executiveOverview, readiness: readinessStatus });
        setMetrics(executiveMetrics);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.detail || err?.message || "Failed to load CEO Master Command Center");
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tab detail: only the active tab's endpoint is requested. Responses from a tab the user has
  // already left are discarded so a slow earlier request cannot overwrite the current tab.
  useEffect(() => {
    const loader = TAB_DETAIL_LOADERS[tab];
    const seq = ++detailRequestSeq.current;
    setError("");
    setMessage("");
    setDetail(null);
    if (!loader) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    loader()
      .then((result) => {
        if (seq === detailRequestSeq.current) setDetail(result);
      })
      .catch((err) => {
        if (seq === detailRequestSeq.current) {
          setError(err?.response?.data?.detail || err?.message || "Failed to load CEO Master Command Center");
        }
      })
      .finally(() => {
        if (seq === detailRequestSeq.current) setDetailLoading(false);
      });
  }, [tab]);

  const loading = tab === "overview" ? overviewLoading : detailLoading;

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
      setMessage(`Approved payout #${result.id} — ${formatMoneyOrDash(result.amount)}`);
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
  const readiness = data?.readiness || {};

  const renderOverview = () => {
    const isMetricsAvailable = !!metrics;
    const fleet = metrics?.fleet || {};
    const activity = metrics?.activity || {};
    const money = metrics?.money || {};

    return (
      <>
        {/* Executive Overview Cards */}
        <Section title="Executive Overview">
          <div className="ceo-master-grid">
            <KPICard label="Revenue Today" value={formatMoneyOrDash(overview.total_revenue_today)} loading={loading} />
            <KPICard label="Revenue This Week" value={formatMoneyOrDash(overview.total_revenue_week)} loading={loading} />
            <KPICard label="Revenue This Month" value={formatMoneyOrDash(overview.total_revenue_month)} loading={loading} />
            <KPICard
              label="Total Riders"
              value={metrics?.riders?.total ?? overview.active_riders}
              loading={loading}
            />
            <KPICard
              label="Total Drivers"
              value={fleet?.total_drivers ?? overview.active_drivers}
              loading={loading}
            />
            <KPICard
              label="Total Couriers"
              value={fleet?.total_couriers ?? overview.active_couriers}
              loading={loading}
            />
            <KPICard
              label="Active Drivers Online"
              value={fleet?.online_drivers}
              loading={loading}
            />
            <KPICard
              label="Active Couriers Online"
              value={fleet?.online_couriers}
              loading={loading}
            />
            <KPICard
              label="Active Merchants"
              value={overview.active_merchants}
              loading={loading}
            />
            <KPICard
              label="Completed Rides Today"
              value={activity?.completed_rides ?? overview.completed_rides_today}
              loading={loading}
            />
            <KPICard
              label="Completed Deliveries Today"
              value={activity?.completed_deliveries ?? overview.completed_deliveries_today}
              loading={loading}
            />
            <KPICard
              label="Cancellation Rate"
              value={overview.cancellation_rate_pct ? `${overview.cancellation_rate_pct}%` : "—"}
              loading={loading}
            />
          </div>
        </Section>

        {/* Launch Readiness */}
        {readiness && Object.keys(readiness.statuses || {}).length > 0 && (
          <Section title="Launch Readiness Snapshot">
            <div className="ceo-master-score">
              <h3>Overall Launch Score: {readiness.overall_launch_score || 0}/100</h3>
            </div>
            <div className="ceo-master-grid">
              {Object.entries(readiness.statuses || {}).map(([key, status]) => (
                <KPICard
                  key={key}
                  label={key.replace(/_/g, " ")}
                  value={status.ready ? "Ready" : "Pending"}
                  critical={!status.ready}
                  loading={loading}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Canonical Executive Metrics */}
        {isMetricsAvailable && (
          <Section title={`Canonical Executive Metrics — ${metrics.period?.label || "Last 30 Days"}`}>
            <p className="ceo-master-note">
              Authoritative platform figures. Drivers and couriers are counted separately and are
              never added together.
            </p>
            <div className="ceo-master-grid">
              <KPICard
                label="Gross Transaction Value"
                value={formatMoneyOrDash(money?.gross_transaction_value)}
                loading={loading}
              />
              <KPICard
                label="Platform Revenue (Settled)"
                value={formatMoneyOrDash(money?.platform_revenue)}
                sub="From settled payment ledger"
                loading={loading}
              />
              <KPICard
                label="Completed Rides"
                value={activity?.completed_rides}
                loading={loading}
              />
              <KPICard
                label="Completed Deliveries"
                value={activity?.completed_deliveries}
                loading={loading}
              />
              <KPICard
                label="Cancellations"
                value={activity?.cancellations}
                loading={loading}
              />
              <KPICard
                label="Wallet Liabilities"
                value={formatMoneyOrDash(metrics?.liabilities?.wallet_liabilities?.value)}
                sub="Not revenue"
                loading={loading}
              />
              <KPICard
                label="Wallet Pending Balance"
                value={formatMoneyOrDash(metrics?.liabilities?.wallet_pending_balance?.value)}
                sub="Not revenue"
                loading={loading}
              />
              <KPICard
                label="Merchant Payables"
                value={formatMoneyOrDash(metrics?.liabilities?.merchant_payables?.value)}
                sub="Not revenue"
                loading={loading}
              />
            </div>
          </Section>
        )}
      </>
    );
  };

  const renderFinance = () => {
    const f = detail || {};
    const cashFlow = f.cash_flow || {};
    const hasData = Object.keys(f).length > 0;

    if (!hasData) {
      return <EmptyState text="Financial data unavailable for the selected period." />;
    }

    return (
      <>
        <Section title="Financial Snapshot">
          <div className="ceo-master-grid">
            <KPICard
              label="Wallet Balance"
              value={formatMoneyOrDash(f.wallet_balance)}
              loading={loading}
            />
            <KPICard
              label="Pending Withdrawals"
              value={formatMoneyOrDash(f.pending_withdrawals?.amount)}
              sub={`${f.pending_withdrawals?.count} requests`}
              critical={f.pending_withdrawals?.count > 0}
              loading={loading}
            />
            <KPICard
              label="Completed Withdrawals"
              value={formatMoneyOrDash(f.completed_withdrawals?.amount)}
              sub={`${f.completed_withdrawals?.count} processed`}
              loading={loading}
            />
            <KPICard
              label="Merchant Settlements"
              value={formatMoneyOrDash(f.merchant_settlements_pending)}
              loading={loading}
            />
            <KPICard
              label="Partner Settlements"
              value={formatMoneyOrDash(f.partner_settlements_pending)}
              loading={loading}
            />
            <KPICard
              label="Outstanding Refunds"
              value={formatMoneyOrDash(f.outstanding_refunds?.amount)}
              sub={`${f.outstanding_refunds?.count} requests`}
              critical={f.outstanding_refunds?.count > 0}
              loading={loading}
            />
          </div>
        </Section>

        <Section title="Cash Flow">
          <div className="ceo-master-grid">
            <KPICard label="Today In" value={formatMoneyOrDash(cashFlow.today_in)} loading={loading} />
            <KPICard label="Today Out" value={formatMoneyOrDash(cashFlow.today_out)} loading={loading} />
            <KPICard label="Month In" value={formatMoneyOrDash(cashFlow.month_in)} loading={loading} />
            <KPICard label="Month Out" value={formatMoneyOrDash(cashFlow.month_out)} loading={loading} />
          </div>
        </Section>
      </>
    );
  };

  const renderOperations = () => {
    const o = detail || {};
    const hasData = Object.keys(o).length > 0;

    if (!hasData) {
      return <EmptyState text="Operations data unavailable for the selected period." />;
    }

    const hasIssues = o.open_incidents > 0 || o.emergency_cases > 0 || o.sos_events_24h > 0;

    return (
      <>
        <Section title="Operations Snapshot">
          <div className="ceo-master-grid">
            <KPICard
              label="Open Incidents"
              value={o.open_incidents}
              critical={o.open_incidents > 0}
              loading={loading}
            />
            <KPICard
              label="Emergency Cases"
              value={o.emergency_cases}
              critical={o.emergency_cases > 0}
              loading={loading}
            />
            <KPICard
              label="SOS Events (24h)"
              value={o.sos_events_24h}
              critical={o.sos_events_24h > 0}
              loading={loading}
            />
            <KPICard
              label="Support Queue"
              value={o.support_queue}
              loading={loading}
            />
            <KPICard
              label="Driver Verification Queue"
              value={o.driver_verification_queue}
              loading={loading}
            />
            <KPICard
              label="Merchant Approval Queue"
              value={o.merchant_approval_queue}
              loading={loading}
            />
            <KPICard
              label="Courier Approval Queue"
              value={o.courier_approval_queue}
              loading={loading}
            />
            <KPICard
              label="Partner Approval Queue"
              value={o.partner_approval_queue}
              loading={loading}
            />
          </div>
        </Section>

        {hasIssues && (
          <Section title="Operational Alerts">
            <div className="ceo-master-alert">
              <p>
                <strong>Active operational issues detected.</strong> Please review the metrics above
                and take appropriate action.
              </p>
            </div>
          </Section>
        )}
      </>
    );
  };

  const renderGrowth = () => {
    const g = detail || {};
    const hasData = g.new_riders_week || g.new_drivers_week || g.new_merchants_week;

    if (!hasData) {
      return <EmptyState text="Growth data unavailable for the selected period." />;
    }

    return (
      <>
        <Section title="Growth Metrics (7 Days)">
          <div className="ceo-master-grid">
            <KPICard label="New Riders" value={g.new_riders_week} loading={loading} />
            <KPICard label="New Drivers" value={g.new_drivers_week} loading={loading} />
            <KPICard label="New Merchants" value={g.new_merchants_week} loading={loading} />
            <KPICard
              label="Rider Referrals"
              value={g.referral_growth?.rider_referrals_week}
              loading={loading}
            />
            <KPICard
              label="Driver Referrals"
              value={g.referral_growth?.driver_referrals_week}
              loading={loading}
            />
            <KPICard
              label="Retention Rate"
              value={g.retention_rate_pct ? `${g.retention_rate_pct}%` : "—"}
              loading={loading}
            />
          </div>
        </Section>

        {g.top_cities && g.top_cities.length > 0 && (
          <Section title="Top Performing Cities">
            <ul className="ceo-master-list">
              {g.top_cities.slice(0, 10).map((city) => (
                <li key={`city-${city.city_id}`}>
                  <strong>{city.name || `City ${city.city_id}`}</strong> — {city.completed_rides} rides
                </li>
              ))}
            </ul>
          </Section>
        )}

        {g.expansion_opportunities && g.expansion_opportunities.length > 0 && (
          <Section title="Expansion Opportunities">
            <ul className="ceo-master-list">
              {g.expansion_opportunities.slice(0, 10).map((opp, idx) => (
                // Opportunities are either a city (city_id) or a demand zone (lat/lng); neither has an id.
                <li key={opp.city_id != null ? `city-${opp.city_id}` : `zone-${opp.lat},${opp.lng}-${idx}`}>
                  <strong>{opp.label || `Opportunity ${idx + 1}`}</strong>: {opp.suggested_action}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </>
    );
  };

  const renderFleet = () => {
    const f = detail || {};
    const supply = f.supply_demand || {};
    const hasData = f.drivers_online || f.drivers_offline;

    if (!hasData) {
      return <EmptyState text="Fleet data unavailable for the selected period." />;
    }

    return (
      <>
        <Section title="Fleet Overview">
          <div className="ceo-master-grid">
            <KPICard label="Drivers Online" value={f.drivers_online} loading={loading} />
            <KPICard label="Drivers Offline" value={f.drivers_offline} loading={loading} />
            <KPICard
              label="Fleet Utilization"
              value={f.fleet_utilization_pct ? `${f.fleet_utilization_pct}%` : "—"}
              loading={loading}
            />
            <KPICard
              label="Average Wait Time"
              value={f.average_wait_time_minutes ? `${f.average_wait_time_minutes} min` : "—"}
              critical={f.average_wait_time_minutes > 10}
              loading={loading}
            />
            <KPICard label="Waiting Riders" value={supply.waiting_riders} loading={loading} />
            <KPICard label="Driver Density" value={supply.driver_density} loading={loading} />
          </div>
        </Section>

        {f.vehicle_categories && f.vehicle_categories.length > 0 && (
          <Section title="Vehicle Categories">
            <ul className="ceo-master-list">
              {/* The backend groups by DriverProfile.car_type ({car_type, count}). Reading the
                  non-existent vehicle_type gave every <li> key={undefined} (React key warning)
                  and a blank label. String() keeps null and "" groups distinct. */}
              {f.vehicle_categories.map((v) => (
                <li key={`car-type-${String(v.car_type)}`}>
                  <strong>{v.car_type || "Unspecified"}</strong>: {v.count}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </>
    );
  };

  const renderAi = () => {
    const a = detail || {};
    // Only fields the backend actually returns (build_ai_insights_summary). Nothing is inferred.
    const forecast = a.revenue_forecast || {};
    const demand = a.demand_forecast || {};
    const demandSummary = demand.demand_ratio_summary || {};
    const peakHours = demand.peak_hours || [];
    const health = a.fleet_health || {};
    const perf = a.driver_performance || {};
    const perfSummary = perf.summary || {};
    const rankedDrivers = perf.drivers || [];
    const fraudAlerts = a.fraud_alerts || [];
    const recommendations = a.performance_recommendations || [];
    const hasData =
      a.biggest_operational_issue ||
      a.fastest_growing_area ||
      Object.keys(forecast).length > 0 ||
      Object.keys(health).length > 0 ||
      rankedDrivers.length > 0 ||
      fraudAlerts.length > 0 ||
      recommendations.length > 0;

    if (!hasData) {
      return <EmptyState text="No AI insights are available yet. Insights appear once rides, drivers and payments generate activity." />;
    }

    // Backend sorts drivers by score (desc); take both ends for the CEO view.
    const topDrivers = rankedDrivers.slice(0, 5);
    const attentionDrivers = rankedDrivers.length > 5 ? rankedDrivers.slice(-5).reverse() : [];

    const driverRow = (d) => (
      <li key={`driver-${d.driver_id}`}>
        <strong>{d.driver_name || d.driver_email}</strong>
        <span>
          Score {d.score} · {d.category} · {d.completed_rides} completed · {d.cancellation_rate}% cancellations
        </span>
      </li>
    );

    return (
      <>
        {a.biggest_operational_issue && (
          <Section title="Biggest Operational Issue">
            <div className="ceo-master-alert">
              <p>{a.biggest_operational_issue.message}</p>
              <p>Severity: {a.biggest_operational_issue.severity}</p>
            </div>
          </Section>
        )}

        <Section title="AI Forecasts">
          <p className="ceo-master-note">
            Trend-based estimates from the last 7 days of settled payments. No automatic financial actions are taken.
          </p>
          <div className="ceo-master-grid">
            {a.fastest_growing_area && (
              <KPICard label="Fastest Growing Area" value={a.fastest_growing_area} loading={loading} />
            )}
            <KPICard label="Daily Revenue Forecast" value={formatMoneyOrDash(forecast.daily_revenue)} loading={loading} />
            <KPICard label="Weekly Revenue Forecast" value={formatMoneyOrDash(forecast.weekly_revenue)} loading={loading} />
            <KPICard label="Expected Withdrawals" value={formatMoneyOrDash(forecast.expected_withdrawals)} loading={loading} />
            <KPICard label="Expected Refunds" value={formatMoneyOrDash(forecast.expected_refunds)} loading={loading} />
          </div>
        </Section>

        <Section title="Demand Monitor (Last Hour)">
          <div className="ceo-master-grid">
            <KPICard label="High-Demand Zones" value={demandSummary.high_demand_zones} loading={loading} />
            <KPICard label="Riders Waiting in Zones" value={demandSummary.total_waiting} loading={loading} />
            <KPICard
              label="Peak Hours"
              value={peakHours.length ? peakHours.join(", ") : "—"}
              sub={peakHours.length ? null : "No peak hours detected"}
              loading={loading}
            />
          </div>
        </Section>

        <Section title="Fleet Health">
          <div className="ceo-master-grid">
            <KPICard label="Approved Drivers" value={health.total_drivers} loading={loading} />
            <KPICard label="Online" value={health.online} sub={`${health.online_pct ?? 0}% of fleet`} loading={loading} />
            <KPICard label="Busy" value={health.busy} sub={`${health.busy_pct ?? 0}% of fleet`} loading={loading} />
            <KPICard label="Idle" value={health.idle} sub={`${health.idle_pct ?? 0}% of fleet`} loading={loading} />
            <KPICard label="Offline" value={health.offline} sub={`${health.offline_pct ?? 0}% of fleet`} loading={loading} />
            <KPICard
              label="Expired Documents"
              value={health.expired_documents}
              critical={health.expired_documents > 0}
              loading={loading}
            />
            <KPICard label="Low-Performing Drivers" value={health.low_performing_drivers} loading={loading} />
            <KPICard label="Active Trips / Deliveries" value={`${health.active_trips ?? 0} / ${health.active_deliveries ?? 0}`} loading={loading} />
          </div>
        </Section>

        <Section title="Driver Performance">
          <div className="ceo-master-grid">
            <KPICard label="Excellent" value={perfSummary.excellent} loading={loading} />
            <KPICard label="Good" value={perfSummary.good} loading={loading} />
            <KPICard label="Needs Attention" value={perfSummary.needs_attention} loading={loading} />
            <KPICard label="At Risk" value={perfSummary.at_risk} critical={perfSummary.at_risk > 0} loading={loading} />
          </div>
          {rankedDrivers.length === 0 ? (
            <EmptyState text="No approved drivers to score yet." />
          ) : (
            <>
              <h3 className="ceo-master-subheading">Highest scores</h3>
              <ul className="ceo-master-list">{topDrivers.map(driverRow)}</ul>
              {attentionDrivers.length > 0 && (
                <>
                  <h3 className="ceo-master-subheading">Lowest scores</h3>
                  <ul className="ceo-master-list">{attentionDrivers.map(driverRow)}</ul>
                </>
              )}
            </>
          )}
        </Section>

        <Section title="Fraud Alerts">
          {fraudAlerts.length > 0 ? (
            <ul className="ceo-master-list">
              {fraudAlerts.slice(0, 10).map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.severity}</strong>
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No open fraud alerts." />
          )}
        </Section>

        <Section title="Performance Recommendations">
          {recommendations.length > 0 ? (
            <ul className="ceo-master-list">
              {recommendations.slice(0, 10).map((rec) => (
                <li key={`rec-${rec.id}`}>
                  <strong>{rec.title}</strong>
                  <span>{rec.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No pending dispatch, fleet or pricing recommendations." />
          )}
        </Section>
      </>
    );
  };

  const renderReadiness = () => {
    const r = detail || {};
    const hasData = r.overall_launch_score || Object.keys(r.statuses || {}).length > 0;

    if (!hasData) {
      return <EmptyState text="Launch readiness data unavailable." />;
    }

    return (
      <>
        <Section title="Launch Readiness">
          <div className="ceo-master-score">
            <h3>Overall Launch Score: {r.overall_launch_score || 0}/100</h3>
          </div>
          <div className="ceo-master-grid">
            {Object.entries(r.statuses || {}).map(([key, status]) => (
              <KPICard
                key={key}
                label={key.replace(/_/g, " ")}
                value={status.ready ? "Ready" : "Pending"}
                sub={`Weight ${status.weight}`}
                critical={!status.ready}
                loading={loading}
              />
            ))}
          </div>
        </Section>

        {r.notes && Object.keys(r.notes).length > 0 && (
          <Section title="Launch Notes">
            <ul className="ceo-master-list">
              {Object.entries(r.notes).map(([key, note]) => (
                <li key={key}>
                  <strong>{key.replace(/_/g, " ")}:</strong> {note}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </>
    );
  };

  const renderReports = () => (
    <Section title="Executive Reports">
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
          <button type="submit" className="ceo-master-action-btn ceo-master-action-btn--primary">
            Send Broadcast
          </button>
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
            <button
              type="button"
              onClick={() => handleFreeze(true)}
              className="ceo-master-action-btn ceo-master-action-btn--danger"
            >
              Freeze Platform
            </button>
            <button
              type="button"
              onClick={() => handleFreeze(false)}
              className="ceo-master-action-btn ceo-master-action-btn--secondary"
            >
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
          <button type="submit" className="ceo-master-action-btn ceo-master-action-btn--primary">
            Approve
          </button>
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
          <button type="submit" className="ceo-master-action-btn ceo-master-action-btn--primary">
            Approve Payout
          </button>
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
          <button type="submit" className="ceo-master-action-btn ceo-master-action-btn--primary">
            Activate Campaign
          </button>
        </form>
      </Section>
    </>
  );

  const renderTab = () => {
    // While a tab's own section is still loading, say so rather than flashing "data unavailable".
    if (TAB_DETAIL_LOADERS[tab] && detailLoading && !detail) {
      return (
        <p className="ceo-master-loading" role="status">
          Loading {TABS.find((item) => item.id === tab)?.label}…
        </p>
      );
    }
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
    <div className="ceo-master-container">
      {/* Status Messages */}
      {error && <p className="ceo-master-error">{error}</p>}
      {message && <p className="ceo-master-success">{message}</p>}
      {loading && !data && <p className="ceo-master-loading">Loading CEO Command Center…</p>}

      {/* Tabs */}
      <div className="ceo-master-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ceo-master-tab ${tab === item.id ? "ceo-master-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <span className="ceo-master-tab-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="ceo-master-tab-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ceo-master-content">{renderTab()}</div>
    </div>
  );
}