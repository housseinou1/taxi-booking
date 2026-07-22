import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  createGrowthCampaign,
  createGrowthPromo,
  fetchCustomerGrowthCeo,
  fetchCustomerGrowthDashboard,
  fetchCustomerGrowthFinance,
  updateCustomerGrowthFlags,
} from "./customerGrowthApi";
import "../beta/BetaDashboard.css";
import "./CustomerGrowthCenter.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "referrals", label: "Referrals" },
  { id: "loyalty", label: "Loyalty" },
  { id: "promotions", label: "Promotions" },
  { id: "analytics", label: "Analytics" },
  { id: "finance", label: "Finance" },
  { id: "ceo", label: "CEO Dashboard" },
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

export default function CustomerGrowthCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [financeData, setFinanceData] = useState(null);
  const [flags, setFlags] = useState({});
  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: "10",
    campaign_type: "general",
    first_ride_only: false,
  });
  const [campaignForm, setCampaignForm] = useState({ name: "", channel: "promo", audience: "all_riders" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchCustomerGrowthDashboard();
      setData(dashboard);
      setFlags(dashboard.feature_flags || {});
      if (tab === "ceo") setCeoData(await fetchCustomerGrowthCeo());
      if (tab === "finance") setFinanceData(await fetchCustomerGrowthFinance());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load customer growth platform");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const referrals = data?.referrals || {};
  const loyalty = data?.loyalty || {};
  const promotions = data?.promotions || {};

  const saveFlags = async () => {
    await updateCustomerGrowthFlags(flags);
    await load();
  };

  const handlePromo = async (event) => {
    event.preventDefault();
    try {
      await createGrowthPromo({
        ...promoForm,
        discount_value: Number(promoForm.discount_value),
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      setPromoForm({ code: "", discount_type: "percentage", discount_value: "10", campaign_type: "general", first_ride_only: false });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to create promo");
    }
  };

  const handleCampaign = async (event) => {
    event.preventDefault();
    try {
      await createGrowthCampaign(campaignForm);
      setCampaignForm({ name: "", channel: "promo", audience: "all_riders" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to create campaign");
    }
  };

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <p className="beta__eyebrow">Phase 33 · Production</p>
          <h1>Customer Growth & Loyalty</h1>
          <p className="beta__subtitle">Referrals, loyalty tiers, promotions, retention analytics, and campaign finance.</p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading customer growth platform…</p> : null}

      <div className="customer-growth-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`customer-growth-tab ${tab === item.id ? "customer-growth-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "analytics") && summary ? (
        <div className="beta__grid">
          <MetricCard label="Active riders (30d)" value={summary.active_riders_30d} />
          <MetricCard label="Repeat riders" value={summary.repeat_riders_30d} />
          <MetricCard label="Retention rate" value={`${summary.retention_rate}%`} />
          <MetricCard label="Churn rate" value={`${summary.churn_rate}%`} />
          <MetricCard label="Referral rate" value={`${summary.referral_rate}%`} />
          <MetricCard label="Loyalty members" value={summary.loyalty_members} />
          <MetricCard label="Avg rides / customer" value={summary.avg_rides_per_customer} />
          <MetricCard label="Avg deliveries / customer" value={summary.avg_deliveries_per_customer} />
        </div>
      ) : null}

      {tab === "overview" ? (
        <section className="customer-growth-panel">
          <h3>Feature flags</h3>
          <div className="customer-growth-flags">
            {Object.entries(flags).map(([key, value]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
                />
                {key.replace(/_/g, " ")}
              </label>
            ))}
          </div>
          <button type="button" className="delivery-uber__primary-btn" onClick={saveFlags}>Save flags</button>
        </section>
      ) : null}

      {tab === "referrals" ? (
        <div className="beta__grid">
          <MetricCard label="Rider referrals (30d)" value={referrals.rider_signups_30d} />
          <MetricCard label="Driver referrals (30d)" value={referrals.driver_signups_30d} />
          <MetricCard label="Merchant referrals (30d)" value={referrals.merchant_signups_30d} />
          <MetricCard label="Successful rider referrals" value={referrals.successful_rider_referrals} />
          <MetricCard label="Active ride credits" value={referrals.pending_credits} />
          <MetricCard label="Flagged (pending)" value={summary.flagged_referrals_pending} />
        </div>
      ) : null}

      {tab === "loyalty" ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Members" value={loyalty.total_members} />
            <MetricCard label="Points issued (30d)" value={loyalty.points_issued_30d} />
            <MetricCard label="Redemptions (30d)" value={loyalty.redemptions_30d} />
          </div>
          <section className="customer-growth-panel">
            <h3>Tiers</h3>
            {(loyalty.tiers || []).map((tier) => (
              <p key={tier.slug}>
                {tier.name} — {tier.min_points}+ pts · ride {tier.ride_discount_percent}% off
                {tier.priority_support ? " · priority support" : ""}
              </p>
            ))}
          </section>
        </>
      ) : null}

      {tab === "promotions" ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Active promo codes" value={promotions.active_codes} />
            <MetricCard label="Usages (30d)" value={promotions.usages_30d} />
            <MetricCard label="Discount spend (30d)" value={formatMoney(promotions.discount_spend_30d)} />
          </div>
          <section className="customer-growth-panel">
            <h3>Create promo code</h3>
            <form className="customer-growth-form" onSubmit={handlePromo}>
              <label>Code<input required value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} /></label>
              <label>
                Discount type
                <select value={promoForm.discount_type} onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value })}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="free_ride">Free ride</option>
                  <option value="free_delivery">Free delivery</option>
                </select>
              </label>
              <label>Value<input type="number" value={promoForm.discount_value} onChange={(e) => setPromoForm({ ...promoForm, discount_value: e.target.value })} /></label>
              <label>
                Campaign type
                <select value={promoForm.campaign_type} onChange={(e) => setPromoForm({ ...promoForm, campaign_type: e.target.value })}>
                  <option value="general">General</option>
                  <option value="first_ride">First ride offer</option>
                  <option value="free_delivery">Free delivery</option>
                  <option value="city_campaign">City campaign</option>
                  <option value="loyalty_exclusive">Loyalty exclusive</option>
                </select>
              </label>
              <label><input type="checkbox" checked={promoForm.first_ride_only} onChange={(e) => setPromoForm({ ...promoForm, first_ride_only: e.target.checked })} /> First ride only</label>
              <button type="submit" className="delivery-uber__primary-btn">Create promo</button>
            </form>
          </section>
          <section className="customer-growth-panel">
            <h3>Create marketing campaign</h3>
            <form className="customer-growth-form" onSubmit={handleCampaign}>
              <label>Name<input required value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} /></label>
              <label>Channel<select value={campaignForm.channel} onChange={(e) => setCampaignForm({ ...campaignForm, channel: e.target.value })}><option value="promo">Promo</option><option value="push">Push</option><option value="referral">Referral</option></select></label>
              <label>Audience<select value={campaignForm.audience} onChange={(e) => setCampaignForm({ ...campaignForm, audience: e.target.value })}><option value="all_riders">All riders</option><option value="vip">VIP</option><option value="city">City segment</option></select></label>
              <button type="submit" className="delivery-uber__primary-btn">Create campaign</button>
            </form>
          </section>
        </>
      ) : null}

      {tab === "finance" && financeData ? (
        <div className="beta__grid">
          <MetricCard label="Loyalty liability (pts)" value={financeData.loyalty_liability_points} />
          <MetricCard label="Loyalty liability est." value={formatMoney(financeData.loyalty_liability_estimate_mru)} />
          <MetricCard label="Promo cost (30d)" value={formatMoney(financeData.promo_cost_30d)} />
          <MetricCard label="Referral payouts (30d)" value={formatMoney(financeData.referral_payouts_30d)} />
          <MetricCard label="Campaign spending (30d)" value={formatMoney(financeData.campaign_spending_30d)} />
        </div>
      ) : null}

      {tab === "ceo" && ceoData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="New riders (30d)" value={ceoData.new_riders_30d} />
            <MetricCard label="Loyalty participation" value={`${ceoData.loyalty_participation_rate}%`} />
            <MetricCard label="Referral conversion" value={`${ceoData.referral_conversion_rate}%`} />
            <MetricCard label="Est. CLV" value={formatMoney(ceoData.estimated_customer_lifetime_value)} />
            <MetricCard label="Campaign ROI proxy" value={ceoData.campaign_roi_proxy} />
            <MetricCard label="Promo spend (30d)" value={formatMoney(ceoData.promo_spend_30d)} />
          </div>
          <section className="customer-growth-panel">
            <h3>Customer growth (weekly)</h3>
            {(ceoData.customer_growth || []).map((row) => (
              <p key={row.week_start}>{row.week_start} — {row.new_riders} new riders</p>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
