import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  DataTable,
  KPICard,
  StatusChip,
  formatCurrency,
  formatTimestamp,
} from "../components/library";
import AdminModuleHub from "../modules/AdminModuleHub";
import DeliveryMapView from "../../delivery/DeliveryMapView";
import {
  fetchAdminDeliveryDetail,
  fetchAdminDeliveryTracking,
  fetchDeliveryOverview,
} from "./deliveryApi";

/**
 * Live courier positions are re-read on this interval. The dashboard is an
 * administration view, not a dispatch console: a 30 s cadence keeps the figures
 * current without turning the page into a polling loop.
 */
const LIVE_REFRESH_MS = 30000;

/**
 * Upper bound on the per-refresh fan-out. The administrative tracking endpoint is
 * per-delivery, so the number of concurrent reads is capped explicitly rather than
 * growing with the size of the fleet.
 */
const MAX_LIVE_ROWS = 8;

const TERMINAL_STATUSES = new Set(["delivered", "cancelled", "delivery_exception"]);

/**
 * `0` is a real measurement. Only null / undefined / "" mean "the API did not
 * provide this metric" and must render as an em dash — never as an invented zero.
 */
function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

/** Render a count, or an em dash when the API does not supply it. */
function stat(value) {
  return hasValue(value) ? value : "—";
}

function statusTone(status) {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "delivery_exception") return "danger";
  if (status === "in_transit" || status === "picked_up" || status === "accepted") return "info";
  return "neutral";
}

function isLiveDelivery(delivery) {
  return Boolean(delivery) && !TERMINAL_STATUSES.has(delivery.status);
}

/** Real backend coordinates only; anything else returns null. */
function coordinatesOf(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

const RECENT_COLUMNS = [
  { id: "id", label: "Delivery" },
  {
    id: "status",
    label: "Status",
    render: (row) => <StatusChip label={row.status} tone={statusTone(row.status)} />,
  },
  { id: "service_category", label: "Category" },
  { id: "pickup", label: "Pickup" },
  { id: "destination", label: "Drop-off" },
  { id: "customer_name", label: "Customer" },
  {
    id: "fare",
    label: "Fare",
    render: (row) => (hasValue(row.fare) ? formatCurrency(row.fare) : "—"),
  },
  {
    id: "created_at",
    label: "Created",
    render: (row) => formatTimestamp(row.created_at),
  },
];

/**
 * Yala Delivery overview (`/admin/delivery`).
 *
 * Every figure comes from read-only delivery endpoints:
 *   - `/deliveries/admin/overview/`  → delivery, courier and merchant counts
 *   - `/deliveries/<id>/tracking/`   → live courier position and ETA
 *   - `/deliveries/<id>/`            → pickup / destination coordinates
 *
 * Metrics the API does not expose are shown as an em dash rather than a zero, and
 * module navigation reuses the existing AdminModuleHub cards (nothing duplicated).
 */
export default function DeliveryManagement({ pathname = "/admin/delivery" } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [live, setLive] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Guard every async write: the dashboard polls, so a response can land after unmount.
  // The flag must be restored on mount as well as cleared on unmount — React 18 StrictMode
  // runs mount → unmount → mount in development, and a one-way `false` would discard every
  // response and leave the dashboard on skeletons forever.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchDeliveryOverview();
      if (!mountedRef.current) return;
      setData(payload);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.response?.data?.detail || "Could not load the delivery overview.");
      setData(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const couriers = data?.couriers || null;
  const deliveries = data?.deliveries || null;
  const merchants = data?.merchants || null;

  /**
   * The API exposes no "active deliveries" collection, so the live panel works from
   * the non-terminal rows of the recent-deliveries feed. The authoritative active
   * count stays `deliveries.active` in the KPI grid, and the panel says so.
   */
  const activeRows = useMemo(() => {
    const rows = Array.isArray(data?.recent_deliveries) ? data.recent_deliveries : [];
    return rows.filter(isLiveDelivery).slice(0, MAX_LIVE_ROWS);
  }, [data]);

  const activeKey = activeRows.map((row) => row.id).join(",");

  const loadLive = useCallback(async () => {
    const ids = activeKey ? activeKey.split(",").map(Number) : [];
    if (!ids.length) {
      if (mountedRef.current) setLive({});
      return;
    }
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const tracking = await fetchAdminDeliveryTracking(id);
          return [id, { tracking, error: "" }];
        } catch (err) {
          return [
            id,
            {
              tracking: null,
              error: err?.response?.data?.detail || "Live position unavailable.",
            },
          ];
        }
      })
    );
    if (!mountedRef.current) return;
    setLive(Object.fromEntries(entries));
  }, [activeKey]);

  useEffect(() => {
    loadLive();
  }, [loadLive]);

  // Refresh positions only while there is something live to watch, and never in a
  // background tab.
  useEffect(() => {
    if (!activeKey) return undefined;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      loadLive();
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeKey, loadLive]);

  // Full detail (pickup / destination coordinates) is fetched only for the delivery
  // whose map the administrator explicitly opened.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    fetchAdminDeliveryDetail(selectedId)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(err?.response?.data?.detail || "Could not load this delivery.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const courierPosition = useMemo(() => {
    const location = live[selectedId]?.tracking?.courier_location;
    if (!location?.available) return null;
    return coordinatesOf(location.lat, location.lng);
  }, [live, selectedId]);

  /**
   * The administrative payload nests coordinates under `pickup_location` /
   * `destination_location`, while the shared map component reads `pickup_lat` /
   * `destination_lat`. Adapt here rather than changing a component that the customer and
   * courier apps also render.
   */
  const mapDelivery = useMemo(() => {
    if (!detail) return null;
    return {
      ...detail,
      pickup_lat: detail.pickup_location?.lat ?? null,
      pickup_lng: detail.pickup_location?.lng ?? null,
      destination_lat: detail.destination_location?.lat ?? null,
      destination_lng: detail.destination_location?.lng ?? null,
    };
  }, [detail]);

  const hasMapCoordinates = Boolean(
    courierPosition ||
      coordinatesOf(detail?.pickup_location?.lat, detail?.pickup_location?.lng) ||
      coordinatesOf(detail?.destination_location?.lat, detail?.destination_location?.lng)
  );

  const revenue = deliveries?.delivered_fare;
  const hasRevenue = hasValue(revenue);
  const activeCount = deliveries?.active;

  // Task 7 additive block. `busy + available + offline === eligible_pool`, and the
  // pre-existing `couriers.online` counts delivery-mode-on couriers *including* busy ones —
  // it is not the same metric as `available`.
  const ops = data?.operations || null;
  const opsCouriers = ops?.couriers || null;
  const opsDeliveries = ops?.deliveries || null;
  const opsDefinitions = ops?.definitions || {};

  return (
    <AdminShellPage pathname={pathname} title="Yala Delivery">
      <div className="admin-delivery">
        <div className="dlvops-toolbar">
          <p className="dlvops-toolbar__stamp">
            {lastUpdated
              ? `Last updated ${formatTimestamp(lastUpdated.toISOString())}`
              : "Not loaded yet"}
          </p>
          <button type="button" className="admin-lib-btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <AlertBanner tone="danger" title="Delivery data unavailable">
            {error}
          </AlertBanner>
        ) : null}

        <section className="dlvops-section" aria-labelledby="delivery-kpi-heading">
          <h2 className="dlvops-section__title" id="delivery-kpi-heading">
            Delivery operations
          </h2>
          <div className="admin-kpi-row">
            <KPICard
              label="Total deliveries"
              value={deliveries?.total}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Active deliveries"
              value={deliveries?.active}
              subtitle="In progress right now"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Pending deliveries"
              value={opsDeliveries?.pending}
              subtitle={opsDefinitions.pending || "Requested — no courier has accepted yet"}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Scheduled pending"
              value={opsDeliveries?.pending_scheduled}
              subtitle="Requested deliveries that are scheduled"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Completed deliveries"
              value={deliveries?.delivered}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Cancelled deliveries"
              value={deliveries?.cancelled}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Available couriers"
              value={opsCouriers?.available}
              subtitle={
                opsDefinitions.available || "Delivery mode on and not busy — can take new jobs"
              }
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Busy couriers"
              value={opsCouriers?.busy}
              subtitle={opsDefinitions.busy || "Assigned to an active delivery"}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Couriers in exception"
              value={opsCouriers?.in_exception}
              subtitle={
                opsDefinitions.in_exception ||
                "Assigned to a delivery in exception (not counted as busy)"
              }
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Offline couriers"
              value={opsCouriers?.offline}
              subtitle={opsDefinitions.offline || "Delivery mode off and not busy"}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Pending courier approvals"
              value={couriers?.pending}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Delivery revenue"
              value={hasRevenue ? revenue : undefined}
              format={hasRevenue ? "currency" : "auto"}
              subtitle="Sum of delivered fares"
              loading={loading}
              error={error}
              onRefresh={load}
            />
          </div>
        </section>

        <section className="dlvops-section" aria-labelledby="delivery-pipeline-heading">
          <h2 className="dlvops-section__title" id="delivery-pipeline-heading">
            Courier &amp; merchant pipeline
          </h2>
          <div className="dlvops-panels">
            <article className="dlvops-panel">
              <h3 className="dlvops-panel__title">Couriers</h3>
              <dl className="dlvops-stats">
                <div className="dlvops-stats__row">
                  <dt>Total</dt>
                  <dd>{stat(couriers?.total)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Approved</dt>
                  <dd>{stat(couriers?.approved)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Pending review</dt>
                  <dd>{stat(couriers?.pending)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Rejected</dt>
                  <dd>{stat(couriers?.rejected)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Suspended</dt>
                  <dd>{stat(couriers?.suspended)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Online (mode on)</dt>
                  <dd>{stat(couriers?.online)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Available (not busy)</dt>
                  <dd>{stat(opsCouriers?.available)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Eligible pool</dt>
                  <dd>{stat(opsCouriers?.eligible_pool)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Approved but suspended</dt>
                  <dd>{stat(opsCouriers?.approved_but_suspended)}</dd>
                </div>
              </dl>
            </article>

            <article className="dlvops-panel">
              <h3 className="dlvops-panel__title">Merchants</h3>
              <dl className="dlvops-stats">
                <div className="dlvops-stats__row">
                  <dt>Total</dt>
                  <dd>{stat(merchants?.total)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Approved</dt>
                  <dd>{stat(merchants?.approved)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Pending review</dt>
                  <dd>{stat(merchants?.pending)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Suspended</dt>
                  <dd>{stat(merchants?.suspended)}</dd>
                </div>
              </dl>
            </article>

            <article className="dlvops-panel">
              <h3 className="dlvops-panel__title">Exceptions &amp; disputes</h3>
              <dl className="dlvops-stats">
                <div className="dlvops-stats__row">
                  <dt>Delivery exceptions</dt>
                  <dd>{stat(deliveries?.exceptions)}</dd>
                </div>
                <div className="dlvops-stats__row">
                  <dt>Open disputes</dt>
                  <dd>{stat(data?.open_disputes)}</dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <section className="dlvops-section" aria-labelledby="delivery-live-heading">
          <h2 className="dlvops-section__title" id="delivery-live-heading">
            Live delivery monitoring
          </h2>
          <p className="dlvops-section__hint">
            Positions come from the read-only administrative tracking endpoint
            (<code>/deliveries/admin/deliveries/&lt;id&gt;/tracking/</code>), which never re-runs
            dispatch. The delivery API exposes no active-delivery collection, so this panel lists
            the non-terminal records among the ten most recent deliveries
            {hasValue(activeCount) ? ` (the API reports ${activeCount} active in total).` : "."}
          </p>

          {activeRows.length === 0 ? (
            <p className="delivery-detail__empty">No active deliveries to monitor right now.</p>
          ) : (
            <>
              <div className="dlvops-live__table-wrap">
                <table className="delivery-detail__table">
                  <caption className="dlvops-live__caption">
                    Live positions refresh every {LIVE_REFRESH_MS / 1000} seconds while this tab is
                    visible.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Delivery</th>
                      <th scope="col">Status</th>
                      <th scope="col">Courier</th>
                      <th scope="col">Est. duration</th>
                      <th scope="col">Last known position</th>
                      <th scope="col">Map</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row) => {
                      const entry = live[row.id];
                      const tracking = entry?.tracking || null;
                      const location = tracking?.courier_location || null;
                      const position =
                        location?.available === true
                          ? coordinatesOf(location.lat, location.lng)
                          : null;
                      return (
                        <tr key={row.id}>
                          <td>#{row.id}</td>
                          <td>
                            <StatusChip
                              label={tracking?.status_label || row.status}
                              tone={statusTone(row.status)}
                            />
                          </td>
                          <td>{tracking?.courier_name || "\u2014"}</td>
                          <td>
                            {hasValue(tracking?.estimated_duration_minutes)
                              ? `${tracking.estimated_duration_minutes} min`
                              : "\u2014"}
                          </td>
                          <td>
                            {entry?.error ? (
                              <span className="delivery-detail__error">{entry.error}</span>
                            ) : position ? (
                              `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`
                            ) : (
                              <span className="delivery-detail__warning">Position unknown</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-lib-btn admin-lib-btn--ghost"
                              onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                            >
                              {selectedId === row.id ? "Hide map" : "Show map"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedId ? (
                <div className="dlvops-live__slot">
                  {detailLoading ? <p className="delivery-detail__empty">Loading map…</p> : null}
                  {detailError ? <p className="delivery-detail__error">{detailError}</p> : null}
                  {!detailLoading && !detailError && hasMapCoordinates ? (
                    <div className="dlvops-live__map">
                      <DeliveryMapView activeDelivery={mapDelivery} courierPosition={courierPosition} />
                    </div>
                  ) : null}
                  {!detailLoading && !detailError && !hasMapCoordinates ? (
                    <p className="delivery-detail__empty">
                      No GPS coordinates are available for delivery #{selectedId} yet.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        <DataTable
          title="Recent deliveries"
          columns={RECENT_COLUMNS}
          rows={data?.recent_deliveries || []}
          rowKey="id"
          loading={loading}
          error={error}
          emptyLabel="No deliveries yet."
          onRefresh={load}
        />

        <AdminModuleHub hubKey="delivery" />
      </div>
    </AdminShellPage>
  );
}
