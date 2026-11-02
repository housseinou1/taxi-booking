import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";

import {
  BADGE_LABELS,
  DISPATCH_STATUS_LABELS,
  DOCUMENT_BUCKET_LABELS,
  DOCUMENT_STATE_LABELS,
  DRIVER_STATUS_LABELS,
  FLEET_REPORT_CATALOG,
  UNAVAILABLE_OVERVIEW_METRICS,
  UNSUPPORTED_REPORTS,
  approveFleetDocument,
  assignFleetTraining,
  exportFleetReport,
  fetchFleetDashboard,
  fetchFleetVehicles,
  notifyFleetDriver,
  reactivateFleetDriver,
  rejectFleetDocument,
  scoreBandMeta,
  suspendFleetDriver,
} from "./fleetApi";
import "./fleetUi.css";
import {
  DriverCell,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Pager,
  Panel,
  Pill,
  ScoreMeter,
  SectionHead,
  SortHeader,
  StatusPill,
  UnavailableKpi,
  formatCount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPct,
} from "./fleetUi";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

const REFRESH_MS = 30000;
const PAGE_SIZE = 10;

const TABS = [
  { id: "overview", label: "Fleet Overview" },
  { id: "performance", label: "Driver Performance" },
  { id: "documents", label: "Documents" },
  { id: "ceo", label: "CEO Dashboard" },
  { id: "reports", label: "Reports" },
];

/** Revenue window selector — maps to the three revenue columns the API returns. */
const PERIOD_OPTIONS = [
  { value: "today", label: "Today", field: "revenue_today" },
  { value: "week", label: "This week", field: "revenue_week" },
  { value: "month", label: "This month", field: "revenue_month" },
];

const DRIVER_STATUS_FILTERS = [
  { value: "", label: "All approval states" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "pending_review", label: "Pending review" },
  { value: "rejected", label: "Rejected" },
];

const DISPATCH_FILTERS = [
  { value: "", label: "All activity states" },
  { value: "online", label: "Online" },
  { value: "busy", label: "On trip" },
  { value: "offline", label: "Offline" },
];

/** Dependency-free scatter of live driver and demand-hotspot markers. */
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
    return (
      <EmptyState
        icon="🗺️"
        title="No live map data"
        hint="The backend returned no driver positions or demand hotspots for this selection."
      />
    );
  }

  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return (
    <div>
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
      <div className="fleet-map__legend">
        <span>
          <i className="fleet-map__dot" style={{ background: "#22c55e" }} />
          Driver available
        </span>
        <span>
          <i className="fleet-map__dot" style={{ background: "#f59e0b" }} />
          Driver on trip
        </span>
        <span>
          <i className="fleet-map__dot" style={{ background: "rgba(239, 68, 68, 0.75)" }} />
          Demand hotspot
        </span>
        <span>{formatCount(markers.length)} markers</span>
      </div>
    </div>
  );
}

/* â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€─ */


export default function FleetPerformanceCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [vehiclesError, setVehiclesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);

  // Filters — each one changes the request or the rendered rows, never a no-op.
  const [search, setSearch] = useState("");
  const [cityId, setCityId] = useState("");
  const [approval, setApproval] = useState("");
  const [dispatch, setDispatch] = useState("");
  const [period, setPeriod] = useState("month");

  // Tables
  const [sort, setSort] = useState({ key: "score", dir: "desc" });
  const [page, setPage] = useState(1);
  const [ceoSort, setCeoSort] = useState({ key: "score", dir: "desc" });
  const [lowSort, setLowSort] = useState({ key: "score", dir: "asc" });

  // Driver actions
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [trainingType, setTrainingType] = useState("service_quality");
  const [busyAction, setBusyAction] = useState("");

  const load = useCallback(
    async (options = {}) => {
      const silent = options.silent === true;
      if (!silent) setLoading(true);
      try {
        setError("");
        const params = cityId ? { city_id: cityId } : {};
        const response = await fetchFleetDashboard(params);
        setData(response.data);
        setLastLoaded(new Date());
      } catch (err) {
        setError(
          apiErrorMessage(err, { resource: "fleet data" })
        );
      } finally {
        setLoading(false);
      }
    },
    [cityId]
  );

  const loadVehicles = useCallback(async () => {
    try {
      setVehiclesError("");
      const params = { limit: 500 };
      if (cityId) params.city = cityId;
      const response = await fetchFleetVehicles(params);
      setVehicles(response.data);
    } catch (err) {
      setVehicles(null);
      setVehiclesError(
        apiErrorMessage(err, { resource: "vehicle directory" })
      );
    }
  }, [cityId]);

  useEffect(() => {
    load();
    loadVehicles();
  }, [load, loadVehicles]);

  // Live refresh keeps the operations view current without a manual reload.
  useEffect(() => {
    const timer = setInterval(() => {
      load({ silent: true });
      loadVehicles();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, loadVehicles]);

  // Any filter change resets pagination so the user never lands on an empty page.
  useEffect(() => {
    setPage(1);
  }, [search, approval, dispatch, cityId, period]);

  // Memoised so the derived useMemo hooks below have stable dependencies
  // (a fresh object literal on every render would invalidate them each time).
  const overview = useMemo(() => data?.overview || {}, [data]);
  const map = useMemo(() => data?.map || {}, [data]);
  const drivers = useMemo(() => data?.drivers || [], [data]);
  const documents = useMemo(() => data?.documents || {}, [data]);
  const ceo = useMemo(() => data?.ceo || {}, [data]);

  const periodField =
    PERIOD_OPTIONS.find((option) => option.value === period)?.field || "revenue_month";
  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label || "This month";

  const cityOptions = useMemo(() => {
    const rows = ceo.revenue_by_city || [];
    return rows
      .filter((row) => row && row.city_id !== undefined && row.city_id !== null)
      .map((row) => ({
        value: String(row.city_id),
        label: row.city_name || `City ${row.city_id}`,
      }));
  }, [ceo]);

  const handleSort = useCallback((key) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "driver_name" ? "asc" : "desc" }
    );
  }, []);

  const handleCeoSort = useCallback((key) => {
    setCeoSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "driver_name" ? "asc" : "desc" }
    );
  }, []);

  const handleLowSort = useCallback((key) => {
    setLowSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "driver_name" ? "asc" : "desc" }
    );
  }, []);

  const handleExport = async (type, format) => {
    setNotice("");
    setBusyAction(`export-${type}-${format}`);
    try {
      const response = await exportFleetReport(type, format);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${type}.${format === "pdf" ? "pdf" : "csv"}`;
      link.click();
      window.URL.revokeObjectURL(url);
      setNotice(`Exported ${type} as ${format.toUpperCase()}`);
    } catch (err) {
      setNotice(err?.response?.data?.detail || "Export failed");
    } finally {
      setBusyAction("");
    }
  };

  const runDriverAction = async (action, driver) => {
    setNotice("");
    setBusyAction(action);
    try {
      if (action === "suspend") await suspendFleetDriver(driver.user_id);
      if (action === "reactivate") await reactivateFleetDriver(driver.user_id);
      if (action === "notify") {
        await notifyFleetDriver(driver.user_id, {
          message: notifyMessage || "Message from Yala Operations",
        });
        setNotifyMessage("");
      }
      if (action === "training") {
        await assignFleetTraining(driver.user_id, { training_type: trainingType });
      }
      setNotice(`Action completed for ${driver.driver_name || driver.email}`);
      setSelectedDriver(null);
      await load({ silent: true });
    } catch (err) {
      setNotice(err?.response?.data?.detail || "Action failed");
    } finally {
      setBusyAction("");
    }
  };

  const runDocumentAction = async (action, docId) => {
    setNotice("");
    setBusyAction(`${action}-${docId}`);
    try {
      if (action === "approve") await approveFleetDocument(docId);
      if (action === "reject") await rejectFleetDocument(docId, "Rejected from fleet center");
      setNotice(`Document ${action === "approve" ? "approved" : "rejected"}`);
      await load({ silent: true });
    } catch (err) {
      setNotice(err?.response?.data?.detail || "Document action failed");
    } finally {
      setBusyAction("");
    }
  };

  const filteredDrivers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (approval && driver.status !== approval) return false;
      if (dispatch && driver.current_status !== dispatch) return false;
      if (!needle) return true;
      const haystack = [
        driver.driver_name,
        driver.driver_email,
        driver.email,
        driver.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [drivers, search, approval, dispatch]);

  const compare = useCallback(
    (a, b, key) => {
      const left = a?.[key];
      const right = b?.[key];
      const leftNum = Number(left);
      const rightNum = Number(right);
      const bothNumeric =
        left !== null &&
        left !== undefined &&
        left !== "" &&
        right !== null &&
        right !== undefined &&
        right !== "" &&
        !Number.isNaN(leftNum) &&
        !Number.isNaN(rightNum);
      if (bothNumeric) return leftNum - rightNum;
      return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
        sensitivity: "base",
      });
    },
    []
  );

  const sortedDrivers = useMemo(() => {
    const rows = [...filteredDrivers];
    rows.sort((a, b) => {
      const result = compare(a, b, sort.key);
      return sort.dir === "asc" ? result : -result;
    });
    return rows;
  }, [filteredDrivers, sort, compare]);

  const pageCount = Math.max(1, Math.ceil(sortedDrivers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rankedDrivers = useMemo(
    () => sortedDrivers.map((driver, index) => ({ ...driver, rank: index + 1 })),
    [sortedDrivers]
  );

  const pagedRankedDrivers = useMemo(
    () => rankedDrivers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rankedDrivers, safePage]
  );

  /** Vehicle directory summary. Every figure is derived from returned rows only. */
  const vehicleSummary = useMemo(() => {
    if (!vehicles || !Array.isArray(vehicles.vehicles)) return null;
    const rows = vehicles.vehicles;
    const states = rows.map((row) => Object.values(row.documents || {}));
    return {
      total: rows.length,
      reportedCount: vehicles.count,
      awaitingApproval: rows.filter(
        (row) => row.driver_status === "pending" || row.driver_status === "pending_review"
      ).length,
      roadLegal: states.filter((values) => values.length && values.every((v) => v === "ok")).length,
      withExpired: states.filter((values) => values.includes("expired")).length,
      withExpiring: states.filter((values) => values.includes("expiring_soon")).length,
      withMissing: states.filter((values) => values.includes("missing")).length,
      expiringDocuments: vehicles.expiring_documents || [],
      truncated: typeof vehicles.count === "number" && vehicles.count > rows.length,
    };
  }, [vehicles]);

  /** Per-driver trip totals summed over the loaded set — labelled as such in the UI. */
  const loadedTripTotals = useMemo(() => {
    return drivers.reduce(
      (acc, driver) => {
        acc.completed += Number(driver.completed_rides || driver.total_trips || 0);
        acc.cancelled += Number(driver.cancelled_rides || 0);
        return acc;
      },
      { completed: 0, cancelled: 0 }
    );
  }, [drivers]);

  const sortRows = useCallback(
    (rows, sorter) => {
      const copy = [...rows];
      copy.sort((a, b) => {
        const result = compare(a, b, sorter.key);
        return sorter.dir === "asc" ? result : -result;
      });
      return copy;
    },
    [compare]
  );

  const topDrivers = useMemo(
    () => sortRows(ceo.top_drivers || [], ceoSort).slice(0, 20),
    [ceo, ceoSort, sortRows]
  );

  const lowestDrivers = useMemo(
    () => sortRows(ceo.lowest_drivers || [], lowSort).slice(0, 20),
    [ceo, lowSort, sortRows]
  );

  const documentBuckets = useMemo(() => {
    const order = ["expired", "expiring_1d", "expiring_7d", "expiring_15d", "expiring_30d", "valid"];
    return order.map((key) => ({
      key,
      label: DOCUMENT_BUCKET_LABELS[key] || key,
      rows: documents.buckets?.[key] || [],
      count: documents.summary?.[key] ?? (documents.buckets?.[key] || []).length,
    }));
  }, [documents]);

  const cancellationTrend = ceo.cancellation_trend || {};
  const acceptanceTrend = ceo.acceptance_trend || {};

  /** driver_id -> vehicle row, so the roster can show vehicle context from real data. */
  const vehicleByDriver = useMemo(() => {
    const index = new Map();
    (vehicles?.vehicles || []).forEach((row) => {
      if (row && row.driver_id !== undefined) index.set(row.driver_id, row);
    });
    return index;
  }, [vehicles]);


  /** Averages and totals over the currently filtered driver set (real values only). */
  const performanceSummary = useMemo(() => {
    const rows = filteredDrivers;
    if (!rows.length) return null;
    const avg = (key) => {
      const values = rows
        .map((row) => Number(row[key]))
        .filter((value) => !Number.isNaN(value));
      if (!values.length) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    };
    return {
      count: rows.length,
      avgScore: avg("score"),
      avgAcceptance: avg("acceptance_rate"),
      avgCancellation: avg("cancellation_rate"),
      avgRating: avg("rating_average"),
      avgOnTime: avg("on_time_rate"),
      totalTrips: rows.reduce((sum, row) => sum + Number(row.total_trips || 0), 0),
      totalRevenue: rows.reduce((sum, row) => sum + Number(row[periodField] || 0), 0),
      atRisk: rows.filter((row) => row.score_band === "risk").length,
      excellent: rows.filter((row) => row.score_band === "excellent").length,
    };
  }, [filteredDrivers, periodField]);

  if (loading && !data) {
    return (
      <div className="fleet-center">
        <div className="fleet-center__header">
          <div className="fleet-center__heading">
            <h1 className="fleet-center__title"><AdminPageTitle>Fleet &amp; Driver Performance Center</AdminPageTitle></h1>
            <p className="fleet-center__subtitle">Loading fleet operations data…</p>
          </div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="fleet-center">
      <header className="fleet-center__header">
        <div className="fleet-center__heading">
          <h1 className="fleet-center__title"><AdminPageTitle>Fleet &amp; Driver Performance Center</AdminPageTitle></h1>
          <p className="fleet-center__subtitle">
            Fleet operations, driver performance, document compliance and CEO intelligence.
          </p>
          <div className="fleet-center__meta">
            <span className="fleet-live">
              <span className="fleet-live__dot" aria-hidden="true" />
              Live
            </span>
            <span>Updated {lastLoaded ? lastLoaded.toLocaleTimeString() : "—"}</span>
            <span>
              {overview.total_registered !== undefined
                ? `${formatCount(overview.total_registered)} registered drivers`
                : "Driver count unavailable"}
            </span>
            {vehiclesError ? <span>· vehicle directory unavailable</span> : null}
          </div>
        </div>
        <div className="fleet-center__actions">
          <button
            type="button"
            className="fleet-btn"
            onClick={() => {
              load();
              loadVehicles();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {notice ? <div className="fleet-notice">{notice}</div> : null}

      <nav className="fleet-tabs" aria-label="Fleet management sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`fleet-tab ${tab === item.id ? "fleet-tab--active" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="fleet-toolbar">
        <label className="fleet-field fleet-field--grow">
          <span className="fleet-field__label">Search drivers</span>
          <input
            type="search"
            className="fleet-input"
            placeholder="Name, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search drivers by name, email or phone"
          />
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">City</span>
          <select
            className="fleet-select"
            value={cityId}
            onChange={(event) => setCityId(event.target.value)}
            aria-label="Filter by city"
          >
            <option value="">All cities</option>
            {cityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">Approval</span>
          <select
            className="fleet-select"
            value={approval}
            onChange={(event) => setApproval(event.target.value)}
            aria-label="Filter by approval status"
          >
            {DRIVER_STATUS_FILTERS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">Activity</span>
          <select
            className="fleet-select"
            value={dispatch}
            onChange={(event) => setDispatch(event.target.value)}
            aria-label="Filter by activity status"
          >
            {DISPATCH_FILTERS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">Revenue period</span>
          <select
            className="fleet-select"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            aria-label="Revenue period"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <span className="fleet-toolbar__spacer" />
        <span className="fleet-toolbar__count">
          <strong>{formatCount(sortedDrivers.length)}</strong> of{" "}
          {formatCount(drivers.length)} loaded drivers
        </span>
      </div>

      {tab === "overview" ? (
        <>
          <section className="fleet-section">
            <SectionHead
              title="Driver availability &amp; approvals"
              hint="Live dispatch and approval counters from GET /operations/fleet/dashboard/. These counters cover every DriverProfile row, which includes delivery courier profiles alongside ride drivers — the backend does not filter couriers out of this block."
            />
            <div className="fleet-kpis">
              <KpiCard
                label="Total registered"
                value={formatCount(overview.total_registered)}
                icon="👥"
                tone="idle"
                sub="All driver profiles — ride drivers and delivery couriers"
              />
              <KpiCard
                label="Approved"
                value={formatCount(overview.approved_drivers)}
                icon="✅"
                tone="ok"
                sub="Profiles with approved status"
              />
              <KpiCard
                label="Online"
                value={formatCount(overview.online_drivers)}
                icon="🟢"
                tone="ok"
                sub="Available for dispatch"
              />
              <KpiCard
                label="Completing trips"
                value={formatCount(overview.busy_drivers)}
                icon="🚕"
                tone="warn"
                sub="Currently on an active trip"
              />
              <KpiCard
                label="Offline"
                value={formatCount(overview.offline_drivers)}
                icon="⚪"
                tone="idle"
                sub="Not available right now"
              />
              <KpiCard
                label="Suspended"
                value={formatCount(overview.suspended_drivers)}
                icon="🚫"
                tone="danger"
                sub="Accounts deactivated"
              />
              <KpiCard
                label="Expired documents"
                value={formatCount(overview.expired_document_drivers)}
                icon="📄"
                tone="warn"
                sub="Drivers with an expired approved document"
              />
              <KpiCard
                label="Waiting riders"
                value={formatCount(overview.waiting_riders)}
                icon="â³"
                tone="info"
                sub="Riders currently seeking a driver"
              />
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Vehicle fleet"
              hint="Derived from the read-only vehicle directory GET /operations/vehicles/, which is built from DriverProfile vehicle fields."
            />
            {vehiclesError ? (
              <ErrorState message={vehiclesError} onRetry={loadVehicles} />
            ) : null}
            {vehicleSummary ? (
              <>
                <div className="fleet-kpis">
                  <KpiCard
                    label="Registered vehicles"
                    value={formatCount(vehicleSummary.total)}
                    icon="🚙"
                    tone="idle"
                    sub={
                      vehicleSummary.truncated
                        ? `Directory reports ${formatCount(vehicleSummary.reportedCount)} — showing first ${formatCount(vehicleSummary.total)}`
                        : "Driver profiles with vehicle records"
                    }
                  />
                  <KpiCard
                    label="Road-legal vehicles"
                    value={formatCount(vehicleSummary.roadLegal)}
                    icon="🛡️"
                    tone="ok"
                    sub="Registration, insurance, vignette and licence all valid"
                  />
                  <KpiCard
                    label="Awaiting approval"
                    value={formatCount(vehicleSummary.awaitingApproval)}
                    icon="â±️"
                    tone="warn"
                    sub="Vehicle belongs to a driver pending review"
                  />
                  <KpiCard
                    label="With expired documents"
                    value={formatCount(vehicleSummary.withExpired)}
                    icon="⛔"
                    tone="danger"
                    sub="At least one tracked document has expired"
                  />
                  <KpiCard
                    label="Expiring soon"
                    value={formatCount(vehicleSummary.withExpiring)}
                    icon="📅"
                    tone="warn"
                    sub={`Within ${vehicles?.expiry_alert_days ?? 30} days`}
                  />
                  <KpiCard
                    label="Missing documents"
                    value={formatCount(vehicleSummary.withMissing)}
                    icon="â“"
                    tone="danger"
                    sub="At least one tracked document not uploaded"
                  />
                </div>
                {vehicleSummary.truncated ? (
                  <div className="fleet-gap">
                    <span>
                      <strong>Partial vehicle directory.</strong> The API caps this endpoint at 500
                      rows, so the figures above describe the first {formatCount(vehicleSummary.total)}{" "}
                      of {formatCount(vehicleSummary.reportedCount)} vehicles.
                    </span>
                  </div>
                ) : null}
              </>
            ) : vehiclesError ? null : (
              <Panel>
                <EmptyState
                  icon="🚙"
                  title="Vehicle directory not loaded"
                  hint="The vehicle metrics appear once GET /operations/vehicles/ responds."
                />
              </Panel>
            )}
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Utilisation &amp; reported gaps"
              hint="Fleet utilisation is the share of approved drivers currently online. Metrics the fleet API does not expose are listed explicitly rather than estimated."
            />
            <div className="fleet-kpis">
              <KpiCard
                label="Fleet utilisation"
                value={formatCount(ceo.fleet_utilization_pct)}
                unit="%"
                icon="📊"
                tone="info"
                sub="Ride drivers only — couriers are excluded from this ratio."
              />
              <KpiCard
                label="Completed trips"
                value={formatCount(loadedTripTotals.completed)}
                icon="🏁"
                tone="ok"
                sub={`Summed across the ${formatCount(drivers.length)} loaded drivers`}
              />
              <KpiCard
                label="Cancelled trips"
                value={formatCount(loadedTripTotals.cancelled)}
                icon="âœ–️"
                tone="warn"
                sub={`Summed across the ${formatCount(drivers.length)} loaded drivers`}
              />
            </div>
            <div className="fleet-kpis">
              {UNAVAILABLE_OVERVIEW_METRICS.map((metric) => (
                <UnavailableKpi key={metric.id} label={metric.label} reason={metric.reason} />
              ))}
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Live fleet map &amp; demand zones"
              hint="Driver positions and demand hotspots from the operations map bundle. Zone lists are ranked by the backend surge monitor."
            />
            <div className="fleet-grid fleet-grid--2">
              <Panel title="Live positions" flush>
                <div className="fleet-panel__body">
                  <FleetMap liveMap={map.live_map} heatMap={map.heat_map} />
                </div>
              </Panel>
              <div className="fleet-stack">
                <Panel
                  title="Busy zones"
                  note="Zones with medium or high surge severity."
                >
                  {(map.busy_zones || []).length ? (
                    <div className="fleet-zone-list">
                      {(map.busy_zones || []).slice(0, 8).map((zone) => (
                        <div key={`busy-${zone.lat}-${zone.lng}`} className="fleet-zone-item">
                          <span className="fleet-zone-item__label" title={zone.label}>
                            {zone.label || "Unnamed zone"}
                          </span>
                          <span className="fleet-zone-item__meta">
                            {formatCount(zone.waiting_riders)} waiting ·{" "}
                            {formatCount(zone.drivers_nearby)} drivers
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="🟢" title="No busy zones" hint="No zone is under surge pressure right now." />
                  )}
                </Panel>
                <Panel
                  title="Low coverage zones"
                  note="Two or more waiting riders with one or fewer drivers nearby."
                >
                  {(map.low_coverage_zones || []).length ? (
                    <div className="fleet-zone-list">
                      {(map.low_coverage_zones || []).slice(0, 8).map((zone) => (
                        <div key={`low-${zone.lat}-${zone.lng}`} className="fleet-zone-item">
                          <span className="fleet-zone-item__label" title={zone.label}>
                            {zone.label || "Unnamed zone"}
                          </span>
                          <span className="fleet-zone-item__meta">
                            demand ratio {zone.demand_supply_ratio ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="✅" title="Full coverage" hint="No low-coverage zone detected." />
                  )}
                </Panel>
              </div>
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Fleet roster"
              hint="Driver and vehicle overview joined on driver id. Approval status, dispatch status, vehicle details and document states all come from existing endpoints. Couriers appear alongside ride drivers, because the API returns every driver profile."
            />
            <Panel flush>
              <div className="fleet-table-wrap">
                <table className="fleet-table">
                  <thead>
                    <tr>
                      <th className="fleet-table__rank" scope="col">
                        #
                      </th>
                      <SortHeader label="Driver" sortKey="driver_name" sort={sort} onSort={handleSort} />
                      <th scope="col">Approval</th>
                      <th scope="col">Activity</th>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Documents</th>
                      <SortHeader label="Score" sortKey="score" sort={sort} onSort={handleSort} />
                      <SortHeader label="Trips" sortKey="total_trips" sort={sort} onSort={handleSort} />
                      <SortHeader
                        label={`Revenue (${periodLabel.toLowerCase()})`}
                        sortKey={periodField}
                        sort={sort}
                        onSort={handleSort}
                      />
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRankedDrivers.length ? (
                      pagedRankedDrivers.map((driver) => {
                        const vehicleRow = vehicleByDriver.get(driver.driver_id);
                        const vehicle = vehicleRow?.vehicle;
                        const vehicleLabel = vehicle
                          ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
                            vehicle.plate_number ||
                            "—"
                          : "—";
                        const docStates = vehicleRow
                          ? Object.entries(vehicleRow.documents || {})
                          : [];
                        return (
                          <tr key={driver.driver_id}>
                            <td className="fleet-table__rank">{driver.rank}</td>
                            <td>
                              <DriverCell
                                name={driver.driver_name}
                                meta={driver.driver_email || driver.email}
                              />
                            </td>
                            <td>
                              <StatusPill status={driver.status} map={DRIVER_STATUS_LABELS} />
                            </td>
                            <td>
                              <StatusPill
                                status={driver.current_status}
                                map={DISPATCH_STATUS_LABELS}
                              />
                            </td>
                            <td>
                              <span title={vehicleLabel}>{vehicleLabel}</span>
                              {vehicle?.plate_number ? (
                                <div className="fleet-driver__meta" title={vehicle.plate_number}>
                                  {vehicle.plate_number}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {docStates.length ? (
                                <span className="fleet-badge-list">
                                  {docStates.map(([name, state]) => (
                                    <span
                                      key={name}
                                      className={`fleet-pill fleet-pill--${
                                        DOCUMENT_STATE_LABELS[state]?.tone || "idle"
                                      }`}
                                      title={`${name}: ${
                                        DOCUMENT_STATE_LABELS[state]?.label || state
                                      }`}
                                    >
                                      {name.slice(0, 3).toUpperCase()}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              <ScoreMeter score={driver.score} band={driver.score_band} />
                            </td>
                            <td className="fleet-table__num">{formatCount(driver.total_trips)}</td>
                            <td className="fleet-table__num">{formatMoney(driver[periodField])}</td>
                            <td>
                              <div className="fleet-table__actions">
                                <button
                                  type="button"
                                  className="fleet-btn fleet-btn--sm"
                                  onClick={() => setSelectedDriver(driver)}
                                >
                                  Details
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="fleet-table__empty" colSpan={10}>
                          No drivers match the current filters.
                        </td>
                      </tr>
                    )}

                  </tbody>
                </table>
              </div>
              <Pager
                page={safePage}
                pageCount={pageCount}
                total={sortedDrivers.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </Panel>
          </section>
        </>
      ) : null}

      {tab === "performance" ? (
        <>
          <section className="fleet-section">
            <SectionHead
              title="Performance summary"
              hint={`Averages across the ${formatCount(
                performanceSummary?.count || 0
              )} drivers matching the current filters. Scores use the existing backend formula — nothing is recalculated here.`}
            />
            {performanceSummary ? (
              <div className="fleet-kpis">
                <KpiCard
                  label="Average score"
                  value={performanceSummary.avgScore ?? "—"}
                  icon="🎯"
                  tone="info"
                  sub={`${formatCount(performanceSummary.excellent)} excellent · ${formatCount(
                    performanceSummary.atRisk
                  )} at risk`}
                />
                <KpiCard
                  label="Average acceptance"
                  value={performanceSummary.avgAcceptance ?? "—"}
                  unit="%"
                  icon="🤝"
                  tone="ok"
                  sub="Acceptance points across filtered drivers"
                />
                <KpiCard
                  label="Average cancellation"
                  value={performanceSummary.avgCancellation ?? "—"}
                  unit="%"
                  icon="âœ–️"
                  tone="warn"
                  sub="Cancelled ÷ accepted"
                />
                <KpiCard
                  label="Average rating"
                  value={performanceSummary.avgRating ?? "—"}
                  icon="â­"
                  tone="ok"
                  sub="Rider rating average (out of 5)"
                />
                <KpiCard
                  label="Average on-time"
                  value={performanceSummary.avgOnTime ?? "—"}
                  unit="%"
                  icon="â±️"
                  tone="info"
                  sub="Arrivals within the on-time window"
                />
                <KpiCard
                  label="Completed trips"
                  value={formatCount(performanceSummary.totalTrips)}
                  icon="🏁"
                  tone="idle"
                  sub="Sum across filtered drivers"
                />
                <KpiCard
                  label={`Earnings (${periodLabel.toLowerCase()})`}
                  value={formatMoney(performanceSummary.totalRevenue)}
                  icon="💰"
                  tone="ok"
                  sub="Sum across filtered drivers"
                />
              </div>
            ) : (
              <Panel>
                <EmptyState
                  icon="📊"
                  title="No drivers match the current filters"
                  hint="Clear the search or status filters to see performance figures."
                />
              </Panel>
            )}
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Driver performance table"
              hint="Sort any column, search by name, email or phone, and filter by approval or activity status using the toolbar above. The API returns every driver profile, so delivery courier profiles appear alongside ride drivers."
            />
            <Panel flush>
              <div className="fleet-table-wrap">
                <table className="fleet-table">
                  <thead>
                    <tr>
                      <th className="fleet-table__rank" scope="col">
                        Rank
                      </th>
                      <SortHeader label="Driver name" sortKey="driver_name" sort={sort} onSort={handleSort} />
                      <SortHeader label="Trips" sortKey="total_trips" sort={sort} onSort={handleSort} />
                      <SortHeader
                        label={`Earnings (${periodLabel.toLowerCase()})`}
                        sortKey={periodField}
                        sort={sort}
                        onSort={handleSort}
                      />
                      <SortHeader
                        label="Acceptance"
                        sortKey="acceptance_rate"
                        sort={sort}
                        onSort={handleSort}
                      />
                      <SortHeader
                        label="Cancellation"
                        sortKey="cancellation_rate"
                        sort={sort}
                        onSort={handleSort}
                      />
                      <SortHeader
                        label="Rating"
                        sortKey="rating_average"
                        sort={sort}
                        onSort={handleSort}
                      />
                      <SortHeader label="Score" sortKey="score" sort={sort} onSort={handleSort} />
                      <th scope="col">Status</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRankedDrivers.length ? (
                      pagedRankedDrivers.map((driver) => (
                        <tr key={driver.driver_id}>
                          <td className="fleet-table__rank">{driver.rank}</td>
                          <td>
                            <DriverCell
                              name={driver.driver_name}
                              meta={driver.driver_email || driver.email}
                            />
                          </td>
                          <td className="fleet-table__num">{formatCount(driver.total_trips)}</td>
                          <td className="fleet-table__num">{formatMoney(driver[periodField])}</td>
                          <td className="fleet-table__num">{formatPct(driver.acceptance_rate)}</td>
                          <td className="fleet-table__num">
                            {formatPct(driver.cancellation_rate)}
                          </td>
                          <td className="fleet-table__num">{formatPct(driver.rating_average)}</td>
                          <td>
                            <ScoreMeter score={driver.score} band={driver.score_band} />
                          </td>
                          <td>
                            <div className="fleet-stack" style={{ gap: 4 }}>
                              <StatusPill status={driver.status} map={DRIVER_STATUS_LABELS} />
                              <StatusPill
                                status={driver.current_status}
                                map={DISPATCH_STATUS_LABELS}
                              />
                            </div>
                          </td>
                          <td>
                            <div className="fleet-table__actions">
                              <button
                                type="button"
                                className="fleet-btn fleet-btn--sm"
                                onClick={() => setSelectedDriver(driver)}
                              >
                                View details
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="fleet-table__empty" colSpan={10}>
                          No drivers match the current filters.
                        </td>
                      </tr>
                    )}

                  </tbody>
                </table>
              </div>
              <Pager
                page={safePage}
                pageCount={pageCount}
                total={sortedDrivers.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </Panel>
          </section>
        </>
      ) : null}

      {tab === "documents" ? (
        <>
          <section className="fleet-section">
            <SectionHead
              title="Document compliance"
              hint="Expiry buckets from GET /operations/fleet/documents/. Only approved documents are tracked, so these counts describe compliance of approved documents — not the approval queue."
            />
            <div className="fleet-kpis">
              <KpiCard
                label="Valid"
                value={formatCount(documents.summary?.valid)}
                icon="✅"
                tone="ok"
                sub="Approved with more than 30 days remaining"
              />
              <KpiCard
                label="Expiring ≤30 days"
                value={formatCount(documents.summary?.expiring_30d)}
                icon="📅"
                tone="warn"
                sub="Next renewal window"
              />
              <KpiCard
                label="Expiring ≤15 days"
                value={formatCount(documents.summary?.expiring_15d)}
                icon="📅"
                tone="warn"
                sub="Renewal should be scheduled"
              />
              <KpiCard
                label="Expiring ≤7 days"
                value={formatCount(documents.summary?.expiring_7d)}
                icon="âš ️"
                tone="warn"
                sub="Urgent renewal"
              />
              <KpiCard
                label="Expiring ≤1 day"
                value={formatCount(documents.summary?.expiring_1d)}
                icon="â°"
                tone="danger"
                sub="Expires today or tomorrow"
              />
              <KpiCard
                label="Expired"
                value={formatCount(documents.summary?.expired)}
                icon="⛔"
                tone="danger"
                sub="Already past the expiry date"
              />
            </div>
            <div className="fleet-gap">
              <span>
                <strong>
                  Pending verification and rejected documents are not available here.
                </strong>{" "}
                GET /operations/fleet/documents/ filters to <code>status=&quot;approved&quot;</code>,
                so it cannot report the review queue. Approval and rejection remain available on the
                documents below using the existing fleet document endpoints — no document is ever
                approved or rejected automatically.
              </span>
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Document queues"
              hint="Each queue shows the first 20 rows the API returns, ordered by expiry date. Review actions preserve the existing permissions and workflows."
            />
            {documentBuckets.map((bucket) => (
              <Panel
                key={bucket.key}
                title={bucket.label}
                note={`${formatCount(bucket.count)} document${bucket.count === 1 ? "" : "s"}`}
                flush
              >
                {bucket.rows.length ? (
                  <div className="fleet-table-wrap">
                    <table className="fleet-table">
                      <thead>
                        <tr>
                          <th scope="col">Driver</th>
                          <th scope="col">Document</th>
                          <th scope="col">Expires</th>
                          <th scope="col">Days remaining</th>
                          <th scope="col">Status</th>
                          <th scope="col" />
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.rows.slice(0, 20).map((doc) => (
                          <tr key={doc.id}>
                            <td>
                              <DriverCell name={doc.driver_email} />
                            </td>
                            <td>{doc.document_label || doc.document_type || "—"}</td>
                            <td>{formatDate(doc.expires_at)}</td>
                            <td className="fleet-table__num">{doc.days_remaining ?? "—"}</td>
                            <td>
                              <Pill
                                tone={
                                  bucket.key === "expired"
                                    ? "danger"
                                    : bucket.key === "valid"
                                    ? "ok"
                                    : "warn"
                                }
                              >
                                {bucket.label}
                              </Pill>
                            </td>
                            <td>
                              <div className="fleet-table__actions">
                                <button
                                  type="button"
                                  className="fleet-btn fleet-btn--sm"
                                  disabled={busyAction === `approve-${doc.id}`}
                                  onClick={() => runDocumentAction("approve", doc.id)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="fleet-btn fleet-btn--sm fleet-btn--danger"
                                  disabled={busyAction === `reject-${doc.id}`}
                                  onClick={() => runDocumentAction("reject", doc.id)}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="fleet-panel__body">
                    <EmptyState
                      icon="✅"
                      title={`No documents in "${bucket.label}"`}
                      hint="Nothing to review in this bucket right now."
                    />
                  </div>
                )}
              </Panel>
            ))}
          </section>
        </>
      ) : null}

      {tab === "ceo" ? (
        <>
          <section className="fleet-section">
            <SectionHead
              title="CEO fleet metrics"
              hint="Four headline fleet metrics. Previous-period comparison is shown only where the backend actually provides one."
            />
            <div className="fleet-kpis fleet-kpis--four">
              <KpiCard
                label="Fleet utilisation"
                value={formatCount(ceo.fleet_utilization_pct)}
                unit="%"
                icon="📊"
                tone="info"
                sub="Ride drivers only (couriers excluded). No previous-period comparison is provided by the API."
              />
              <KpiCard
                label="Average monthly earnings"
                value={formatMoney(ceo.average_earnings_month)}
                icon="💰"
                tone="ok"
                sub="Mean of positive monthly revenue across drivers. No previous-period comparison is provided."
              />
              <KpiCard
                label="Acceptance trend"
                value={formatCount(acceptanceTrend.current_avg)}
                unit="pts"
                icon="🤝"
                tone="ok"
                sub={acceptanceTrend.label || "Fleet acceptance points (7-day snapshot)"}
              />
              <KpiCard
                label="Cancellation trend"
                value={formatCount(cancellationTrend.current_pct)}
                unit="%"
                icon="âœ–️"
                tone={
                  cancellationTrend.direction === "up" && cancellationTrend.current_pct > 0
                    ? "warn"
                    : "ok"
                }
                sub={
                  cancellationTrend.previous_pct === undefined ||
                  cancellationTrend.previous_pct === null ? (
                    "Previous period not available"
                  ) : (
                    <>
                      Previous period {formatPct(cancellationTrend.previous_pct)}{" "}
                      <span
                        className="fleet-kpi__trend"
                        style={{
                          color:
                            cancellationTrend.direction === "up"
                              ? "var(--admin-warning, #fbbf24)"
                              : "var(--admin-success, #34d399)",
                        }}
                      >
                        {cancellationTrend.direction === "up" ? "▲ higher" : "▼ lower"}
                      </span>
                    </>
                  )
                }
              />
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Fleet rankings"
              hint="Top performers and lowest-scoring drivers, ranked by the existing performance score. Both tables sort independently and use the same backend scoring logic."
            />
            <div className="fleet-grid fleet-grid--rankings">
              <Panel
                title="Top 20 drivers"
                note="Highest performance scores across the loaded fleet."
                flush
                actions={
                  <button
                    type="button"
                    className="fleet-btn fleet-btn--sm"
                    onClick={() => setTab("performance")}
                  >
                    View all
                  </button>
                }
              >
                <div className="fleet-table-wrap">
                  <table className="fleet-table">
                    <thead>
                      <tr>
                        <th className="fleet-table__rank" scope="col">
                          Rank
                        </th>
                        <SortHeader label="Driver" sortKey="driver_name" sort={ceoSort} onSort={handleCeoSort} />
                        <SortHeader label="Score" sortKey="score" sort={ceoSort} onSort={handleCeoSort} />
                        <SortHeader
                          label="Trips"
                          sortKey="total_trips"
                          sort={ceoSort}
                          onSort={handleCeoSort}
                        />
                        <SortHeader
                          label="Earnings"
                          sortKey="revenue_month"
                          sort={ceoSort}
                          onSort={handleCeoSort}
                        />
                        <SortHeader
                          label="Rating"
                          sortKey="rating_average"
                          sort={ceoSort}
                          onSort={handleCeoSort}
                        />
                      </tr>
                    </thead>
                                        <tbody>
                      {topDrivers.length ? (
                        topDrivers.map((driver, index) => (
                          <tr
                            key={driver.driver_id}
                            className={index < 3 ? "fleet-table__row--leader" : undefined}
                          >
                            <td className="fleet-table__rank">{index + 1}</td>
                            <td>
                              <DriverCell
                                name={driver.driver_name}
                                meta={driver.driver_email || driver.email}
                              />
                            </td>
                            <td>
                              <ScoreMeter score={driver.score} band={driver.score_band} />
                            </td>
                            <td className="fleet-table__num">{formatCount(driver.total_trips)}</td>
                            <td className="fleet-table__num">
                              {formatMoney(driver.revenue_month)}
                            </td>
                            <td className="fleet-table__num">
                              {formatPct(driver.rating_average)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="fleet-table__empty" colSpan={6}>
                            No ranked drivers returned for this selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="Lowest-performing drivers"
                note="Lowest performance scores. Shown for review only — no automatic penalty or suspension is applied."
                flush
              >
                <div className="fleet-table-wrap">
                  <table className="fleet-table">
                    <thead>
                      <tr>
                        <th className="fleet-table__rank" scope="col">
                          Rank
                        </th>
                        <SortHeader label="Driver" sortKey="driver_name" sort={lowSort} onSort={handleLowSort} />
                        <SortHeader label="Score" sortKey="score" sort={lowSort} onSort={handleLowSort} />
                        <SortHeader
                          label="Cancellation"
                          sortKey="cancellation_rate"
                          sort={lowSort}
                          onSort={handleLowSort}
                        />
                        <SortHeader
                          label="Trips"
                          sortKey="total_trips"
                          sort={lowSort}
                          onSort={handleLowSort}
                        />
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                                        <tbody>
                      {lowestDrivers.length ? (
                        lowestDrivers.map((driver, index) => (
                          <tr key={driver.driver_id} className="fleet-table__row--risk">
                            <td className="fleet-table__rank">{index + 1}</td>
                            <td>
                              <DriverCell
                                name={driver.driver_name}
                                meta={driver.driver_email || driver.email}
                              />
                            </td>
                            <td>
                              <ScoreMeter score={driver.score} band={driver.score_band} />
                            </td>
                            <td className="fleet-table__num">
                              {formatPct(driver.cancellation_rate)}
                            </td>
                            <td className="fleet-table__num">{formatCount(driver.total_trips)}</td>
                            <td>
                              <StatusPill status={driver.status} map={DRIVER_STATUS_LABELS} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="fleet-table__empty" colSpan={6}>
                            No driver data returned for this selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Revenue analytics"
              hint="Monthly revenue split by driver and by city, as returned by the CEO metrics payload. No chart is drawn because the API returns rankings, not time series."
            />
            <div className="fleet-grid fleet-grid--2">
              <Panel title="Revenue by driver" note="Top 20 by monthly revenue." flush>
                {(ceo.revenue_by_driver || []).length ? (
                  <div className="fleet-table-wrap">
                    <table className="fleet-table">
                      <thead>
                        <tr>
                          <th scope="col">Driver</th>
                          <th scope="col">Trips</th>
                          <th scope="col">Revenue (month)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ceo.revenue_by_driver || []).map((row) => (
                          <tr key={row.driver_id}>
                            <td>
                              <DriverCell name={row.name} />
                            </td>
                            <td className="fleet-table__num">{formatCount(row.trips)}</td>
                            <td className="fleet-table__num">{formatMoney(row.revenue_month)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="fleet-panel__body">
                    <EmptyState icon="💰" title="No revenue data" hint="No driver revenue recorded for this selection." />
                  </div>
                )}
              </Panel>

              <Panel title="Revenue by city" note="Active cities ranked by monthly revenue." flush>
                {(ceo.revenue_by_city || []).length ? (
                  <div className="fleet-table-wrap">
                    <table className="fleet-table">
                      <thead>
                        <tr>
                          <th scope="col">City</th>
                          <th scope="col">Drivers</th>
                          <th scope="col">Online now</th>
                          <th scope="col">Revenue (month)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ceo.revenue_by_city || []).map((row) => (
                          <tr key={row.city_id}>
                            <td>{row.city_name}</td>
                            <td className="fleet-table__num">{formatCount(row.driver_count)}</td>
                            <td className="fleet-table__num">{formatCount(row.online_now)}</td>
                            <td className="fleet-table__num">{formatMoney(row.revenue_month)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="fleet-panel__body">
                    <EmptyState icon="🏙️" title="No city data" hint="No city revenue recorded for this selection." />
                  </div>
                )}
              </Panel>
            </div>
          </section>
        </>
      ) : null}

      {tab === "reports" ? (
        <>
          <section className="fleet-section">
            <SectionHead
              title="Fleet reports"
              hint="Every report below maps to a report type implemented by the backend. Exports respect the city filter in the toolbar above."
              actions={
                <span className="fleet-toolbar__count">
                  City scope: <strong>{cityId ? "selected city" : "all cities"}</strong>
                </span>
              }
            />
            {FLEET_REPORT_CATALOG.map((group) => (
              <Panel key={group.section} title={group.section}>
                <div className="fleet-stack">
                  {group.reports.map((report) => (
                    <div key={report.id} className="fleet-report">
                      <div className="fleet-report__info">
                        <h4 className="fleet-report__title">{report.label}</h4>
                        <p className="fleet-report__desc">{report.description}</p>
                      </div>
                      <div className="fleet-report__actions">
                        <button
                          type="button"
                          className="fleet-btn fleet-btn--sm"
                          disabled={busyAction === `export-${report.id}-csv`}
                          onClick={() => handleExport(report.id, "csv")}
                        >
                          Export CSV
                        </button>
                        <button
                          type="button"
                          className="fleet-btn fleet-btn--sm"
                          disabled={busyAction === `export-${report.id}-pdf`}
                          onClick={() => handleExport(report.id, "pdf")}
                        >
                          Export PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </section>

          <section className="fleet-section">
            <SectionHead
              title="Report coverage gaps"
              hint="Report families that are not implemented by the backend. They are listed here so the interface never offers a control that cannot work."
            />
            <div className="fleet-stack">
              {UNSUPPORTED_REPORTS.map((gap) => (
                <div key={gap.label} className="fleet-gap">
                  <span>
                    <strong>{gap.label}</strong> — {gap.reason}
                  </span>
                </div>
              ))}
              <div className="fleet-gap">
                <span>
                  <strong>Date-range filtering</strong> — the export endpoint accepts only{" "}
                  <code>type</code>, <code>export_format</code> and <code>city_id</code>. Report
                  windows are fixed by the backend (for example, the Weekly Driver Report uses the
                  current week), so no date picker is shown.
                </span>
              </div>
              <div className="fleet-gap">
                <span>
                  <strong>In-page report preview</strong> — the backend returns report rows only as a
                  file download. There is no JSON preview endpoint, so no preview table is rendered
                  here.
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {selectedDriver ? (
        <section className="fleet-section">
          <div className="fleet-drawer">
            <div className="fleet-drawer__head">
              <div>
                <h3 className="fleet-drawer__title">
                  {selectedDriver.driver_name || selectedDriver.email || "Driver details"}
                </h3>
                <p className="fleet-panel__note">
                  Driver profile id {selectedDriver.driver_id} · user id {selectedDriver.user_id}
                </p>
              </div>
              <div className="fleet-action-bar">
                <button
                  type="button"
                  className="fleet-btn fleet-btn--sm"
                  onClick={() => setSelectedDriver(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="fleet-drawer__body">
              <div className="fleet-facts">
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Approval</div>
                  <div className="fleet-fact__value">
                    {DRIVER_STATUS_LABELS[selectedDriver.status]?.label ||
                      selectedDriver.status ||
                      "—"}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Activity</div>
                  <div className="fleet-fact__value">
                    {DISPATCH_STATUS_LABELS[selectedDriver.current_status]?.label ||
                      selectedDriver.current_status ||
                      "—"}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Score</div>
                  <div className="fleet-fact__value">
                    {selectedDriver.score ?? "—"} · {scoreBandMeta(selectedDriver.score_band).label}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Completed trips</div>
                  <div className="fleet-fact__value">{formatCount(selectedDriver.total_trips)}</div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Acceptance</div>
                  <div className="fleet-fact__value">
                    {formatPct(selectedDriver.acceptance_rate)}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Cancellation</div>
                  <div className="fleet-fact__value">
                    {formatPct(selectedDriver.cancellation_rate)}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Rating</div>
                  <div className="fleet-fact__value">
                    {formatPct(selectedDriver.rating_average)}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Wallet balance</div>
                  <div className="fleet-fact__value">
                    {formatMoney(selectedDriver.wallet_balance)}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Revenue (month)</div>
                  <div className="fleet-fact__value">
                    {formatMoney(selectedDriver.revenue_month)}
                  </div>
                </div>
                <div className="fleet-fact">
                  <div className="fleet-fact__label">Last online</div>
                  <div className="fleet-fact__value">
                    {formatDateTime(selectedDriver.last_online)}
                  </div>
                </div>
              </div>
              {(selectedDriver.badges || []).length ? (
                <div className="fleet-badge-list">
                  {(selectedDriver.badges || []).map((badge) => (
                    <span key={badge} className="fleet-badge">
                      {BADGE_LABELS[badge] || badge}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="fleet-action-bar">
                <button
                  type="button"
                  className="fleet-btn fleet-btn--danger"
                  disabled={busyAction === "suspend"}
                  onClick={() => runDriverAction("suspend", selectedDriver)}
                >
                  Suspend driver
                </button>
                <button
                  type="button"
                  className="fleet-btn"
                  disabled={busyAction === "reactivate"}
                  onClick={() => runDriverAction("reactivate", selectedDriver)}
                >
                  Reactivate driver
                </button>
              </div>

              <div className="fleet-form-row">
                <label className="fleet-field fleet-field--grow">
                  <span className="fleet-field__label">Send notification</span>
                  <textarea
                    className="fleet-textarea"
                    rows={3}
                    value={notifyMessage}
                    onChange={(event) => setNotifyMessage(event.target.value)}
                    placeholder="Message from Yala Operations"
                  />
                </label>
                <label className="fleet-field">
                  <span className="fleet-field__label">Assign training</span>
                  <select
                    className="fleet-select"
                    value={trainingType}
                    onChange={(event) => setTrainingType(event.target.value)}
                  >
                    <option value="service_quality">Service quality</option>
                    <option value="safety">Safety</option>
                    <option value="navigation">Navigation &amp; GPS</option>
                    <option value="payments">Payments &amp; wallet</option>
                  </select>
                </label>
              </div>

              <div className="fleet-action-bar">
                <button
                  type="button"
                  className="fleet-btn fleet-btn--primary"
                  disabled={busyAction === "notify"}
                  onClick={() => runDriverAction("notify", selectedDriver)}
                >
                  Send notification
                </button>
                <button
                  type="button"
                  className="fleet-btn"
                  disabled={busyAction === "training"}
                  onClick={() => runDriverAction("training", selectedDriver)}
                >
                  Assign training
                </button>
              </div>

            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}


















