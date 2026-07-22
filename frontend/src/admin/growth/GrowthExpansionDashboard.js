import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { exportGrowthReport, fetchGrowthDashboard } from "./growthApi";
import "../beta/BetaDashboard.css";
import "./GrowthExpansionDashboard.css";

const TABS = [
  { id: "growth", label: "Growth Metrics" },
  { id: "revenue", label: "Revenue Growth" },
  { id: "marketing", label: "Marketing Performance" },
  { id: "geography", label: "Geographic Expansion" },
  { id: "forecast", label: "CEO Forecast" },
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

function TrendChart({ items, valueKey = "revenue" }) {
  const max = useMemo(() => {
    const values = (items || []).map((item) => Number(item[valueKey] || 0));
    return Math.max(...values, 1);
  }, [items, valueKey]);

  if (!items?.length) {
    return <div className="beta__muted">No trend data</div>;
  }

  return (
    <div className="growth-chart">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const height = Math.max(8, (value / max) * 100);
        return (
          <div
            key={item.date || item.label}
            className="growth-chart__bar"
            style={{ height: `${height}%` }}
            title={`${item.label || item.date}: ${formatMoney(value)}`}
          />
        );
      })}
    </div>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function GrowthExpansionDashboard() {
  const [tab, setTab] = useState("growth");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchGrowthDashboard();
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load growth dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const handleExport = async (format) => {
    const response = await exportGrowthReport(format);
    const ext = format === "pdf" ? "pdf" : format === "xlsx" ? "xlsx" : "csv";
    downloadBlob(response, `growth-expansion.${ext}`);
  };

  if (loading && !data) {
    return <div className="beta">Loading growth dashboard…</div>;
  }

  const growth = data?.growth_metrics || {};
  const revenue = data?.revenue_growth || {};
  const marketing = data?.marketing_performance || {};
  const geography = data?.geographic_expansion || {};
  const forecast = data?.ceo_forecast || {};

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <h1>Growth & Expansion Dashboard</h1>
          <p className="beta__subtitle">CEO view — platform growth, revenue, marketing, and expansion</p>
        </div>
        <div className="growth-toolbar">
          <button type="button" className="beta__btn" onClick={() => handleExport("csv")}>
            Export CSV
          </button>
          <button type="button" className="beta__btn" onClick={() => handleExport("xlsx")}>
            Export Excel
          </button>
          <button type="button" className="beta__btn" onClick={() => handleExport("pdf")}>
            Export PDF
          </button>
          <button type="button" className="beta__btn" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}

      <div className="growth-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`growth-tab ${tab === item.id ? "growth-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "growth" ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Total registered riders" value={growth.total_registered_riders} />
            <MetricCard label="Monthly active riders" value={growth.monthly_active_riders} />
            <MetricCard label="Daily active riders" value={growth.daily_active_riders} />
            <MetricCard label="New registrations (month)" value={growth.new_registrations?.month} sub={`${growth.new_registrations?.week || 0} this week`} />
            <MetricCard label="Rider referrals (month)" value={growth.referral_growth?.rider_referrals_month} sub={`${growth.referral_growth?.rider_referrals_total || 0} total`} />
            <MetricCard label="Driver referrals (month)" value={growth.referral_growth?.driver_referrals_month} />
            <MetricCard label="Approved drivers" value={growth.driver_growth?.approved_total} sub={`+${growth.driver_growth?.new_month || 0} this month`} />
            <MetricCard label="Active couriers" value={growth.courier_growth?.active_total} sub={`+${growth.courier_growth?.new_month || 0} this month`} />
          </div>
          <div className="beta__panel" style={{ marginTop: "1rem" }}>
            <h3>Registration trend (14 days)</h3>
            <TrendChart items={growth.registration_chart} valueKey="riders" />
          </div>
        </section>
      ) : null}

      {tab === "revenue" ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Daily revenue" value={formatMoney(revenue.daily?.gross_revenue)} />
            <MetricCard label="Weekly revenue" value={formatMoney(revenue.weekly?.gross_revenue)} />
            <MetricCard label="Monthly revenue" value={formatMoney(revenue.monthly?.gross_revenue)} />
            <MetricCard label="Avg revenue / ride" value={formatMoney(revenue.average_revenue_per_ride)} />
            <MetricCard label="Avg revenue / delivery" value={formatMoney(revenue.average_revenue_per_delivery)} />
          </div>
          <div className="beta__panel" style={{ marginTop: "1rem" }}>
            <h3>Revenue trend (30 days)</h3>
            <TrendChart items={revenue.revenue_trend} valueKey="revenue" />
          </div>
        </section>
      ) : null}

      {tab === "marketing" ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Promo code usages" value={marketing.promo_code_usage?.total_usages} sub={`${marketing.promo_code_usage?.active || 0} active codes`} />
            <MetricCard label="Promo redemptions (30d)" value={marketing.analytics?.promo_redemptions_30d} />
            <MetricCard label="Est. CAC" value={formatMoney(marketing.customer_acquisition_cost_estimate)} />
            <MetricCard label="Rider retention (7d)" value={marketing.retention_rate_pct != null ? `${marketing.retention_rate_pct}%` : "—"} />
            <MetricCard label="Repeat riders" value={marketing.repeat_riders} sub={`${marketing.repeat_rider_rate_pct || 0}% repeat rate`} />
            <MetricCard label="Reactivated users (30d)" value={marketing.reactivated_users_30d} />
            <MetricCard label="Referral conversions (30d)" value={marketing.analytics?.referral_conversions_30d} />
            <MetricCard label="New riders (30d)" value={marketing.new_riders_30d} />
          </div>
          <div className="beta__grid beta__grid--2" style={{ marginTop: "1rem" }}>
            <div className="beta__panel">
              <h3>Referral campaigns</h3>
              {(marketing.referral_campaigns || []).slice(0, 6).map((c) => (
                <div key={c.id} className="beta__muted">{c.name} — {c.status}</div>
              ))}
            </div>
            <div className="beta__panel">
              <h3>Recent promo codes</h3>
              {(marketing.recent_promos || []).slice(0, 6).map((p) => (
                <div key={p.id} className="beta__muted">{p.code} — {p.status}</div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "geography" ? (
        <section>
          <div className="beta__muted" style={{ marginBottom: "0.75rem" }}>
            {geography.active_cities?.length || 0} active cities
          </div>
          <div className="beta__panel finance-table-wrap">
            <table className="beta__table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Demand</th>
                  <th>Supply</th>
                  <th>Online</th>
                  <th>Ratio</th>
                </tr>
              </thead>
              <tbody>
                {(geography.city_performance || []).map((row) => (
                  <tr key={row.city_id}>
                    <td>{row.city_name}</td>
                    <td>{row.demand}</td>
                    <td>{row.supply}</td>
                    <td>{row.online_supply}</td>
                    <td>{row.demand_supply_ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="beta__panel" style={{ marginTop: "1rem" }}>
            <h3>Recommended expansion areas</h3>
            {(geography.recommended_expansion_areas || []).map((area, index) => (
              <div key={`${area.label}-${index}`} className="growth-recommendation">
                <strong>{area.label}</strong>
                <div className="beta__muted">{area.suggested_action}</div>
                {area.demand_ratio != null ? (
                  <div className="beta__muted">Demand ratio: {area.demand_ratio}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "forecast" ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Monthly growth" value={forecast.monthly_growth_pct != null ? `${forecast.monthly_growth_pct}%` : "—"} />
            <MetricCard label="Revenue forecast (daily)" value={formatMoney(forecast.revenue_forecast?.daily)} />
            <MetricCard label="Revenue forecast (monthly)" value={formatMoney(forecast.revenue_forecast?.monthly)} />
            <MetricCard label="Driver demand estimate" value={forecast.driver_demand_estimate} />
            <MetricCard label="Additional drivers needed" value={forecast.fleet_requirements?.additional_drivers_recommended} />
            <MetricCard label="Fleet utilization" value={`${forecast.fleet_requirements?.utilization_pct ?? "—"}%`} />
          </div>
          {forecast.disclaimer ? (
            <p className="beta__muted" style={{ marginTop: "1rem" }}>{forecast.disclaimer}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
