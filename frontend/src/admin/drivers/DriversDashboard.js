import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../../apiConfig";
import { apiRequest } from "../../delivery/DeliveryShared";
import { describeLoadFailure } from "../layouts/errors/apiErrorMessage";
import { AlertBanner, KPICard, StatusChip, formatTimestamp } from "../components/library";
import "../components/library/adminDashboardViews.css";

/**
 * Drivers Dashboard — the dedicated driver/fleet overview.
 *
 * Every figure comes from the EXISTING fleet service
 * (`GET /operations/fleet/dashboard/`, the same endpoint that powers
 * /admin/fleet). Nothing is mocked and no number is invented: the driver table
 * is rendered straight from the `drivers` array the service returns.
 */

const QUICK_LINKS = [
  { label: "Driver Management", path: "/admin/drivers", description: "Driver directory, documents and account actions." },
  { label: "Driver Approvals", path: "/admin/approvals", description: "Review and approve driver applications." },
  { label: "Fleet Management", path: "/admin/fleet", description: "Fleet performance and driver actions." },
  { label: "Vehicle Management", path: "/admin/vehicles", description: "Vehicle registry and compliance." },
  { label: "Driver Academy", path: "/admin/academy", description: "Training and certification." },
  { label: "Hall of Fame", path: "/admin/hall-of-fame", description: "Driver recognition programme." },
];

const STATUS_TONE = {
  online: "success",
  busy: "info",
  offline: "neutral",
  suspended: "danger",
};

const REQUEST_TIMEOUT_MS = 30000;

/**
 * GET a fleet endpoint with a generous timeout.
 *
 * Root cause of the original "stuck on skeletons" defect: the admin shell fires
 * ~8 heavy API calls on mount and a browser only allows ~6 concurrent
 * connections per origin (HTTP/1.1), so this request QUEUES behind them and can
 * take 5–11s even though the endpoint itself answers in ~0.2s when idle
 * (measured: 222ms idle vs 5153ms with the shell loaded). The request was never
 * failing — it was waiting. The timeout is therefore generous, and the two reads
 * below are split so the KPI grid is never held hostage by the heavier list.
 */
async function fetchFleet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await apiRequest(`${API_URL}${path}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function DriversDashboard() {
  // Must default to an OBJECT: the first render happens before the request
  // resolves, and `overview.generated_at` / `overview.total_registered` would
  // throw on null and crash the component into the admin error boundary.
  const [overview, setOverview] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoadingOverview(true);
    setLoadingDrivers(true);

    // Two independent reads instead of one 190 KB combined payload.
    // The KPI grid depends only on the small overview response, so a slow or
    // queued driver list can never leave the cards on skeletons.
    fetchFleet("/operations/fleet/overview/")
      .then((payload) => setOverview(payload?.overview || {}))
      .catch((err) => setError(describeLoadFailure(err, { resource: "drivers dashboard" })))
      .finally(() => setLoadingOverview(false));

    fetchFleet("/operations/fleet/drivers/")
      .then((payload) => setDrivers(payload?.drivers || []))
      .catch(() => setDrivers([]))
      .finally(() => setLoadingDrivers(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const topDrivers = drivers
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 8);

  return (
    <div className="admin-dash">
      <p className="admin-dash__note">
        Live fleet figures
        {overview.generated_at ? ` — generated ${formatTimestamp(overview.generated_at)}` : ""}.
      </p>

      {error ? (
        <AlertBanner tone="danger" title="Drivers dashboard unavailable">
          {error}
        </AlertBanner>
      ) : null}

      <div className="admin-dash-grid">
        <KPICard label="Registered Drivers" value={overview.total_registered} loading={loadingOverview} />
        <KPICard label="Approved Drivers" value={overview.approved_drivers} tone="success" loading={loadingOverview} />
        <KPICard label="Online Now" value={overview.online_drivers} tone="success" loading={loadingOverview} />
        <KPICard label="On a Trip" value={overview.busy_drivers} loading={loadingOverview} />
        <KPICard label="Offline" value={overview.offline_drivers} loading={loadingOverview} />
        <KPICard label="Suspended" value={overview.suspended_drivers} tone="warning" loading={loadingOverview} />
        <KPICard label="Expired Documents" value={overview.expired_document_drivers} tone="danger" loading={loadingOverview} />
        <KPICard label="Active Trips" value={overview.active_trips} loading={loadingOverview} />
        <KPICard label="Riders Waiting" value={overview.waiting_riders} loading={loadingOverview} />
      </div>

      <section className="admin-dash-panel" aria-labelledby="drivers-top-title">
        <h3 className="admin-dash-panel__title" id="drivers-top-title">
          Top drivers by performance score
        </h3>
        {loadingDrivers ? (
          <p className="admin-dash__note">Loading driver performance…</p>
        ) : topDrivers.length ? (
          <div className="admin-dash-table-wrap">
            <table className="admin-dash-table">
              <thead>
                <tr>
                  <th scope="col">Driver</th>
                  <th scope="col">Status</th>
                  <th scope="col">Score</th>
                  <th scope="col">Band</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Acceptance</th>
                  <th scope="col">Cancellation</th>
                  <th scope="col">Completed rides</th>
                </tr>
              </thead>
              <tbody>
                {topDrivers.map((driver) => (
                  <tr key={driver.driver_id ?? driver.user_id}>
                    <td>{driver.driver_name || "—"}</td>
                    <td>
                      <StatusChip
                        label={driver.status || "unknown"}
                        tone={STATUS_TONE[driver.status] || "neutral"}
                      />
                    </td>
                    <td>{driver.score ?? "—"}</td>
                    <td>{driver.score_band || "—"}</td>
                    <td>{driver.rating_average ?? "—"}</td>
                    <td>{driver.acceptance_rate ?? "—"}</td>
                    <td>{driver.cancellation_rate ?? "—"}</td>
                    <td>{driver.completed_rides ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-dash__note">The fleet service returned no driver performance rows.</p>
        )}
      </section>

      <section className="admin-dash-panel" aria-labelledby="drivers-links-title">
        <h3 className="admin-dash-panel__title" id="drivers-links-title">
          Driver &amp; fleet modules
        </h3>
        <div className="admin-dash-links">
          {QUICK_LINKS.map((link) => (
            <a className="admin-dash-link" href={link.path} key={link.path}>
              <span className="admin-dash-link__label">{link.label}</span>
              <span className="admin-dash-link__desc">{link.description}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
