import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  bonusExportUrl,
  createIncentiveCampaign,
  fetchIncentiveCeoDashboard,
  fetchIncentiveEngineDashboard,
  fetchIncentiveFinanceDashboard,
  payoutAction,
  updateIncentiveCampaign,
} from "./incentiveEngineApi";
import "../beta/BetaDashboard.css";
import "./DriverIncentivesCenter.css";

const TABS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "operations", label: "Operations" },
  { id: "ceo", label: "CEO Dashboard" },
  { id: "finance", label: "Finance" },
];

const CAMPAIGN_TYPES = [
  "daily_trip_target",
  "weekly_trip_target",
  "peak_hour_bonus",
  "weekend_bonus",
  "airport_bonus",
  "new_driver_bonus",
  "referral_bonus",
  "consecutive_trips_bonus",
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

const EMPTY_FORM = {
  name: "",
  description: "",
  campaign_type: "weekly_trip_target",
  reward_type: "fixed",
  reward: 500,
  target: 20,
  status: "draft",
  eligible_groups: "all",
};

export default function DriverIncentivesCenter() {
  const [tab, setTab] = useState("campaigns");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [financeData, setFinanceData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchIncentiveEngineDashboard();
      setData(dashboard);
      if (tab === "ceo") setCeoData(await fetchIncentiveCeoDashboard());
      if (tab === "finance") setFinanceData(await fetchIncentiveFinanceDashboard());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load incentive engine");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const ops = data?.operations || {};
  const campaigns = data?.campaigns || [];

  const handleCreate = async (e) => {
    e.preventDefault();
    await createIncentiveCampaign({
      ...form,
      reward: Number(form.reward),
      target: Number(form.target),
      eligible_groups: form.eligible_groups.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setForm(EMPTY_FORM);
    await load();
  };

  const activateCampaign = async (campaign) => {
    await updateIncentiveCampaign(campaign.id, { status: "active", starts_at: new Date().toISOString() });
    await load();
  };

  const handlePayout = async (paymentId, action) => {
    await payoutAction(paymentId, { action, note: action === "reject" ? "Rejected by finance" : "" });
    setFinanceData(await fetchIncentiveFinanceDashboard());
    await load();
  };

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <p className="beta__eyebrow">Phase 30 · Closed Beta</p>
          <h1>Driver Incentive Engine</h1>
          <p className="beta__subtitle">Configurable campaigns, progress tracking, bonus calculation, and finance-approved payouts.</p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading incentive engine…</p> : null}

      <div className="incentive-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`incentive-tab ${tab === item.id ? "incentive-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "campaigns" && (
        <>
          <section className="incentive-panel">
            <h3>Create campaign</h3>
            <form className="incentive-form" onSubmit={handleCreate}>
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
              <label>Type
                <select value={form.campaign_type} onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}>
                  {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label>Reward type
                <select value={form.reward_type} onChange={(e) => setForm({ ...form, reward_type: e.target.value })}>
                  <option value="fixed">Fixed amount</option>
                  <option value="percentage">Percentage</option>
                  <option value="per_trip">Per trip</option>
                </select>
              </label>
              <label>Target (trips/goals)<input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label>
              <label>Reward (MRU or %)<input type="number" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} /></label>
              <label>Eligible groups (comma-separated)<input value={form.eligible_groups} onChange={(e) => setForm({ ...form, eligible_groups: e.target.value })} /></label>
              <button type="submit">Save draft campaign</button>
            </form>
          </section>

          <section className="incentive-panel">
            <h3>All campaigns</h3>
            {campaigns.map((campaign) => (
              <article key={campaign.id} className={`incentive-campaign ${campaign.status === "draft" ? "incentive-campaign--draft" : ""}`}>
                <strong>{campaign.name}</strong> · {campaign.campaign_type.replaceAll("_", " ")}
                <p>{campaign.description || "No description"}</p>
                <p>Target {campaign.target_value} · {formatMoney(campaign.reward)} · {campaign.reward_type} · Status: {campaign.status}</p>
                <p>{campaign.participants} participants · {campaign.completed_count} completed</p>
                {campaign.status === "draft" ? (
                  <div className="incentive-actions">
                    <button type="button" onClick={() => activateCampaign(campaign)}>Activate</button>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </>
      )}

      {tab === "operations" && ops.summary ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Active campaigns" value={ops.summary.active_campaigns} />
            <MetricCard label="Participation rate" value={`${ops.summary.participation_rate}%`} />
            <MetricCard label="Completion rate" value={`${ops.summary.completion_rate}%`} />
            <MetricCard label="Bonuses earned" value={formatMoney(ops.summary.total_bonuses_earned)} />
            <MetricCard label="ROI estimate" value={`${ops.summary.roi_estimate_percent}%`} />
          </div>
          <section className="incentive-panel">
            <h3>Top campaigns</h3>
            {(ops.top_campaigns || []).map((row) => (
              <p key={row.program_id}>{row.name} — {row.completions} completions · {row.participants} participants</p>
            ))}
          </section>
        </>
      ) : null}

      {tab === "ceo" && ceoData ? (
        <div className="beta__grid">
          <MetricCard label="Incentive cost (30d)" value={formatMoney(ceoData.incentive_cost_30d)} />
          <MetricCard label="Additional rides" value={ceoData.additional_rides_generated} />
          <MetricCard label="Revenue increase est." value={formatMoney(ceoData.revenue_increase_estimate)} />
          <MetricCard label="Driver retention" value={`${ceoData.driver_retention_rate}%`} />
          <MetricCard label="Pending payouts" value={formatMoney(ceoData.pending_payouts)} />
        </div>
      ) : null}

      {tab === "finance" && financeData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Pending bonus" value={formatMoney(financeData.summary?.pending_bonus)} />
            <MetricCard label="Paid bonus" value={formatMoney(financeData.summary?.paid_bonus)} />
            <MetricCard label="Earned bonus" value={formatMoney(financeData.summary?.earned_bonus)} />
          </div>
          <section className="incentive-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Pending payouts</h3>
              <a href={bonusExportUrl(30)} target="_blank" rel="noreferrer">Export CSV</a>
            </div>
            {(financeData.pending_payouts || []).map((row) => (
              <div key={row.id} className="incentive-payout-row">
                <div>
                  <strong>{row.driver_name}</strong>
                  <div>{row.program_name} · {formatMoney(row.amount)}</div>
                </div>
                <span>{row.payout_status}</span>
                <div className="incentive-actions">
                  <button type="button" onClick={() => handlePayout(row.id, "approve")}>Approve & pay</button>
                  <button type="button" onClick={() => handlePayout(row.id, "reject")}>Reject</button>
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
