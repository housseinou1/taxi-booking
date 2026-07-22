import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  fetchCeoDashboard,
  fetchSmartEngineDashboard,
  runPricingSimulation,
  updateDispatchRules,
  updateEngineFlags,
  updatePricingRules,
  updateSurgeConfig,
} from "./smartPricingApi";
import "../beta/BetaDashboard.css";
import "./SmartPricingDispatchCenter.css";

const TABS = [
  { id: "dispatch", label: "Intelligent Dispatch" },
  { id: "pricing", label: "Dynamic Pricing" },
  { id: "surge", label: "Surge Pricing" },
  { id: "analytics", label: "Dispatch Analytics" },
  { id: "simulator", label: "Pricing Simulator" },
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

const WEIGHT_FIELDS = [
  { key: "distance", label: "Distance" },
  { key: "eta", label: "ETA" },
  { key: "rating", label: "Rating" },
  { key: "acceptance", label: "Acceptance rate" },
  { key: "cancellation", label: "Low cancellation" },
  { key: "level", label: "Driver level" },
  { key: "fairness", label: "Fairness / idle" },
  { key: "vehicle_match", label: "Vehicle match" },
  { key: "idle_time", label: "Idle time" },
  { key: "traffic_factor", label: "Traffic factor" },
];

export default function SmartPricingDispatchCenter() {
  const [tab, setTab] = useState("dispatch");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [simInput, setSimInput] = useState({
    distance_km: 8,
    duration_minutes: 20,
    waiting_minutes: 0,
    ride_type: "regular",
    surge_multiplier: 1.0,
    use_engine: true,
    is_holiday: false,
    is_weather_event: false,
    is_special_event: false,
    pickup_label: "",
  });
  const [simResult, setSimResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const params = selectedCityId ? { city_id: selectedCityId } : {};
      const payload = await fetchSmartEngineDashboard(params);
      setData(payload);
      if (tab === "ceo") {
        const ceo = await fetchCeoDashboard(params);
        setCeoData(ceo);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load smart engine");
    } finally {
      setLoading(false);
    }
  }, [selectedCityId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const flags = data?.engine_flags || {};
  const dispatchRules = data?.dispatch_rules || {};
  const pricingRules = data?.pricing_rules || {};
  const surge = data?.surge || {};
  const analytics = data?.dispatch_analytics || {};
  const insights = data?.dispatch_insights?.rides || [];
  const auditTrail = data?.audit_trail || [];

  const handleFlagToggle = async (key) => {
    await updateEngineFlags({ [key]: !flags[key] });
    await load();
  };

  const handleWeightChange = async (key, value) => {
    const weights = { ...(dispatchRules.weights || {}), [key]: parseFloat(value) || 0 };
    await updateDispatchRules({ weights }, selectedCityId || undefined);
    await load();
  };

  const handlePricingSave = async (field, value) => {
    await updatePricingRules({ [field]: value }, selectedCityId || undefined, simInput.ride_type);
    await load();
  };

  const handleSurgeSave = async (payload) => {
    await updateSurgeConfig(payload);
    await load();
  };

  const handleSimulate = async () => {
    const payload = {
      ...simInput,
      city_id: selectedCityId ? Number(selectedCityId) : undefined,
    };
    const result = await runPricingSimulation(payload);
    setSimResult(result);
  };

  if (loading && !data) {
    return <div className="beta">Loading Smart Pricing & Dispatch Engine…</div>;
  }

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <h1>Smart Pricing & Dispatch Engine</h1>
          <p className="beta__subtitle">Intelligent dispatch, dynamic pricing, surge, and analytics</p>
        </div>
        <div className="smart-pricing-toolbar">
          <select value={selectedCityId} onChange={(e) => setSelectedCityId(e.target.value)}>
            <option value="">All cities</option>
            {(data?.cities || []).map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          <button type="button" className="beta__btn" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}

      <div className="smart-pricing-panel">
        <h3>Engine feature flags</h3>
        <div className="smart-pricing-grid">
          {[
            ["enabled", "Master engine"],
            ["smart_dispatch_enabled", "Smart dispatch"],
            ["dynamic_pricing_enabled", "Dynamic pricing"],
            ["surge_pricing_enabled", "Surge pricing"],
          ].map(([key, label]) => (
            <label key={key} className="smart-pricing-flag">
              <input type="checkbox" checked={!!flags[key]} onChange={() => handleFlagToggle(key)} />
              {label}
            </label>
          ))}
        </div>
        {!flags.enabled ? (
          <p className="beta__card-sub">Legacy MARKET / CityPricing pricing and default dispatch scoring remain active.</p>
        ) : null}
      </div>

      <div className="smart-pricing-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`smart-pricing-tab ${tab === item.id ? "smart-pricing-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "dispatch" ? (
        <section>
          <div className="smart-pricing-panel">
            <h3>Dispatch scoring weights</h3>
            <div className="smart-pricing-form">
              {WEIGHT_FIELDS.map(({ key, label }) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={dispatchRules.weights?.[key] ?? 0}
                    onChange={(e) => handleWeightChange(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="smart-pricing-panel">
            <h3>Active dispatch insights</h3>
            {insights.length === 0 ? <p>No active ride searches.</p> : null}
            {insights.slice(0, 8).map((ride) => (
              <div key={ride.ride_id} className="smart-pricing-zone">
                <strong>Ride #{ride.ride_id}</strong> — {ride.pickup}
                <div className="beta__card-sub">
                  Round {ride.dispatch_round} · radius {ride.search_radius_km} km
                </div>
                {ride.selected_driver ? (
                  <div>
                    Selected: {ride.selected_driver.driver_name} (score {ride.selected_driver.total_score})
                  </div>
                ) : (
                  <div>No driver selected yet</div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "pricing" ? (
        <section className="smart-pricing-panel">
          <h3>Dynamic pricing rules</h3>
          <div className="smart-pricing-form">
            {[
              ["base_fare", "Base fare (MRU)"],
              ["distance_fare_per_km", "Distance fare / km"],
              ["time_fare_per_minute", "Time fare / min"],
              ["waiting_fee_per_minute", "Waiting fee / min"],
              ["airport_surcharge", "Airport surcharge"],
              ["night_surcharge_pct", "Night surcharge %"],
              ["holiday_surcharge_pct", "Holiday surcharge %"],
              ["weather_surcharge_pct", "Weather surcharge %"],
              ["event_surcharge_pct", "Event surcharge %"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  value={pricingRules[key] ?? ""}
                  onBlur={(e) => handlePricingSave(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "surge" ? (
        <section>
          <div className="smart-pricing-panel">
            <h3>Surge controls (CEO)</h3>
            <div className="smart-pricing-form">
              <label className="smart-pricing-flag">
                <input
                  type="checkbox"
                  checked={!!surge.config?.enabled}
                  onChange={(e) => handleSurgeSave({ enabled: e.target.checked })}
                />
                Enable surge
              </label>
              <label>
                Max multiplier
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  defaultValue={surge.config?.max_multiplier ?? 2.5}
                  onBlur={(e) => handleSurgeSave({ max_multiplier: parseFloat(e.target.value) || 2.5 })}
                />
              </label>
            </div>
          </div>
          <div className="smart-pricing-panel">
            <h3>Live surge zones</h3>
            {(surge.zones || []).slice(0, 12).map((zone, index) => (
              <div key={`${zone.lat}-${zone.lng}-${index}`} className="smart-pricing-zone">
                <strong>{zone.label}</strong>
                <div>
                  Demand {zone.demand} · Supply {zone.supply} ·{" "}
                  <span className={zone.surge_active ? "smart-pricing-surge-active" : ""}>
                    {zone.surge_multiplier}x
                  </span>
                </div>
                <div className="beta__card-sub">Est. wait {Math.round((zone.estimated_wait_seconds || 0) / 60)} min</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "analytics" ? (
        <section className="smart-pricing-grid">
          <MetricCard label="Avg pickup ETA" value={analytics.avg_pickup_eta_minutes != null ? `${analytics.avg_pickup_eta_minutes} min` : "—"} />
          <MetricCard label="Avg dispatch time" value={analytics.avg_dispatch_time_seconds != null ? `${analytics.avg_dispatch_time_seconds}s` : "—"} />
          <MetricCard label="Acceptance rate" value={analytics.acceptance_rate_pct != null ? `${analytics.acceptance_rate_pct}%` : "—"} />
          <MetricCard label="Rejected requests" value={analytics.rejected_requests} />
          <MetricCard label="Driver utilization" value={analytics.driver_utilization_pct != null ? `${analytics.driver_utilization_pct}%` : "—"} />
          <MetricCard label="Avg idle time" value={analytics.avg_idle_minutes != null ? `${analytics.avg_idle_minutes} min` : "—"} />
        </section>
      ) : null}

      {tab === "simulator" ? (
        <section className="smart-pricing-panel">
          <h3>Pricing simulator (dry run — no production impact)</h3>
          <div className="smart-pricing-form">
            <label>
              Distance (km)
              <input type="number" value={simInput.distance_km} onChange={(e) => setSimInput({ ...simInput, distance_km: e.target.value })} />
            </label>
            <label>
              Duration (min)
              <input type="number" value={simInput.duration_minutes} onChange={(e) => setSimInput({ ...simInput, duration_minutes: e.target.value })} />
            </label>
            <label>
              Waiting (min)
              <input type="number" value={simInput.waiting_minutes} onChange={(e) => setSimInput({ ...simInput, waiting_minutes: e.target.value })} />
            </label>
            <label>
              Surge multiplier
              <input type="number" step="0.1" value={simInput.surge_multiplier} onChange={(e) => setSimInput({ ...simInput, surge_multiplier: e.target.value })} />
            </label>
            <label>
              Pickup label
              <input type="text" value={simInput.pickup_label} onChange={(e) => setSimInput({ ...simInput, pickup_label: e.target.value })} />
            </label>
            <label className="smart-pricing-flag">
              <input type="checkbox" checked={simInput.use_engine} onChange={(e) => setSimInput({ ...simInput, use_engine: e.target.checked })} />
              Use smart engine pricing
            </label>
          </div>
          <button type="button" className="beta__btn" onClick={handleSimulate} style={{ marginTop: "1rem" }}>
            Run simulation
          </button>
          {simResult ? (
            <div className="smart-pricing-grid" style={{ marginTop: "1rem" }}>
              <MetricCard label="Customer price" value={formatMoney(simResult.result?.customer_price)} />
              <MetricCard label="Driver earnings" value={formatMoney(simResult.result?.driver_earnings)} />
              <MetricCard label="Company commission" value={formatMoney(simResult.result?.company_commission)} />
              <MetricCard label="Legacy price" value={formatMoney(simResult.legacy_comparison?.customer_price)} sub={`Δ ${formatMoney(simResult.delta_customer_price)}`} />
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "ceo" ? (
        <section className="smart-pricing-grid">
          <MetricCard label="Total revenue" value={formatMoney(ceoData?.revenue_impact?.total_revenue)} />
          <MetricCard label="Surge revenue" value={formatMoney(ceoData?.surge_revenue)} />
          <MetricCard label="Average fare" value={formatMoney(ceoData?.average_fare)} />
          <MetricCard label="Profit per ride" value={formatMoney(ceoData?.profit_per_ride)} />
          <MetricCard label="Dispatch efficiency" value={ceoData?.dispatch_efficiency?.acceptance_rate_pct != null ? `${ceoData.dispatch_efficiency.acceptance_rate_pct}% accept` : "—"} />
          <MetricCard label="Driver utilization" value={ceoData?.driver_utilization_pct != null ? `${ceoData.driver_utilization_pct}%` : "—"} />
        </section>
      ) : null}

      <div className="smart-pricing-panel">
        <h3>Audit trail</h3>
        <div className="smart-pricing-audit">
          {auditTrail.length === 0 ? <p>No engine audit entries yet.</p> : null}
          {auditTrail.map((entry, index) => (
            <div key={`${entry.at}-${index}`} className="smart-pricing-audit-item">
              <strong>{entry.action}</strong> — {entry.summary}
              <div className="beta__card-sub">{entry.at} · {entry.user_email || "system"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
