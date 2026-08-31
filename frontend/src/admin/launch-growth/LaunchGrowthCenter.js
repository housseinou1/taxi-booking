import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  createLaunchCampaign,
  createLaunchPromo,
  fetchLaunchGrowthCenter,
  PARTNERSHIP_CATEGORIES,
  savePartnership,
} from "./launchGrowthApi";
import "./LaunchGrowthCenter.css";

const REFRESH_MS = 30000;

const MODULES = [
  { id: "recruitment", label: "Driver Recruitment" },
  { id: "riders", label: "Rider Growth" },
  { id: "promotions", label: "Promotions" },
  { id: "partnerships", label: "Partnerships" },
  { id: "marketing", label: "Marketing" },
  { id: "scorecard", label: "CEO Scorecard" },
];

function Kpi({ label, value, tone }) {
  return (
    <div className="launch-growth__kpi">
      <div className="launch-growth__kpi-label">{label}</div>
      <div className={`launch-growth__kpi-value ${tone ? `launch-growth__kpi-value--${tone}` : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function RecruitmentModule({ data }) {
  const funnel = data?.funnel || {};
  const kpis = data?.kpis || {};
  const steps = [
    ["applications_received", "Applications"],
    ["documents_pending", "Docs pending"],
    ["approved_drivers", "Approved"],
    ["training_completed", "Training done"],
    ["first_completed_trip", "First trip"],
    ["rejected_applications", "Rejected"],
  ];

  return (
    <>
      <div className="launch-growth__kpi-row">
        <Kpi label="Recruited today" value={kpis.drivers_recruited_today} />
        <Kpi label="Approved this week" value={kpis.drivers_approved_this_week} tone="ok" />
        <Kpi label="Active this week" value={kpis.drivers_active_this_week} />
        <Kpi label="Inactive >14 days" value={kpis.drivers_inactive_over_14_days} tone={kpis.drivers_inactive_over_14_days > 10 ? "warn" : ""} />
        <Kpi label="Activation rate" value={`${funnel.driver_activation_rate ?? 0}%`} tone={funnel.driver_activation_rate >= 60 ? "ok" : "warn"} />
      </div>

      <div className="launch-growth__card">
        <h3>Recruitment funnel</h3>
        <div className="launch-growth__funnel">
          {steps.map(([key, label]) => (
            <div key={key} className="launch-growth__funnel-step">
              <strong>{funnel[key] ?? 0}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="launch-growth__card">
        <h3>Recent applications</h3>
        <table className="launch-growth__table">
          <thead>
            <tr><th>Email</th><th>Status</th><th>Trips</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {(data?.recent_applications || []).map((row) => (
              <tr key={row.id}>
                <td>{row.user__email}</td>
                <td>{row.status}</td>
                <td>{row.total_rides_completed ?? 0}</td>
                <td>{row.user__date_joined ? new Date(row.user__date_joined).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RiderGrowthModule({ data }) {
  return (
    <>
      <div className="launch-growth__kpi-row">
        <Kpi label="New today" value={data?.new_registrations_today} />
        <Kpi label="New (30d)" value={data?.new_registrations_30d} />
        <Kpi label="First ride riders" value={data?.first_ride_completions} />
        <Kpi label="Returning (30d)" value={data?.returning_riders_30d} tone="ok" />
        <Kpi label="Referral usage" value={data?.referral_usage_30d} />
        <Kpi label="Coupon usage" value={data?.coupon_usage_30d} />
        <Kpi label="Churn rate" value={`${data?.churn_rate ?? 0}%`} tone={data?.churn_rate > 40 ? "warn" : "ok"} />
        <Kpi label="Retention" value={`${data?.retention_rate ?? 0}%`} tone="ok" />
      </div>

      <div className="launch-growth__grid">
        <div className="launch-growth__card">
          <h3>Referral performance</h3>
          <p>Successful rider referrals: {data?.referrals?.successful_rider_referrals ?? 0}</p>
          <p>Successful driver referrals: {data?.referrals?.successful_driver_referrals ?? 0}</p>
          <p>Conversion: {data?.referrals?.analytics?.conversion_rate ?? 0}%</p>
        </div>
        <div className="launch-growth__card">
          <h3>Promo summary</h3>
          <p>Active codes: {data?.promotions_summary?.active_codes ?? 0}</p>
          <p>Usages (30d): {data?.promotions_summary?.usages_30d ?? 0}</p>
          <p>Discount spend: {formatMoney(data?.promotions_summary?.discount_spend_30d || 0)}</p>
        </div>
      </div>
    </>
  );
}

function PromotionsModule({ data, onAction, message }) {
  const [promo, setPromo] = useState({ code: "", discount_value: 10, campaign_type: "general", first_ride_only: false });
  const [campaign, setCampaign] = useState({ name: "", channel: "referral", audience: "all_riders" });

  return (
    <>
      {message && <div className="launch-growth__alert" style={{ background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" }}>{message}</div>}
      <div className="launch-growth__kpi-row">
        <Kpi label="Active promos" value={data?.active_promo_codes} />
        <Kpi label="Redemptions (30d)" value={data?.redemptions_30d} />
        <Kpi label="Spend (30d)" value={formatMoney(data?.discount_spend_30d || 0)} />
        <Kpi label="ROI proxy" value={`${data?.campaign_roi_proxy ?? 0}%`} />
      </div>

      <div className="launch-growth__grid">
        <div className="launch-growth__card">
          <h3>Create promo / free ride code</h3>
          <div className="launch-growth__form-row">
            <input className="launch-growth__input" placeholder="Code" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value })} />
            <input className="launch-growth__input" placeholder="Discount value" value={promo.discount_value} onChange={(e) => setPromo({ ...promo, discount_value: e.target.value })} />
            <select className="launch-growth__select" value={promo.campaign_type} onChange={(e) => setPromo({ ...promo, campaign_type: e.target.value })}>
              <option value="general">Promo code</option>
              <option value="first_ride">Free first ride</option>
              <option value="free_ride">Free ride campaign</option>
            </select>
          </div>
          <label style={{ fontSize: "0.8rem", color: "var(--lg-muted)" }}>
            <input type="checkbox" checked={promo.first_ride_only} onChange={(e) => setPromo({ ...promo, first_ride_only: e.target.checked })} /> First ride only
          </label>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="launch-growth__btn" onClick={() => onAction(() => createLaunchPromo(promo))}>Create promo</button>
          </div>
        </div>

        <div className="launch-growth__card">
          <h3>Create referral / driver bonus campaign</h3>
          <div className="launch-growth__form-row">
            <input className="launch-growth__input" placeholder="Campaign name" value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} />
            <select className="launch-growth__select" value={campaign.channel} onChange={(e) => setCampaign({ ...campaign, channel: e.target.value })}>
              <option value="referral">Referral campaign</option>
              <option value="incentive">Driver bonus</option>
              <option value="promo">Promo push</option>
            </select>
          </div>
          <button type="button" className="launch-growth__btn" onClick={() => onAction(() => createLaunchCampaign(campaign))}>Create campaign</button>
        </div>
      </div>

      <div className="launch-growth__card">
        <h3>Recent promo codes</h3>
        <table className="launch-growth__table">
          <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            {(data?.recent_promos || []).slice(0, 15).map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.campaign_type}</td>
                <td>{row.discount_value}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PartnershipsModule({ data, onAction, message }) {
  const [form, setForm] = useState({
    name: "",
    category: "hotel",
    status: "prospect",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    agreement: "",
    performance: { rides_referred: 0, revenue_mru: 0 },
  });

  return (
    <>
      {message && <div className="launch-growth__alert" style={{ background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" }}>{message}</div>}
      <div className="launch-growth__kpi-row">
        <Kpi label="Total partnerships" value={data?.total} />
        <Kpi label="Active" value={data?.active} tone="ok" />
        <Kpi label="Prospects" value={data?.prospect} />
      </div>

      <div className="launch-growth__card">
        <h3>Add / update partnership</h3>
        <div className="launch-growth__form-row">
          <input className="launch-growth__input" placeholder="Partner name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="launch-growth__select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {PARTNERSHIP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="launch-growth__select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="prospect">Prospect</option>
            <option value="negotiating">Negotiating</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>
        <div className="launch-growth__form-row">
          <input className="launch-growth__input" placeholder="Contact person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          <input className="launch-growth__input" placeholder="Email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          <input className="launch-growth__input" placeholder="Phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
        </div>
        <textarea className="launch-growth__textarea" placeholder="Agreement summary" value={form.agreement} onChange={(e) => setForm({ ...form, agreement: e.target.value })} rows={3} style={{ width: "100%", marginBottom: 8 }} />
        <button type="button" className="launch-growth__btn" onClick={() => onAction(() => savePartnership(form))}>Save partnership</button>
      </div>

      <div className="launch-growth__card">
        <h3>Partnership tracker</h3>
        <table className="launch-growth__table">
          <thead>
            <tr><th>Name</th><th>Category</th><th>Status</th><th>Contact</th><th>Agreement</th><th>Performance</th></tr>
          </thead>
          <tbody>
            {(data?.partnerships || []).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.category}</td>
                <td>{row.status}</td>
                <td>{row.contact_person}<br /><span style={{ color: "var(--lg-muted)" }}>{row.contact_email}</span></td>
                <td>{row.agreement?.slice(0, 60) || "—"}</td>
                <td>{row.performance?.rides_referred ?? 0} rides · {formatMoney(row.performance?.revenue_mru || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.partnerships?.length && <div className="launch-growth__empty">No partnerships recorded yet.</div>}
      </div>
    </>
  );
}

function MarketingModule({ data }) {
  return (
    <>
      <div className="launch-growth__kpi-row">
        <Kpi label="CAC estimate" value={formatMoney(data?.customer_acquisition_cost || 0)} />
        <Kpi label="New riders (30d proxy)" value={data?.daily_installs_proxy} />
        <Kpi label="Ride conversion" value={`${data?.ride_conversion_proxy ?? 0}%`} />
        <Kpi label="Retention" value={`${data?.rider_retention_pct ?? 0}%`} tone="ok" />
        <Kpi label="Reactivated (30d)" value={data?.reactivated_users_30d} />
      </div>

      <div className="launch-growth__grid">
        <div className="launch-growth__card">
          <h3>Campaign performance</h3>
          <table className="launch-growth__table">
            <thead><tr><th>Name</th><th>Channel</th><th>Status</th></tr></thead>
            <tbody>
              {(data?.campaign_performance || []).map((row) => (
                <tr key={row.id}><td>{row.name}</td><td>{row.channel}</td><td>{row.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="launch-growth__card">
          <h3>Referral performance</h3>
          <p>Rider codes: {data?.referral_performance?.rider_codes ?? 0}</p>
          <p>Driver referrals: {data?.referral_performance?.driver_referrals ?? 0}</p>
          <p>Flagged pending: {data?.referral_performance?.flagged_pending ?? 0}</p>
          <p>Promo usages: {data?.promo_code_usage?.total_usages ?? 0}</p>
        </div>
      </div>
    </>
  );
}

function ScorecardModule({ data }) {
  return (
    <>
      <div className="launch-growth__kpi-row">
        <Kpi label="Active drivers" value={data?.active_drivers} />
        <Kpi label="Registered riders" value={data?.registered_riders} />
        <Kpi label="Completed trips today" value={data?.completed_trips_today} />
        <Kpi label="Revenue today" value={formatMoney(data?.revenue_today || 0)} tone="ok" />
        <Kpi label="Average rating" value={data?.average_rating ?? "—"} />
        <Kpi label="Cancellation rate" value={`${data?.cancellation_rate ?? 0}%`} tone={data?.cancellation_rate > 15 ? "warn" : ""} />
        <Kpi label="Avg pickup time" value={data?.average_pickup_time_minutes != null ? `${data.average_pickup_time_minutes}m` : "—"} />
        <Kpi label="Support tickets" value={data?.support_tickets_open} tone={data?.support_tickets_open > 20 ? "crit" : ""} />
      </div>

      <div className="launch-growth__card">
        <h3>Today snapshot</h3>
        <div className="launch-growth__grid">
          <div>New riders: {data?.overview?.new_riders_today ?? 0}</div>
          <div>New drivers: {data?.overview?.new_drivers_today ?? 0}</div>
          <div>Active trips: {data?.overview?.active_trips ?? 0}</div>
          <div>Commission today: {formatMoney(data?.overview?.commission_earned_today || 0)}</div>
        </div>
      </div>
    </>
  );
}

export default function LaunchGrowthCenter() {
  const [data, setData] = useState(null);
  const [module, setModule] = useState("recruitment");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [cityId, setCityId] = useState("");

  const params = useMemo(() => (cityId ? { city_id: cityId } : {}), [cityId]);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchLaunchGrowthCenter(params);
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load Launch & Growth Center");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const runAction = async (fn) => {
    try {
      setActionMessage("");
      await fn();
      setActionMessage("Saved successfully");
      await load();
    } catch (err) {
      setActionMessage(err?.response?.data?.detail || err?.message || "Action failed");
    }
  };

  const scaling = data?.scaling_readiness;
  const verdictClass = scaling?.verdict === "READY TO SCALE"
    ? "launch-growth__verdict--ready"
    : scaling?.verdict === "SCALE WITH CONDITIONS"
      ? "launch-growth__verdict--conditional"
      : "launch-growth__verdict--not-ready";

  if (loading && !data) {
    return <div className="launch-growth"><div className="launch-growth__empty">Loading Launch & Growth Center…</div></div>;
  }

  return (
    <div className="launch-growth">
      <header className="launch-growth__header">
        <div>
          <a className="launch-growth__back" href="/admin">← Admin</a>
          <h1>Launch & Growth Center</h1>
          <p>Driver recruitment, rider acquisition, promotions, partnerships & CEO scorecard</p>
        </div>
        <div className="launch-growth__toolbar">
          <input className="launch-growth__input" placeholder="City ID (optional)" value={cityId} onChange={(e) => setCityId(e.target.value)} />
          <button type="button" className="launch-growth__btn" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="launch-growth__alert">{error}</div>}

      {scaling && (
        <div className={`launch-growth__verdict ${verdictClass}`}>
          <strong>Scale readiness: {scaling.verdict}</strong>
          <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>{scaling.recommendation}</p>
          {scaling.blockers?.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.85rem" }}>
              {scaling.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>
      )}

      <nav className="launch-growth__tabs">
        {MODULES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`launch-growth__tab ${module === item.id ? "active" : ""}`}
            onClick={() => setModule(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {module === "recruitment" && <RecruitmentModule data={data?.driver_recruitment} />}
      {module === "riders" && <RiderGrowthModule data={data?.rider_growth} />}
      {module === "promotions" && <PromotionsModule data={data?.promotions} onAction={runAction} message={actionMessage} />}
      {module === "partnerships" && <PartnershipsModule data={data?.partnerships} onAction={runAction} message={actionMessage} />}
      {module === "marketing" && <MarketingModule data={data?.marketing} />}
      {module === "scorecard" && <ScorecardModule data={data?.executive_scorecard} />}

      <div className="launch-growth__links">
        <a href="/admin/customer-growth">Customer Growth Center</a>
        <a href="/admin/growth">Growth & Expansion</a>
        <a href="/admin/launch">Launch Hub</a>
        <a href="/admin/ceo-master">CEO Dashboard</a>
        <a href="/admin/fleet">Fleet & Onboarding</a>
      </div>
    </div>
  );
}
