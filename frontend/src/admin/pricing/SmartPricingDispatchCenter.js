import React, { useCallback, useEffect, useMemo, useState } from "react";

import { isMajorOperatingCityName } from "../city/majorOperatingCities";

import { SearchableSelect, formatMoneyOrDash } from "../components/library";
import { resolveRegion } from "../city/mauritaniaGeoIdentity";
import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";
import {
  fetchCeoDashboard,
  fetchRegionCityTree,
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

/**
 * Ride types the smart-engine pricing rules are keyed by.
 *
 * The engine stores pricing per ride type and the simulator is priced the same
 * way, so the operator must be able to choose the type they are editing. The
 * previous version hard-coded "regular" and offered no control, which silently
 * wrote every pricing edit against the `regular` row.
 */
const RIDE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "xl", label: "XL" },
  { value: "comfort", label: "Comfort" },
  { value: "share", label: "Share" },
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
  // Separate from `error` so a failed *save* never masks a successful *load*.
  // Every write handler used to swallow its rejection entirely, so a rejected
  // PATCH produced no feedback at all and the control silently reverted.
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  // Which ride type the pricing rules and the simulator are scoped to. Previously
  // hard-coded to "regular", so every pricing edit silently hit the regular row.
  const [rideType, setRideType] = useState("regular");
  // Geography for the dependent Region/Wilaya -> City filters. `selectedCityId`
  // (above) is the value the smart-engine actually consumes.
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [geoError, setGeoError] = useState("");
  const [simInput, setSimInput] = useState({
    distance_km: 8,
    duration_minutes: 20,
    waiting_minutes: 0,
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
      setLoading(true);
      const params = selectedCityId ? { city_id: selectedCityId } : {};
      const payload = await fetchSmartEngineDashboard(params);
      setData(payload);
      if (tab === "ceo") {
        const ceo = await fetchCeoDashboard(params);
        setCeoData(ceo);
      }
    } catch (err) {
      // Shared mapper: a 401/403/404/5xx/unreachable backend each produce a
      // distinct, actionable message instead of a raw axios string.
      setError(apiErrorMessage(err, { resource: "the smart engine", action: "load" }));
    } finally {
      setLoading(false);
    }
  }, [selectedCityId, tab]);

  useEffect(() => {
    load();
  }, [load]);
  /**
   * Load the Region (wilaya) -> City tree once.
   *
   * Kept separate from `load()` so switching tabs or saving a setting does not
   * refetch geography. A failure here degrades only the filters: the page falls
   * back to the cities the smart engine itself reports, so the operator is never
   * left without a city control, and the error is still surfaced rather than hidden.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tree = await fetchRegionCityTree();
        if (!cancelled) setRegions(Array.isArray(tree) ? tree : []);
      } catch (err) {
        if (!cancelled) {
          setGeoError(apiErrorMessage(err, { resource: "the region list", action: "load" }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Region (wilaya) options.
   *
   * The value is the region NAME, matching the convention already established by
   * City Management; the label is the canonical wilaya name resolved through the
   * shared geo-identity module so the two pages agree.
   */
  const regionOptions = useMemo(
    () => [
      { value: "", label: "All regions", description: "No region filter" },
      ...regions.map((region) => {
        const geo = resolveRegion(region.name);
        const wilaya = geo.wilaya || region.name;
        // `Region` holds BOTH true wilayas and city-seat rows (Nouakchott,
        // Nouadhibou, Atar, Kaedi, Rosso). `resolveRegion` maps a seat to its
        // parent wilaya, so two rows can resolve to the SAME label — e.g. "Adrar"
        // (4 cities) and "Atar" (1 city) both display as "Adrar". Disambiguate with
        // the raw name so the operator can tell them apart and filter correctly.
        const label = wilaya === region.name ? wilaya : `${wilaya} (${region.name})`;
        return {
          value: region.name,
          label,
          description: `${(region.cities || []).length} cities`,
        };
      }),
    ],
    [regions]
  );

  /**
   * City options — DEPENDENT on the selected region.
   *
   * With a region chosen, only that region's cities are offered. With no region,
   * every city is offered. If the geography request failed we fall back to the
   * smart engine's own city list so the control is never empty.
   */
  const cityOptions = useMemo(() => {
    const base = [{ value: "", label: "All cities", description: "No city filter" }];
    if (regions.length === 0) {
      return [
        ...base,
        ...(data?.cities || [])
          .filter((city) => isMajorOperatingCityName(city.name))
          .map((city) => ({
            value: String(city.id),
            label: city.name,
          })),
      ];
    }
    const scoped = selectedRegion
      ? regions.filter((region) => region.name === selectedRegion)
      : regions;
    const seen = new Set();
    const cities = [];
    scoped.forEach((region) => {
      (region.cities || []).forEach((city) => {
        if (!isMajorOperatingCityName(city.name)) return;
        const value = String(city.id);
        if (seen.has(value)) return;
        seen.add(value);
        cities.push({ value, label: city.name, description: region.name });
      });
    });
    return [...base, ...cities];
  }, [regions, selectedRegion, data]);

  /**
   * Changing the region must clear the city: the previously chosen city may not
   * belong to the newly chosen region, and the engine would otherwise stay scoped
   * to a city outside the region the operator just selected.
   */
  const handleRegionChange = useCallback((value) => {
    setSelectedRegion(value || "");
    setSelectedCityId("");
  }, []);




  /**
   * Wrap a write so a rejected PATCH/POST can never fail silently.
   *
   * Before this, every handler below was `async` with no catch: a 400/403/500
   * produced an unhandled rejection, the operator saw nothing, and the control
   * simply reverted on the next load. Now a failure is surfaced and the panel is
   * reloaded only when the write actually succeeded.
   */
  const runWrite = useCallback(
    async (fn, { successLabel } = {}) => {
      setActionError("");
      setNotice("");
      setSaving(true);
      try {
        await fn();
        await load();
        if (successLabel) setNotice(successLabel);
        return true;
      } catch (err) {
        setActionError(
          apiErrorMessage(err, { resource: "the smart engine settings", action: "save" })
        );
        // Re-read so the UI reflects the server's true state, not the optimistic one.
        await load();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const flags = data?.engine_flags || {};
  const dispatchRules = data?.dispatch_rules || {};
  const pricingRules = data?.pricing_rules || {};
  const surge = data?.surge || {};
  const analytics = data?.dispatch_analytics || {};
  const insights = data?.dispatch_insights?.rides || [];
  const auditTrail = data?.audit_trail || [];

  const handleFlagToggle = async (key) =>
    runWrite(() => updateEngineFlags({ [key]: !flags[key] }), {
      successLabel: "Engine flag updated.",
    });

  /**
   * Persist one dispatch-scoring weight.
   *
   * This is wired to `onBlur`, not `onChange`. It previously ran on every
   * keystroke, so typing "0.5" issued three PATCHes ("0", "0.", "0.5") — and
   * `parseFloat("0.") || 0` wrote 0 in between.
   */
  const handleWeightSave = async (key, value) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      setActionError(`"${key}" must be a number between 0 and 1. Nothing was saved.`);
      return false;
    }
    const weights = { ...(dispatchRules.weights || {}), [key]: parsed };
    return runWrite(() => updateDispatchRules({ weights }, selectedCityId || undefined), {
      successLabel: `Dispatch weight "${key}" saved.`,
    });
  };

  const handlePricingSave = async (field, value) =>
    runWrite(() => updatePricingRules({ [field]: value }, selectedCityId || undefined, rideType), {
      successLabel: `Pricing rule "${field}" saved for ${rideType}.`,
    });

  const handleSurgeSave = async (payload) =>
    runWrite(() => updateSurgeConfig(payload), { successLabel: "Surge configuration saved." });

  const handleSimulate = async () => {
    setActionError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        ...simInput,
        ride_type: rideType,
        city_id: selectedCityId ? Number(selectedCityId) : undefined,
      };
      const result = await runPricingSimulation(payload);
      setSimResult(result);
    } catch (err) {
      setActionError(
        apiErrorMessage(err, { resource: "the pricing simulation", action: "run" })
      );
    } finally {
      setSaving(false);
    }
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
          <SearchableSelect
            label="Region / Wilaya"
            icon="🗺"
            value={selectedRegion}
            onChange={handleRegionChange}
            options={regionOptions}
            placeholder="All regions"
            searchPlaceholder="Search region…"
            disabled={regions.length === 0}
          />
          <SearchableSelect
            label="City"
            icon="📍"
            value={selectedCityId}
            onChange={(value) => setSelectedCityId(value ?? "")}
            options={cityOptions}
            placeholder={selectedRegion ? "All cities in region" : "All cities"}
            searchPlaceholder="Search city…"
            disabled={regions.length === 0 && (data?.cities || []).length === 0}
          />
          <SearchableSelect
            label="Ride type"
            icon="🚕"
            value={rideType}
            onChange={(value) => setRideType(value || "regular")}
            options={RIDE_TYPE_OPTIONS}
            placeholder="Regular"
            searchPlaceholder="Search ride type…"
          />
          <button type="button" className="beta__btn" onClick={load} disabled={saving}>
            {saving ? "Working…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}
      {geoError ? (
        // The region/city filters degrade to the engine's own city list, so this is
        // a warning about reduced filtering, not a page failure. Shown, never hidden.
        <div className="beta__error" role="status">
          {geoError} Region and city filters are limited to the cities the engine reports.
        </div>
      ) : null}
      {actionError ? (
        <div className="beta__error" role="alert">
          {actionError}
        </div>
      ) : null}
      {notice ? (
        <div className="beta__card-sub" role="status">
          {notice}
        </div>
      ) : null}

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
                // The label key includes the stored value so the input remounts
                // after a successful save+reload and shows the server's value.
                <label key={`${key}-${dispatchRules.weights?.[key] ?? 0}`}>
                  {label}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    defaultValue={dispatchRules.weights?.[key] ?? 0}
                    disabled={saving}
                    onBlur={(e) => handleWeightSave(key, e.target.value)}
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
          <h3>Dynamic pricing rules — {rideType}</h3>
          <p className="beta__card-sub">
            These values apply to the <strong>{rideType}</strong> ride type
            {selectedCityId ? " in the selected city" : " platform-wide"}. Change the
            Ride type control in the header to edit another type.
          </p>
          <div className="smart-pricing-form">
            {[
              ["base_fare", "Base fare (MRU)"],
              // Returned by the API but previously not editable in the UI.
              // A scalar money value; null means "no floor configured".
              ["minimum_fare", "Minimum fare (MRU)"],
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
                  // Keyed on the server value so a reload shows the saved number.
                  key={`surge-max-${surge.config?.max_multiplier ?? "unset"}`}
                  defaultValue={surge.config?.max_multiplier ?? ""}
                  disabled={saving}
                  onBlur={(e) => {
                    const raw = e.target.value;
                    // No fabricated fallback: an empty or non-numeric entry is
                    // reported instead of silently saving 2.5.
                    if (raw === "") return;
                    const parsed = Number.parseFloat(raw);
                    if (Number.isNaN(parsed)) {
                      setActionError(
                        "Max multiplier must be a number between 1 and 5. Nothing was saved."
                      );
                      return;
                    }
                    handleSurgeSave({ max_multiplier: parsed });
                  }}
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
          <p className="beta__card-sub">
            Simulated as the <strong>{rideType}</strong> ride type
            {selectedCityId ? " in the selected city" : ""}. Change the Ride type
            control in the header to simulate another type.
          </p>
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
          <button
            type="button"
            className="beta__btn"
            onClick={handleSimulate}
            disabled={saving}
            style={{ marginTop: "1rem" }}
          >
            {saving ? "Running…" : "Run simulation"}
          </button>
          {simResult ? (
            <div className="smart-pricing-grid" style={{ marginTop: "1rem" }}>
              <MetricCard label="Customer price" value={formatMoneyOrDash(simResult.result?.customer_price)} />
              <MetricCard label="Driver earnings" value={formatMoneyOrDash(simResult.result?.driver_earnings)} />
              <MetricCard label="Company commission" value={formatMoneyOrDash(simResult.result?.company_commission)} />
              <MetricCard label="Legacy price" value={formatMoneyOrDash(simResult.legacy_comparison?.customer_price)} sub={`Δ ${formatMoneyOrDash(simResult.delta_customer_price)}`} />
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "ceo" ? (
        <section className="smart-pricing-grid">
          <MetricCard label="Total revenue" value={formatMoneyOrDash(ceoData?.revenue_impact?.total_revenue)} />
          <MetricCard label="Surge revenue" value={formatMoneyOrDash(ceoData?.surge_revenue)} />
          <MetricCard label="Average fare" value={formatMoneyOrDash(ceoData?.average_fare)} />
          <MetricCard label="Profit per ride" value={formatMoneyOrDash(ceoData?.profit_per_ride)} />
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
