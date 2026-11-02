import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  SERVICE_CATALOG,
  SERVICE_LABELS,
  STATUS_LABELS,
  activateCity,
  createCity,
  deactivateCity,
  fetchCities,
  fetchCity,
  fetchCityAudit,
  fetchCityPeople,
  fetchCityPerformance,
  fetchCityPricing,
  fetchDuplicateCities,
  setCityLive,
  setCityService,
  updateCity,
  updateCityPricing,
} from "./cityManagementApi";
import "./CityManagementCenter.css";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

/**
 * City Management — Yala Admin → CEO Command Center.
 *
 * Adding, editing, activating and configuring cities is entirely dynamic: no
 * source change and no redeploy is required to add a city, and a newly added
 * city is never live. Live operations and live pricing stay Founder/CEO-only
 * on the server; this screen only offers what the signed-in role may do.
 */
const TABS = [
  { id: "details", label: "View Details" },
  { id: "services", label: "Configure Services" },
  { id: "pricing", label: "Configure Pricing" },
  { id: "performance", label: "City Performance" },
  { id: "people", label: "Drivers & Couriers" },
  { id: "audit", label: "Audit Log" },
];

const PRICING_FIELDS = [
  { key: "base_fare", label: "Base fare" },
  { key: "per_km", label: "Distance rate (per km)" },
  { key: "per_minute", label: "Time rate (per minute)" },
  { key: "minimum_fare", label: "Minimum fare" },
  { key: "waiting_per_minute", label: "Waiting fee (per minute)" },
  { key: "service_fee", label: "Service fee" },
  { key: "shared_base_fare", label: "Shared ride base fare" },
  { key: "shared_per_km", label: "Shared ride per km" },
  { key: "shared_discount_percent", label: "Shared ride discount (%)" },
  { key: "delivery_base_fare", label: "Delivery base fare" },
  { key: "delivery_per_km", label: "Delivery per km" },
  { key: "delivery_minimum_fare", label: "Delivery minimum fare" },
  { key: "surge_multiplier", label: "Pricing adjustment (1.00 = none)" },
];

const EMPTY_CITY = {
  name: "",
  name_fr: "",
  name_ar: "",
  region: "",
  latitude: "",
  longitude: "",
  code: "",
};

function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="cmc-modal-backdrop" role="dialog" aria-modal="true">
      <div className="cmc-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="cmc-modal-actions">
          <button type="button" className="cmc-btn cmc-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="cmc-btn cmc-btn-danger" onClick={onConfirm}>
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusClass(status) {
  if (status === "live") return "cmc-status cmc-status-live";
  if (status === "inactive") return "cmc-status cmc-status-off";
  return "cmc-status cmc-status-registered";
}

function money(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MRU`;
}

export default function CityManagementCenter() {
  const [cities, setCities] = useState([]);
  const [regions, setRegions] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [people, setPeople] = useState(null);
  const [audit, setAudit] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [tab, setTab] = useState("details");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_CITY);
  const [editForm, setEditForm] = useState(null);
  const [pricingForm, setPricingForm] = useState(null);

  const canManage = Boolean(capabilities?.can_manage);
  const canCeo = Boolean(capabilities?.can_ceo_actions);
  const schemaReady = Boolean(capabilities?.city_management_ready);
  const requiresMigration = capabilities?.requires_migration || "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchCities({
        search,
        region: regionFilter,
        status: statusFilter,
      });
      setCities(response.data.cities || []);
      setRegions(response.data.regions || []);
      setCapabilities(response.data.capabilities || null);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "City Management could not be loaded. Check your access level and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [search, regionFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = useCallback(async (cityId) => {
    if (!cityId) {
      setDetail(null);
      setPerformance(null);
      setPeople(null);
      return;
    }
    try {
      const [detailResponse, performanceResponse, peopleResponse] = await Promise.all([
        fetchCity(cityId),
        fetchCityPerformance(cityId),
        fetchCityPeople(cityId),
      ]);
      setDetail(detailResponse.data);
      setPerformance(performanceResponse.data.performance || null);
      setPeople(peopleResponse.data || null);
      setEditForm({
        name: detailResponse.data.city.name || "",
        name_fr: detailResponse.data.city.name_fr || "",
        name_ar: detailResponse.data.city.name_ar || "",
        latitude: detailResponse.data.city.latitude ?? "",
        longitude: detailResponse.data.city.longitude ?? "",
      });
      const pricing = detailResponse.data.pricing || {};
      setPricingForm(
        PRICING_FIELDS.reduce(
          (acc, field) => ({ ...acc, [field.key]: pricing.values?.[field.key] ?? "" }),
          {}
        )
      );
    } catch (err) {
      setError(err?.response?.data?.detail || "City details could not be loaded.");
    }
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (tab !== "audit") return;
    fetchCityAudit(selectedId ? { city_id: selectedId } : {})
      .then((response) => setAudit(response.data.entries || []))
      .catch(() => setAudit([]));
  }, [tab, selectedId]);

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === selectedId) || detail?.city || null,
    [cities, selectedId, detail]
  );

  const run = useCallback(async (action, successMessage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await action();
      if (successMessage) {
        setNotice(response?.data?.message || successMessage);
      }
      return response;
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "The action could not be completed. Nothing was changed."
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await load();
    if (selectedId) await loadDetail(selectedId);
  }, [load, loadDetail, selectedId]);

  const handleAddCity = () =>
    run(async () => {
      const response = await createCity(addForm);
      setShowAdd(false);
      setAddForm(EMPTY_CITY);
      await load();
      if (response?.data?.city?.id) setSelectedId(response.data.city.id);
      return response;
    }, "City registered. No service is live yet.");

  const handleSaveCity = () =>
    run(async () => {
      const response = await updateCity(selectedId, editForm);
      await refreshAll();
      return response;
    }, "City information updated.");

  const handleToggleCity = (isActive) =>
    run(async () => {
      const response = isActive
        ? await activateCity(selectedId, { reason: "Activated from City Management" })
        : await deactivateCity(selectedId, { reason: "Deactivated from City Management" });
      await refreshAll();
      return response;
    }, isActive ? "City activated." : "City deactivated.");

  const handleToggleLive = (isLive) =>
    run(async () => {
      const response = await setCityLive(selectedId, isLive, {
        reason: isLive ? "Live operations opened by CEO" : "Live operations closed by CEO",
      });
      await refreshAll();
      return response;
    }, isLive ? "Live operations opened." : "Live operations closed.");

  const handleToggleService = (service, category, isActive) =>
    run(async () => {
      const response = await setCityService(selectedId, {
        service,
        category,
        is_active: isActive,
        reason: isActive
          ? `Activated from City Management (${SERVICE_LABELS[service]})`
          : `Deactivated from City Management (${SERVICE_LABELS[service]})`,
      });
      await loadDetail(selectedId);
      return response;
    }, isActive ? "Service activated." : "Service deactivated.");

  const handleSavePricing = (activate) =>
    run(async () => {
      const response = await updateCityPricing(selectedId, {
        ...pricingForm,
        activate,
        reason: activate ? "Pricing activated by CEO" : "City pricing configured",
      });
      await loadDetail(selectedId);
      return response;
    }, activate ? "City pricing activated." : "City pricing saved (not live).");

  const handleLoadDuplicates = () =>
    run(async () => {
      const response = await fetchDuplicateCities();
      setDuplicates(response.data);
      return null;
    });

  const matrix = detail?.city?.services;
  const pricing = detail?.pricing;

  return (
    <div className="cmc-root">
      <header className="cmc-header">
        <div>
          <h1><AdminPageTitle>City Management</AdminPageTitle></h1>
          <p>
            Register and operate cities dynamically across Mauritania. Adding a city never
            requires a source change or a redeploy, and a new city is never live until the
            Founder/CEO opens it.
          </p>
        </div>
        <div className="cmc-header-actions">
          <button
            type="button"
            className="cmc-btn cmc-btn-ghost"
            onClick={handleLoadDuplicates}
            disabled={busy}
          >
            Review duplicates
          </button>
          <button
            type="button"
            className="cmc-btn cmc-btn-primary"
            onClick={() => setShowAdd((value) => !value)}
            disabled={!canManage}
            title={canManage ? "" : "Your role cannot add cities."}
          >
            {showAdd ? "Close" : "Add City"}
          </button>
        </div>
      </header>

      {!schemaReady && (
        <div className="cmc-banner cmc-banner-warn">
          <strong>Database update pending.</strong> City registration, editing, activation,
          reporting and auditing are available now. Per-city service activation, pricing and
          service areas become available once the pending database update
          <span title={requiresMigration || "cities.0005_city_management"}> has been applied</span>{" "}
          by the technical team. Nothing changes until you authorize it.
        </div>
      )}

      {error && <div className="cmc-banner cmc-banner-error">{error}</div>}
      {notice && <div className="cmc-banner cmc-banner-ok">{notice}</div>}

      {duplicates && (
        <div className="cmc-banner cmc-banner-info">
          <strong>Duplicate review:</strong> {duplicates.count} group(s).{" "}
          {duplicates.message}{" "}
          <button type="button" className="cmc-link" onClick={() => setDuplicates(null)}>
            dismiss
          </button>
        </div>
      )}

      {showAdd && (
        <section className="cmc-card">
          <h3>Add City</h3>
          <p className="cmc-hint">
            English name is the canonical key. The French and Arabic spellings are the
            official display names. Use validated coordinates only.
          </p>
          <div className="cmc-grid">
            {[
              ["name", "City name (English) *"],
              ["name_fr", "City name (French)"],
              ["name_ar", "City name (Arabic)"],
              ["code", "Operations code (e.g. ATR)"],
              ["latitude", "Latitude"],
              ["longitude", "Longitude"],
            ].map(([key, label]) => (
              <label key={key} className="cmc-field">
                <span>{label}</span>
                <input
                  type="text"
                  value={addForm[key]}
                  onChange={(event) =>
                    setAddForm((form) => ({ ...form, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <label className="cmc-field">
              <span>Region / Wilaya *</span>
              <input
                type="text"
                list="cmc-region-options"
                value={addForm.region}
                onChange={(event) =>
                  setAddForm((form) => ({ ...form, region: event.target.value }))
                }
              />
              <datalist id="cmc-region-options">
                {regions.map((region) => (
                  <option key={region.id} value={region.name} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="cmc-actions">
            <button
              type="button"
              className="cmc-btn cmc-btn-primary"
              onClick={handleAddCity}
              disabled={busy || !addForm.name || !addForm.region}
            >
              Register city
            </button>
          </div>
        </section>
      )}

      <section className="cmc-card">
        <div className="cmc-filters">
          <label className="cmc-field">
            <span>Search cities</span>
            <input
              type="search"
              placeholder="Name, region or Arabic spelling"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="cmc-field">
            <span>Region</span>
            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            >
              <option value="">All regions</option>
              {regions.map((region) => (
                <option key={region.id} value={region.name}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cmc-field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="live">Live</option>
              <option value="registered">Registered (not live)</option>
            </select>
          </label>
          <div className="cmc-counter">
            <strong>{cities.length}</strong>
            <span>cities shown</span>
          </div>
        </div>

        {loading ? (
          <p className="cmc-hint">Loading the city registry…</p>
        ) : cities.length === 0 ? (
          <p className="cmc-hint">No city matches the current filters.</p>
        ) : (
          <div className="cmc-table-wrap">
            <table className="cmc-table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Region</th>
                  <th>Arabic</th>
                  <th>Coordinates</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cities.map((city) => (
                  <tr
                    key={city.id}
                    className={city.id === selectedId ? "cmc-row-selected" : ""}
                  >
                    <td>
                      <strong>{city.name}</strong>
                      <div className="cmc-sub">{city.name_fr || "—"}</div>
                    </td>
                    <td>{city.region}</td>
                    <td dir="rtl">{city.name_ar || "—"}</td>
                    <td className="cmc-mono">
                      {Number(city.latitude).toFixed(4)}, {Number(city.longitude).toFixed(4)}
                    </td>
                    <td>
                      <span className={statusClass(city.operational_status)}>
                        {STATUS_LABELS[city.operational_status] || city.operational_status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cmc-btn cmc-btn-ghost"
                        onClick={() => {
                          setSelectedId(city.id);
                          setTab("details");
                        }}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCity && (
        <section className="cmc-card cmc-detail">
          <div className="cmc-detail-head">
            <div>
              <h3>
                {selectedCity.name}{" "}
                <span className={statusClass(selectedCity.operational_status)}>
                  {STATUS_LABELS[selectedCity.operational_status] ||
                    selectedCity.operational_status}
                </span>
              </h3>
              <p className="cmc-hint">
                {selectedCity.region} · {selectedCity.country} ·{" "}
                {selectedCity.iso_country_code} · {selectedCity.timezone}
                {selectedCity.code ? ` · code ${selectedCity.code}` : ""}
              </p>
            </div>
            <div className="cmc-header-actions">
              <button
                type="button"
                className="cmc-btn cmc-btn-ghost"
                disabled={!canManage || busy}
                onClick={() =>
                  setConfirm({
                    title: selectedCity.is_active ? "Deactivate city?" : "Activate city?",
                    message: selectedCity.is_active
                      ? `${selectedCity.name} will stop being offered to riders and drivers. No record, driver, rider or ride data is deleted.`
                      : `${selectedCity.name} will be available again in the registry. Services stay exactly as they are.`,
                    confirmLabel: selectedCity.is_active ? "Deactivate" : "Activate",
                    onConfirm: () => {
                      setConfirm(null);
                      handleToggleCity(!selectedCity.is_active);
                    },
                  })
                }
              >
                {selectedCity.is_active ? "Deactivate City" : "Activate City"}
              </button>
              <button
                type="button"
                className="cmc-btn cmc-btn-primary"
                disabled={!canCeo || busy || !schemaReady}
                title={
                  canCeo
                    ? "Founder/CEO authorization required"
                    : "Only the Founder/CEO can open live operations."
                }
                onClick={() =>
                  setConfirm({
                    title: selectedCity.is_live
                      ? "Close live operations?"
                      : "Open live operations?",
                    message: selectedCity.is_live
                      ? `Live ride and delivery operations will stop for ${selectedCity.name}.`
                      : `${selectedCity.name} will begin accepting real bookings for every service you have activated. This is the Founder/CEO authorization step.`,
                    confirmLabel: selectedCity.is_live
                      ? "Close operations"
                      : "Open operations",
                    onConfirm: () => {
                      setConfirm(null);
                      handleToggleLive(!selectedCity.is_live);
                    },
                  })
                }
              >
                {selectedCity.is_live ? "Close Live Operations" : "Open Live Operations"}
              </button>
            </div>
          </div>

          <nav className="cmc-tabs">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`cmc-tab ${tab === entry.id ? "cmc-tab-active" : ""}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {tab === "details" && editForm && (
            <div>
              <div className="cmc-grid">
                {[
                  ["name", "City name (English)"],
                  ["name_fr", "City name (French)"],
                  ["name_ar", "City name (Arabic)"],
                  ["latitude", "Latitude"],
                  ["longitude", "Longitude"],
                ].map(([key, label]) => (
                  <label key={key} className="cmc-field">
                    <span>{label}</span>
                    <input
                      type="text"
                      value={editForm[key]}
                      onChange={(event) =>
                        setEditForm((form) => ({ ...form, [key]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="cmc-actions">
                <button
                  type="button"
                  className="cmc-btn cmc-btn-primary"
                  disabled={!canManage || busy}
                  onClick={handleSaveCity}
                >
                  Save city information
                </button>
              </div>
            </div>
          )}

          {tab === "services" && (
            <div>
              {!schemaReady ? (
                <p className="cmc-hint">
                  Service activation requires <code>{requiresMigration}</code> to be
                  applied. No service is live in the meantime.
                </p>
              ) : (
                Object.entries(SERVICE_LABELS).map(([service, label]) => (
                  <div key={service} className="cmc-service-block">
                    <h4>{label}</h4>
                    <div className="cmc-service-rows">
                      {SERVICE_CATALOG[service].map(({ category, label: categoryLabel }) => {
                        const row = (matrix?.services?.[service]?.categories || []).find(
                          (entry) => entry.category === category
                        );
                        const isActive = Boolean(row?.is_active);
                        return (
                          <div key={category} className="cmc-service-row">
                            <span>{categoryLabel}</span>
                            <span
                              className={
                                isActive
                                  ? "cmc-status cmc-status-live"
                                  : "cmc-status cmc-status-off"
                              }
                            >
                              {isActive ? "Active" : "Inactive"}
                            </span>
                            <button
                              type="button"
                              className="cmc-btn cmc-btn-ghost"
                              disabled={!canManage || busy}
                              onClick={() =>
                                setConfirm({
                                  title: isActive
                                    ? `Deactivate ${categoryLabel}?`
                                    : `Activate ${categoryLabel}?`,
                                  message: isActive
                                    ? `${categoryLabel} will stop being offered in ${selectedCity.name}. Existing records are preserved.`
                                    : `${categoryLabel} will be switched on for ${selectedCity.name}. It still will not take real bookings until the Founder/CEO opens live operations.`,
                                  confirmLabel: isActive ? "Deactivate" : "Activate",
                                  onConfirm: () => {
                                    setConfirm(null);
                                    handleToggleService(service, category, !isActive);
                                  },
                                })
                              }
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "pricing" && pricingForm && (
            <div>
              <p className="cmc-hint">
                Pricing is configured per city. Existing pricing rules in other cities are
                never copied here, and nothing goes live until the Founder/CEO activates it.
                {pricing?.is_active ? " This city pricing is live." : " This city pricing is not live."}
              </p>
              {!schemaReady ? (
                <p className="cmc-hint">
                  City pricing requires <code>{requiresMigration}</code> to be applied.
                </p>
              ) : (
                <>
                  <div className="cmc-grid">
                    {PRICING_FIELDS.map((field) => (
                      <label key={field.key} className="cmc-field">
                        <span>{field.label}</span>
                        <input
                          type="text"
                          value={pricingForm[field.key] ?? ""}
                          onChange={(event) =>
                            setPricingForm((form) => ({
                              ...form,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="cmc-actions">
                    <button
                      type="button"
                      className="cmc-btn cmc-btn-ghost"
                      disabled={!canManage || busy}
                      onClick={() => handleSavePricing(false)}
                    >
                      Save pricing (not live)
                    </button>
                    <button
                      type="button"
                      className="cmc-btn cmc-btn-primary"
                      disabled={!canCeo || busy}
                      title={
                        canCeo ? "" : "Only the Founder/CEO can activate live pricing."
                      }
                      onClick={() =>
                        setConfirm({
                          title: "Activate live pricing?",
                          message: `Live pricing will apply to ${selectedCity.name}. This is the Founder/CEO authorization step and changes real financial behaviour.`,
                          confirmLabel: "Activate pricing",
                          onConfirm: () => {
                            setConfirm(null);
                            handleSavePricing(true);
                          },
                        })
                      }
                    >
                      Activate live pricing
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div>
              {!performance ? (
                <p className="cmc-hint">Loading verified city figures…</p>
              ) : (
                <>
                  <div className="cmc-metrics">
                    {[
                      ["Total registered drivers", performance.total_drivers],
                      ["Approved drivers", performance.approved_drivers],
                      ["Active drivers", performance.active_drivers],
                      ["Total couriers", performance.total_couriers],
                      ["Active couriers", performance.active_couriers],
                      ["Total riders", performance.total_riders],
                      ["Completed rides", performance.completed_rides],
                      ["Cancelled rides", performance.cancelled_rides],
                      ["Completed deliveries", performance.completed_deliveries],
                      ["Cancelled deliveries", performance.cancelled_deliveries],
                      ["Gross transaction value", money(performance.gross_transaction_value)],
                      ["Platform revenue", money(performance.platform_revenue)],
                    ].map(([label, value]) => (
                      <div key={label} className="cmc-metric">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="cmc-hint">
                    Verified database counts. Couriers are excluded from driver counts, only
                    completed rides and deliveries contribute money, and wallet liabilities
                    are never counted as revenue.
                  </p>
                </>
              )}
            </div>
          )}

          {tab === "people" && (
            <div className="cmc-people">
              {!people ? (
                <p className="cmc-hint">Loading drivers and couriers…</p>
              ) : (
                <>
                  <div className="cmc-people-col">
                    <h4>Drivers in {people.city_name} ({people.total_drivers})</h4>
                    {people.drivers?.length ? (
                      <ul className="cmc-list">
                        {people.drivers.map((driver) => (
                          <li key={driver.id}>
                            <strong>{driver.name}</strong>
                            <span className="cmc-sub">
                              {driver.status || "no profile"} ·{" "}
                              {driver.is_available ? "available" : "unavailable"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cmc-hint">No driver is registered in this city.</p>
                    )}
                  </div>
                  <div className="cmc-people-col">
                    <h4>Couriers in {people.city_name} ({people.total_couriers})</h4>
                    {people.couriers?.length ? (
                      <ul className="cmc-list">
                        {people.couriers.map((courier) => (
                          <li key={courier.id}>
                            <strong>{courier.name}</strong>
                            <span className="cmc-sub">
                              {courier.status || "no profile"} ·{" "}
                              {courier.is_available ? "available" : "unavailable"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cmc-hint">No courier is registered in this city.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "audit" && (
            <div>
              {audit.length === 0 ? (
                <p className="cmc-hint">No administrative change recorded yet.</p>
              ) : (
                <div className="cmc-table-wrap">
                  <table className="cmc-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>Field</th>
                        <th>From</th>
                        <th>To</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry) => (
                        <tr key={entry.id}>
                          <td className="cmc-mono">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td>{entry.action}</td>
                          <td>{entry.field_name || "—"}</td>
                          <td>{entry.old_value || "—"}</td>
                          <td>{entry.new_value || "—"}</td>
                          <td>{entry.actor || "system"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}



