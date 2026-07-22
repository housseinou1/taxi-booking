import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  assignFleetTraining,
  approveFleetDocument,
  BADGE_LABELS,
  exportFleetReport,
  fetchFleetDashboard,
  notifyFleetDriver,
  reactivateFleetDriver,
  rejectFleetDocument,
  REPORT_TYPES,
  suspendFleetDriver,
} from "./fleetApi";
import "../beta/BetaDashboard.css";
import "./FleetPerformanceCenter.css";

const TABS = [
  { id: "overview", label: "Fleet Overview" },
  { id: "performance", label: "Driver Performance" },
  { id: "documents", label: "Documents" },
  { id: "ceo", label: "CEO Dashboard" },
  { id: "reports", label: "Reports" },
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

function FleetMap({ liveMap, heatMap }) {
  const markers = useMemo(() => {
    const live = liveMap?.markers?.drivers || [];
    const heat = (heatMap?.points || []).slice(0, 40).map((point, index) => ({
      id: `heat-${index}`,
      lat: point.lat,
      lng: point.lng,
      kind: "heat",
      label: point.label || "Demand",
      intensity: point.intensity,
    }));
    return [...live, ...heat];
  }, [liveMap, heatMap]);

  if (!markers.length) {
    return <div className="fleet-map">No live map data</div>;
  }

  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return (
    <div className="fleet-map">
      {markers.map((marker) => {
        const x = maxLng === minLng ? 50 : ((marker.lng - minLng) / (maxLng - minLng)) * 100;
        const y = maxLat === minLat ? 50 : ((maxLat - marker.lat) / (maxLat - minLat)) * 100;
        const kind = marker.kind === "heat" ? "heat" : marker.kind || "driver";
        return (
          <span
            key={`${kind}-${marker.id}`}
            className={`fleet-map__marker fleet-map__marker--${kind}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              opacity: marker.intensity != null ? 0.4 + marker.intensity * 0.6 : 1,
            }}
            title={marker.label}
          />
        );
      })}
    </div>
  );
}

function BadgeList({ badges = [] }) {
  if (!badges.length) return "—";
  return badges.map((badge) => (
    <span key={badge} className="fleet-badge">
      {BADGE_LABELS[badge] || badge}
    </span>
  ));
}

export default function FleetPerformanceCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [trainingType, setTrainingType] = useState("service_quality");
  const [actionNotice, setActionNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetchFleetDashboard();
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load fleet center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const overview = data?.overview || {};
  const map = data?.map || {};
  const drivers = data?.drivers || [];
  const documents = data?.documents || {};
  const ceo = data?.ceo || {};

  const handleExport = async (type, format) => {
    const response = await exportFleetReport(type, format);
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}.${format === "pdf" ? "pdf" : "csv"}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const runDriverAction = async (action, driver) => {
    setActionNotice("");
    try {
      if (action === "suspend") await suspendFleetDriver(driver.user_id);
      if (action === "reactivate") await reactivateFleetDriver(driver.user_id);
      if (action === "notify") {
        await notifyFleetDriver(driver.user_id, { message: notifyMessage || "Message from Yala Operations" });
        setNotifyMessage("");
      }
      if (action === "training") {
        await assignFleetTraining(driver.user_id, { training_type: trainingType });
      }
      setActionNotice(`Action completed for ${driver.driver_name || driver.email}`);
      setSelectedDriver(null);
      await load();
    } catch (err) {
      setActionNotice(err?.response?.data?.detail || "Action failed");
    }
  };

  const runDocumentAction = async (action, docId) => {
    setActionNotice("");
    try {
      if (action === "approve") await approveFleetDocument(docId);
      if (action === "reject") await rejectFleetDocument(docId, "Rejected from fleet center");
      setActionNotice(`Document ${action}d`);
      await load();
    } catch (err) {
      setActionNotice(err?.response?.data?.detail || "Document action failed");
    }
  };

  if (loading && !data) {
    return <div className="beta">Loading fleet center…</div>;
  }

  return (
    <div className="beta">
      <a href="/admin" className="beta__back">
        ← Admin
      </a>
      <div className="beta__header">
        <div>
          <h1 className="beta__title">Fleet &amp; Driver Performance Center</h1>
          <p className="beta__subtitle">Operations, supervisors, and CEO fleet intelligence</p>
        </div>
        <button type="button" className="beta__btn" onClick={load}>
          Refresh
        </button>
      </div>

      {error ? <div className="beta__error">{error}</div> : null}
      {actionNotice ? <div className="beta__panel">{actionNotice}</div> : null}

      <div className="fleet-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`fleet-tab ${tab === item.id ? "fleet-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="beta__section">
            <h2 className="beta__section-title">Fleet Overview</h2>
            <div className="beta__grid beta__grid--wide">
              <MetricCard label="Total registered" value={overview.total_registered} />
              <MetricCard label="Approved" value={overview.approved_drivers} />
              <MetricCard label="Online" value={overview.online_drivers} />
              <MetricCard label="Busy" value={overview.busy_drivers} />
              <MetricCard label="Offline" value={overview.offline_drivers} />
              <MetricCard label="Suspended" value={overview.suspended_drivers} />
              <MetricCard label="Expired documents" value={overview.expired_document_drivers} />
              <MetricCard label="Waiting riders" value={overview.waiting_riders} />
            </div>
          </section>
          <section className="beta__section">
            <h2 className="beta__section-title">Live map &amp; heat map</h2>
            <FleetMap liveMap={map.live_map} heatMap={map.heat_map} />
          </section>
          <section className="beta__section">
            <div className="beta__grid">
              <div className="beta__panel">
                <h4>Busy zones</h4>
                <div className="fleet-zone-list">
                  {(map.busy_zones || []).slice(0, 8).map((zone) => (
                    <div key={`busy-${zone.lat}-${zone.lng}`} className="fleet-zone-item">
                      {zone.label} — {zone.waiting_riders} waiting / {zone.drivers_nearby} drivers
                    </div>
                  ))}
                </div>
              </div>
              <div className="beta__panel">
                <h4>Low coverage zones</h4>
                <div className="fleet-zone-list">
                  {(map.low_coverage_zones || []).slice(0, 8).map((zone) => (
                    <div key={`low-${zone.lat}-${zone.lng}`} className="fleet-zone-item">
                      {zone.label} — demand ratio {zone.demand_supply_ratio}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {tab === "performance" ? (
        <section className="beta__section">
          <h2 className="beta__section-title">Driver Performance ({drivers.length})</h2>
          <div className="beta__panel fleet-table-wrap">
            <table className="beta__table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Accept %</th>
                  <th>Cancel %</th>
                  <th>Complete %</th>
                  <th>Rating</th>
                  <th>Trips</th>
                  <th>Rev today</th>
                  <th>Rev week</th>
                  <th>Rev month</th>
                  <th>Wallet</th>
                  <th>Badges</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.driver_id}>
                    <td>{driver.driver_name || driver.email}</td>
                    <td>{driver.current_status}</td>
                    <td>{driver.acceptance_rate}%</td>
                    <td>{driver.cancellation_rate}%</td>
                    <td>{driver.completion_rate}%</td>
                    <td>{driver.rating_average}</td>
                    <td>{driver.total_trips}</td>
                    <td>{driver.revenue_today}</td>
                    <td>{driver.revenue_week}</td>
                    <td>{driver.revenue_month}</td>
                    <td>{driver.wallet_balance}</td>
                    <td>
                      <BadgeList badges={driver.badges} />
                    </td>
                    <td>
                      <button type="button" className="beta__btn" onClick={() => setSelectedDriver(driver)}>
                        Actions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedDriver ? (
            <div className="fleet-modal">
              <h4>{selectedDriver.driver_name || selectedDriver.email}</h4>
              <p>
                Last online: {selectedDriver.last_online ? new Date(selectedDriver.last_online).toLocaleString() : "—"}
              </p>
              <div className="fleet-actions">
                <button type="button" className="beta__btn" onClick={() => runDriverAction("suspend", selectedDriver)}>
                  Suspend
                </button>
                <button type="button" className="beta__btn" onClick={() => runDriverAction("reactivate", selectedDriver)}>
                  Reactivate
                </button>
              </div>
              <label>
                Send notification
                <textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} rows={3} />
              </label>
              <button type="button" className="beta__btn beta__btn--primary" onClick={() => runDriverAction("notify", selectedDriver)}>
                Send notification
              </button>
              <label>
                Assign training
                <select value={trainingType} onChange={(e) => setTrainingType(e.target.value)}>
                  <option value="service_quality">Service quality</option>
                  <option value="safety">Safety</option>
                  <option value="navigation">Navigation &amp; GPS</option>
                  <option value="payments">Payments &amp; wallet</option>
                </select>
              </label>
              <button type="button" className="beta__btn" onClick={() => runDriverAction("training", selectedDriver)}>
                Assign training
              </button>
              <button type="button" className="beta__btn" onClick={() => setSelectedDriver(null)}>
                Close
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "documents" ? (
        <section className="beta__section">
          <h2 className="beta__section-title">Document Monitoring</h2>
          <div className="beta__grid beta__grid--wide">
            <MetricCard label="Valid" value={documents.summary?.valid} />
            <MetricCard label="Expiring 30d" value={documents.summary?.expiring_30d} />
            <MetricCard label="Expiring 15d" value={documents.summary?.expiring_15d} />
            <MetricCard label="Expiring 7d" value={documents.summary?.expiring_7d} />
            <MetricCard label="Expiring 1d" value={documents.summary?.expiring_1d} />
            <MetricCard label="Expired" value={documents.summary?.expired} />
          </div>
          {["expired", "expiring_1d", "expiring_7d", "expiring_15d", "expiring_30d"].map((bucket) => (
            <div key={bucket} className="beta__panel" style={{ marginTop: 12 }}>
              <h4>{bucket.replace(/_/g, " ")}</h4>
              <table className="beta__table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Document</th>
                    <th>Expires</th>
                    <th>Days</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(documents.buckets?.[bucket] || []).slice(0, 20).map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.driver_email}</td>
                      <td>{doc.document_label}</td>
                      <td>{doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : "—"}</td>
                      <td>{doc.days_remaining ?? "—"}</td>
                      <td className="fleet-actions">
                        <button type="button" className="beta__btn" onClick={() => runDocumentAction("approve", doc.id)}>
                          Approve
                        </button>
                        <button type="button" className="beta__btn" onClick={() => runDocumentAction("reject", doc.id)}>
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "ceo" ? (
        <>
          <section className="beta__section">
            <h2 className="beta__section-title">CEO Fleet Metrics</h2>
            <div className="beta__grid beta__grid--wide">
              <MetricCard label="Fleet utilization" value={`${ceo.fleet_utilization_pct ?? "—"}%`} />
              <MetricCard label="Avg earnings (month)" value={ceo.average_earnings_month} />
              <MetricCard label="Acceptance trend" value={ceo.acceptance_trend?.current_avg} />
              <MetricCard
                label="Cancellation trend"
                value={`${ceo.cancellation_trend?.current_pct ?? "—"}%`}
                sub={`Prev ${ceo.cancellation_trend?.previous_pct ?? "—"}%`}
              />
            </div>
          </section>
          <section className="beta__section">
            <div className="beta__grid">
              <div className="beta__panel">
                <h4>Top 20 drivers</h4>
                <ul>
                  {(ceo.top_drivers || []).map((driver) => (
                    <li key={driver.driver_id}>
                      {driver.driver_name} — score {driver.score} — {driver.revenue_month} MRU
                    </li>
                  ))}
                </ul>
              </div>
              <div className="beta__panel">
                <h4>Lowest performing drivers</h4>
                <ul>
                  {(ceo.lowest_drivers || []).map((driver) => (
                    <li key={driver.driver_id}>
                      {driver.driver_name} — score {driver.score}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          <section className="beta__section">
            <div className="beta__grid">
              <div className="beta__panel">
                <h4>Revenue by driver</h4>
                <ul>
                  {(ceo.revenue_by_driver || []).map((row) => (
                    <li key={row.driver_id}>
                      {row.name} — {row.revenue_month} MRU ({row.trips} trips)
                    </li>
                  ))}
                </ul>
              </div>
              <div className="beta__panel">
                <h4>Revenue by city</h4>
                <ul>
                  {(ceo.revenue_by_city || []).map((row) => (
                    <li key={row.city_id}>
                      {row.city_name} — {row.revenue_month} MRU ({row.driver_count} drivers)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {tab === "reports" ? (
        <section className="beta__section">
          <h2 className="beta__section-title">Reports &amp; Export</h2>
          <div className="beta__panel">
            {REPORT_TYPES.map((report) => (
              <div key={report.id} style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ minWidth: 220 }}>{report.label}</strong>
                <button type="button" className="beta__btn" onClick={() => handleExport(report.id, "csv")}>
                  CSV
                </button>
                <button type="button" className="beta__btn" onClick={() => handleExport(report.id, "pdf")}>
                  PDF
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
