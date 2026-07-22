import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  exportMultiCityReport,
  fetchMultiCityDashboard,
  updateMultiCityProfile,
} from "./multiCityApi";
import "../beta/BetaDashboard.css";
import "./MultiCityOperationsCenter.css";

const TABS = [
  { id: "admin", label: "City Management" },
  { id: "fleet", label: "Fleet by City" },
  { id: "financial", label: "Financial" },
  { id: "performance", label: "Performance" },
  { id: "ceo", label: "CEO Overview" },
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

function StatusPill({ status }) {
  return <span className={`multicity-status multicity-status--${status || "pilot"}`}>{status || "pilot"}</span>;
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function MultiCityOperationsCenter() {
  const [tab, setTab] = useState("admin");
  const [data, setData] = useState(null);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const params = selectedCityId ? { city_id: selectedCityId } : {};
      const payload = await fetchMultiCityDashboard(params);
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load multi-city dashboard");
    } finally {
      setLoading(false);
    }
  }, [selectedCityId]);

  useEffect(() => {
    load();
  }, [load]);

  const permissions = data?.permissions || {};
  const cities = data?.city_administration || [];
  const cityDetails = data?.cities || [];
  const ceo = data?.ceo_overview || {};
  const selectedCity = cityDetails[0] || {};

  const visibleTabs = TABS.filter((item) => {
    if (item.id === "ceo") return permissions.national;
    if (item.id === "financial") return permissions.finance || permissions.national;
    return permissions.operations || permissions.national;
  });

  const handleStatusChange = async (cityId, status) => {
    await updateMultiCityProfile(cityId, { status });
    await load();
  };

  const handleExport = async () => {
    const response = await exportMultiCityReport("csv");
    downloadBlob(response, "multi-city-operations.csv");
  };

  if (loading && !data) {
    return <div className="beta">Loading multi-city platform…</div>;
  }

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <h1>Multi-City Operations Platform</h1>
          <p className="beta__subtitle">Mauritania-wide city administration and performance</p>
        </div>
        <div className="multicity-toolbar">
          {permissions.national ? (
            <>
              <button type="button" className="beta__btn" onClick={handleExport}>
                Export CSV
              </button>
              <button type="button" className="beta__btn" onClick={() => exportMultiCityReport("pdf").then((r) => downloadBlob(r, "multi-city.pdf"))}>
                Export PDF
              </button>
            </>
          ) : null}
          <button type="button" className="beta__btn" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}

      <div className="multicity-city-picker">
        <select value={selectedCityId} onChange={(e) => setSelectedCityId(e.target.value)}>
          <option value="">All accessible cities</option>
          {cities.map((city) => (
            <option key={city.city_id} value={city.city_id}>
              {city.name} ({city.status})
            </option>
          ))}
        </select>
      </div>

      <div className="multicity-tabs">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`multicity-tab ${tab === item.id ? "multicity-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "admin" ? (
        <section className="beta__panel finance-table-wrap">
          <table className="beta__table">
            <thead>
              <tr>
                <th>City</th>
                <th>Status</th>
                <th>Ops Manager</th>
                <th>Finance Manager</th>
                <th>Support Manager</th>
                <th>Timezone</th>
                <th>Currency</th>
                <th>Zones</th>
                {permissions.city_admin ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city.city_id}>
                  <td>{city.name}</td>
                  <td><StatusPill status={city.status} /></td>
                  <td>{city.operations_manager_email || "—"}</td>
                  <td>{city.finance_manager_email || "—"}</td>
                  <td>{city.support_manager_email || "—"}</td>
                  <td>{city.timezone}</td>
                  <td>{city.currency}</td>
                  <td>{city.service_zones?.length || 0}</td>
                  {permissions.city_admin ? (
                    <td>
                      <select
                        value={city.status}
                        onChange={(e) => handleStatusChange(city.city_id, e.target.value)}
                      >
                        <option value="pilot">Pilot</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "fleet" ? (
        <section>
          {(cityDetails.length ? cityDetails : [{}]).map((entry) => {
            const fleet = entry.fleet || {};
            return (
              <div key={fleet.city_id || "all"} style={{ marginBottom: "1.5rem" }}>
                <h3>{fleet.city_name || "City"}</h3>
                <div className="beta__grid beta__grid--4">
                  <MetricCard label="Drivers" value={fleet.drivers} />
                  <MetricCard label="Couriers" value={fleet.couriers} />
                  <MetricCard label="Riders" value={fleet.riders} />
                  <MetricCard label="Online fleet" value={fleet.online_drivers} sub={`${fleet.online_couriers || 0} couriers`} />
                  <MetricCard label="Active rides" value={fleet.active_rides} />
                  <MetricCard label="Active deliveries" value={fleet.active_deliveries} />
                  <MetricCard label="Waiting riders" value={fleet.waiting_riders} />
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {tab === "financial" ? (
        <section>
          {cityDetails.map((entry) => {
            const fin = entry.financial || {};
            return (
              <div key={fin.city_id} style={{ marginBottom: "1.5rem" }}>
                <h3>{fin.city_name}</h3>
                <div className="beta__grid beta__grid--4">
                  <MetricCard label="Revenue" value={formatMoney(fin.revenue)} />
                  <MetricCard label="Commission" value={formatMoney(fin.commission)} />
                  <MetricCard label="Pending withdrawals" value={formatMoney(fin.withdrawals_pending)} />
                  <MetricCard label="Paid withdrawals" value={formatMoney(fin.withdrawals_paid)} />
                  <MetricCard label="Wallet balances" value={formatMoney(fin.wallet_balance)} />
                  <MetricCard label="Failed payments" value={fin.failed_payments?.count} sub={formatMoney(fin.failed_payments?.amount)} />
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {tab === "performance" ? (
        <section className="beta__panel finance-table-wrap">
          <table className="beta__table">
            <thead>
              <tr>
                <th>City</th>
                <th>Avg ETA</th>
                <th>Ride completion</th>
                <th>Delivery completion</th>
                <th>Acceptance rate</th>
                <th>Cancellation rate</th>
              </tr>
            </thead>
            <tbody>
              {cityDetails.map((entry) => {
                const perf = entry.performance || {};
                return (
                  <tr key={perf.city_id}>
                    <td>{perf.city_name}</td>
                    <td>{perf.average_eta_minutes != null ? `${perf.average_eta_minutes} min` : "—"}</td>
                    <td>{perf.ride_completion_rate_pct}%</td>
                    <td>{perf.delivery_completion_rate_pct}%</td>
                    <td>{perf.driver_acceptance_rate_pct}%</td>
                    <td>{perf.cancellation_rate_pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "ceo" && permissions.national ? (
        <section>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="National revenue" value={formatMoney(ceo.national_revenue)} />
            <MetricCard label="Active cities" value={ceo.active_city_count} sub={`${ceo.pilot_city_count || 0} pilot`} />
            <MetricCard label="Best performing" value={ceo.best_performing_city?.city_name} />
            <MetricCard label="Needs attention" value={ceo.cities_requiring_attention?.length || 0} />
          </div>
          <div className="beta__grid beta__grid--2" style={{ marginTop: "1rem" }}>
            <div className="beta__panel">
              <h3>Revenue by city</h3>
              {(ceo.revenue_by_city || []).map((row) => (
                <div key={row.city_id} className="beta__muted">
                  {row.city_name}: {formatMoney(row.revenue)}
                </div>
              ))}
            </div>
            <div className="beta__panel">
              <h3>Cities requiring attention</h3>
              {(ceo.cities_requiring_attention || []).map((row) => (
                <div key={row.city_id} className="beta__muted">
                  {row.city_name} — score {row.attention_score} · cancel {row.cancellation_rate_pct}%
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
