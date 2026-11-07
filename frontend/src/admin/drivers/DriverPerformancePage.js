import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertBanner,
  BarChart,
  DataTable,
  FilterBar,
  KPICard,
  Select,
  StatusChip,
  ToastProvider,
} from "../components/library";
import {
  getDriverDirectory,
  getDriverPerformanceSummary,
  getSafetyIncidents,
} from "./driverAdminApi";
import DriverPerformanceProfile from "./DriverPerformanceProfile";
import { buildScoreBandDistribution, isEmptySeries } from "./driverPerformanceCharts";
import { useOperatingCityOptions } from "../layouts/useOperatingCityOptions";
import "./driverPerformance.css";

/**
 * Driver Performance Monitoring.
 *
 * `mode="performance"` — scored performance console (default).
 * `mode="activity"`    — operational activity counters, same data source.
 * `mode="ratings"`     — customer satisfaction view.
 *
 * Existing endpoints only:
 *   GET /drivers/performance/    → AdminDriverPerformanceView. Already returns the
 *                                  scored summary: score, score_band, acceptance_rate,
 *                                  cancellation_rate, rating_average, completed /
 *                                  accepted / received / missed / declined / cancelled
 *                                  rides, on_time_rate, recommendation, plus
 *                                  average_score / excellent_count / watch_count.
 *   GET /drivers/list/           → identity, photo, city, vehicle, level
 *   GET /safety/admin/incidents/ → safety incidents requiring review
 *
 * The scoring formula is NOT reimplemented here. Every score, band, rate and
 * recommendation is rendered exactly as the backend computes it, so this UI can
 * never disagree with the source of truth. See
 * .agents/tasks/driver-performance-scoring-review.md for the documented review of
 * that formula and its known limitations.
 */

const BAND_TONE = {
  excellent: "success",
  good: "success",
  watch: "warning",
  risk: "danger",
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

export default function DriverPerformancePage({ mode = "performance" }) {
  return (
    <ToastProvider>
      <DriverPerformanceInner mode={mode} />
    </ToastProvider>
  );
}

function DriverPerformanceInner({ mode }) {
  const [summary, setSummary] = useState({ loading: true, error: "", data: null });
  const [directory, setDirectory] = useState({ loading: true, error: "", rows: [] });
  const [incidents, setIncidents] = useState({ loading: true, error: "", rows: [] });
  const [filters, setFilters] = useState({ city: "", category: "", band: "", status: "", risk: "" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setSummary((prev) => ({ ...prev, loading: true, error: "" }));
    setDirectory((prev) => ({ ...prev, loading: true, error: "" }));
    setIncidents((prev) => ({ ...prev, loading: true, error: "" }));

    const [summaryResult, directoryResult, incidentsResult] = await Promise.allSettled([
      getDriverPerformanceSummary(),
      getDriverDirectory(),
      getSafetyIncidents(),
    ]);

    if (summaryResult.status === "fulfilled") {
      setSummary({ loading: false, error: "", data: summaryResult.value || null });
    } else {
      setSummary({
        loading: false,
        error: summaryResult.reason?.message || "Could not load driver performance.",
        data: null,
      });
    }

    if (directoryResult.status === "fulfilled") {
      const payload = directoryResult.value;
      setDirectory({ loading: false, error: "", rows: asArray(payload?.results || payload) });
    } else {
      setDirectory({ loading: false, error: directoryResult.reason?.message || "", rows: [] });
    }

    if (incidentsResult.status === "fulfilled") {
      const payload = incidentsResult.value;
      setIncidents({ loading: false, error: "", rows: asArray(payload?.results || payload) });
    } else {
      // Safety is a separate subsystem: a failure here must not blank the
      // performance console, but it must be visible rather than silent.
      setIncidents({ loading: false, error: incidentsResult.reason?.message || "", rows: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const directoryById = useMemo(() => {
    const map = new Map();
    directory.rows.forEach((row) => map.set(row.id, row));
    return map;
  }, [directory.rows]);

  /** Backend summary rows enriched with identity fields the summary does not carry. */
  const rows = useMemo(() => {
    const drivers = asArray(summary.data?.drivers);
    return drivers.map((driver) => {
      const profile = directoryById.get(driver.driver_id) || {};
      return {
        ...driver,
        driver_photo: profile.driver_photo || "",
        city_name: profile.city_name || "",
        vehicle_type: profile.car_type || profile.driver_category_label || "",
        driver_category_label: profile.driver_category_label || driver.driver_category || "",
        driver_level: driver.driver_level || profile.driver_level || "",
        status: driver.status || profile.status || "",
        average_rating: profile.average_rating ?? null,
      };
    });
  }, [summary.data, directoryById]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.city && row.city_name !== filters.city) return false;
      if (filters.category && row.driver_category_label !== filters.category) return false;
      if (filters.band && row.score_band !== filters.band) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.risk === "flagged" && !row.account_risk_flag) return false;
      if (filters.risk === "clear" && row.account_risk_flag) return false;
      if (!query) return true;
      return [row.driver_name, row.driver_id, row.city_name, row.driver_email]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [rows, filters, search]);

  /**
   * Fleet KPIs.
   *
   * `average_score`, `watch_count` and `driver_count` are taken verbatim from the
   * backend summary. The ride/rate aggregates are simple sums of the backend's own
   * per-driver counts, so they cannot drift from the source.
   */
  const kpis = useMemo(() => {
    const drivers = asArray(summary.data?.drivers);
    const totals = drivers.reduce(
      (acc, driver) => {
        acc.completed += Number(driver.completed_rides || 0);
        acc.cancelled += Number(driver.cancelled_rides || 0);
        acc.received += Number(driver.received_rides || 0);
        acc.accepted += Number(driver.accepted_rides || 0);
        return acc;
      },
      { completed: 0, cancelled: 0, received: 0, accepted: 0 }
    );

    const rated = drivers.filter((driver) => Number(driver.rating_average) > 0);
    const averageRating = rated.length
      ? rated.reduce((sum, driver) => sum + Number(driver.rating_average || 0), 0) / rated.length
      : null;

    const onTimeSamples = drivers.filter((driver) => Number(driver.arrival_samples) > 0);
    const onTimeRate = onTimeSamples.length
      ? onTimeSamples.reduce((sum, driver) => sum + Number(driver.on_time_rate || 0), 0) /
        onTimeSamples.length
      : null;

    return {
      activeDrivers: drivers.filter((driver) => String(driver.status) === "approved").length,
      trackedDrivers: summary.data?.driver_count ?? drivers.length,
      completedRides: totals.completed,
      cancelledRides: totals.cancelled,
      acceptanceRate: totals.received ? (totals.accepted / totals.received) * 100 : null,
      completionRate: totals.accepted ? (totals.completed / totals.accepted) * 100 : null,
      averageRating,
      averageScore: summary.data?.average_score ?? null,
      watchCount: summary.data?.watch_count ?? 0,
      safetyIncidents: incidents.rows.length,
      onTimeRate,
    };
  }, [summary.data, incidents.rows]);

  const { nameFilterOptions: cityOptions } = useOperatingCityOptions();

  const categoryOptions = useMemo(() => {
    const categories = new Set();
    rows.forEach((row) => {
      if (row.driver_category_label) categories.add(row.driver_category_label);
    });
    return [
      { value: "", label: "All driver categories" },
      ...[...categories].sort().map((category) => ({ value: category, label: category })),
    ];
  }, [rows]);

  const scoreBands = useMemo(() => buildScoreBandDistribution(rows), [rows]);

  const bandOptions = useMemo(() => {
    const bands = new Set();
    rows.forEach((row) => {
      if (row.score_band) bands.add(row.score_band);
    });
    return [
      { value: "", label: "All score bands" },
      ...[...bands].sort().map((band) => ({ value: band, label: band })),
    ];
  }, [rows]);

  const loading = summary.loading || directory.loading;

  const title =
    mode === "activity"
      ? "Driver Activity"
      : mode === "ratings"
        ? "Driver Ratings"
        : "Driver Performance";

  const subtitle =
    mode === "activity"
      ? "Operational activity counters per driver, taken from the backend performance summary."
      : mode === "ratings"
        ? "Customer satisfaction per driver. Ratings come from completed rides only."
        : "Scored performance console. Scores and bands are computed by the backend and rendered as-is.";

  return (
    <div className="driver-perf">
      <header className="driver-perf__head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
          Refresh
        </button>
      </header>

      {summary.error ? (
        <AlertBanner tone="danger">{`Performance: ${summary.error}`}</AlertBanner>
      ) : null}
      {incidents.error ? (
        <AlertBanner tone="warning">
          {`Safety incidents unavailable: ${incidents.error} (the rest of this page is unaffected)`}
        </AlertBanner>
      ) : null}

      {mode === "ratings" ? (
        <div className="admin-kpi-row driver-perf__kpis">
          <KPICard label="Drivers tracked" value={kpis.trackedDrivers} icon="🚕" loading={summary.loading} />
          <KPICard
            label="Average rating"
            value={kpis.averageRating === null ? "—" : kpis.averageRating.toFixed(2)}
            subtitle={kpis.averageRating === null ? "No ratings recorded yet" : "Out of 5"}
            tone="success"
            icon="⭐"
            loading={summary.loading}
          />
          <KPICard label="Completed rides" value={kpis.completedRides} icon="✅" loading={summary.loading} />
          <KPICard
            label="Drivers flagged for review"
            value={kpis.watchCount}
            tone="warning"
            icon="⚠"
            loading={summary.loading}
          />
        </div>
      ) : (
        <div className="admin-kpi-row driver-perf__kpis">
          <KPICard label="Active drivers" value={kpis.activeDrivers} icon="🟢" loading={summary.loading} />
          <KPICard label="Completed rides" value={kpis.completedRides} tone="success" icon="✅" loading={summary.loading} />
          <KPICard label="Cancelled rides" value={kpis.cancelledRides} tone="danger" icon="⛔" loading={summary.loading} />
          <KPICard
            label="Acceptance rate"
            value={kpis.acceptanceRate === null ? "—" : pct(kpis.acceptanceRate)}
            subtitle={kpis.acceptanceRate === null ? "No ride requests recorded" : "Fleet-wide"}
            icon="📥"
            loading={summary.loading}
          />
          <KPICard
            label="Completion rate"
            value={kpis.completionRate === null ? "—" : pct(kpis.completionRate)}
            subtitle={kpis.completionRate === null ? "No accepted rides recorded" : "Of accepted rides"}
            icon="🏁"
            loading={summary.loading}
          />
          <KPICard
            label="Average rating"
            value={kpis.averageRating === null ? "—" : kpis.averageRating.toFixed(2)}
            subtitle={kpis.averageRating === null ? "No ratings recorded yet" : "Out of 5"}
            icon="⭐"
            loading={summary.loading}
          />
          <KPICard
            label="Average score"
            value={kpis.averageScore === null ? "—" : kpis.averageScore}
            subtitle="Backend performance score"
            icon="🎯"
            loading={summary.loading}
          />
          <KPICard
            label="Safety incidents"
            value={kpis.safetyIncidents}
            tone={kpis.safetyIncidents ? "warning" : undefined}
            subtitle="Open incidents requiring review"
            icon="🚨"
            loading={incidents.loading}
          />
        </div>
      )}

      {/*
        The only fleet-level chart the current API supports: a distribution of the
        score bands the backend assigned. There is no fleet time-series endpoint, so
        daily/weekly/monthly fleet charts are deliberately absent rather than faked.
      */}
      <BarChart
        title="Fleet distribution by backend score band"
        subtitle="Counts of drivers per band, exactly as scored by /drivers/performance/"
        data={scoreBands}
        loading={loading}
        empty={!loading && isEmptySeries(scoreBands)}
        emptyLabel="No scored drivers matched these filters"
      />

      <DataTable
        title={title}
        columns={columnsFor(mode, setDetail)}
        rows={filteredRows}
        rowKey="driver_id"
        loading={loading}
        emptyLabel="No driver performance records matched these filters."
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search driver name, ID or city…"
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
        }}
        page={page}
        pageSize={pageSize}
        total={filteredRows.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onRefresh={load}
        exportFilename={`yala-driver-${mode}`}
        filters={
          <FilterBar
            onReset={() => setFilters({ city: "", category: "", band: "", status: "", risk: "" })}
          >
            <Select label="City" value={filters.city} onChange={(value) => setFilters((f) => ({ ...f, city: value }))} options={cityOptions} />
            <Select label="Driver category" value={filters.category} onChange={(value) => setFilters((f) => ({ ...f, category: value }))} options={categoryOptions} />
            <Select label="Score band" value={filters.band} onChange={(value) => setFilters((f) => ({ ...f, band: value }))} options={bandOptions} />
            <Select
              label="Account status"
              value={filters.status}
              onChange={(value) => setFilters((f) => ({ ...f, status: value }))}
              options={[
                { value: "", label: "All account statuses" },
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
            <Select
              label="Risk"
              value={filters.risk}
              onChange={(value) => setFilters((f) => ({ ...f, risk: value }))}
              options={[
                { value: "", label: "All drivers" },
                { value: "flagged", label: "Flagged only" },
                { value: "clear", label: "Not flagged" },
              ]}
            />
          </FilterBar>
        }
      />

      <DriverPerformanceProfile row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/** Columns per view. Values are rendered exactly as the backend returns them. */
export function columnsFor(mode, onView) {
  const identity = [
    { id: "driver_id", label: "Driver ID", sortable: true },
    {
      id: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) => (
        <span className="driver-perf__driver">
          {row.driver_photo ? (
            <img src={row.driver_photo} alt="" className="driver-perf__avatar" />
          ) : (
            <span className="driver-perf__avatar driver-perf__avatar--fallback" aria-hidden="true">
              {String(row.driver_name || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <span>{row.driver_name || "—"}</span>
        </span>
      ),
    },
    { id: "city_name", label: "City", sortable: true },
    { id: "driver_category_label", label: "Vehicle category", sortable: true },
  ];

  const view = {
    id: "actions",
    label: "Actions",
    render: (row) => (
      <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => onView(row)}>
        View profile
      </button>
    ),
  };

  if (mode === "activity") {
    return [
      ...identity,
      { id: "received_rides", label: "Received", sortable: true },
      { id: "accepted_rides", label: "Accepted", sortable: true },
      { id: "declined_rides", label: "Declined", sortable: true },
      { id: "missed_rides", label: "Missed", sortable: true },
      { id: "cancelled_rides", label: "Cancelled", sortable: true },
      { id: "completed_rides", label: "Completed", sortable: true },
      view,
    ];
  }

  if (mode === "ratings") {
    return [
      ...identity,
      {
        id: "rating_average",
        label: "Average rating",
        sortable: true,
        render: (row) =>
          Number(row.rating_average) > 0 ? Number(row.rating_average).toFixed(2) : "No ratings yet",
      },
      { id: "completed_rides", label: "Completed (rating base)", sortable: true },
      {
        id: "account_risk_flag",
        label: "Complaints / review",
        render: (row) =>
          row.account_risk_flag || row.account_under_review ? (
            <StatusChip
              label={row.account_risk_flag ? "Flagged" : "Under review"}
              tone={row.account_risk_flag ? "danger" : "warning"}
              title={row.account_risk_reason || ""}
            />
          ) : (
            <StatusChip label="None" tone="neutral" />
          ),
      },
      view,
    ];
  }

  return [
    ...identity,
    { id: "completed_rides", label: "Completed", sortable: true },
    { id: "acceptance_rate", label: "Acceptance", sortable: true, render: (row) => pct(row.acceptance_rate) },
    {
      id: "cancellation_rate",
      label: "Cancellation",
      sortable: true,
      render: (row) => pct(row.cancellation_rate),
    },
    {
      id: "rating_average",
      label: "Rating",
      sortable: true,
      render: (row) => (Number(row.rating_average) > 0 ? Number(row.rating_average).toFixed(2) : "—"),
    },
    {
      id: "on_time_rate",
      label: "On time",
      sortable: true,
      render: (row) =>
        Number(row.arrival_samples) > 0 ? (
          pct(row.on_time_rate)
        ) : (
          <span className="driver-perf__insufficient" title="No arrival samples recorded">
            No data
          </span>
        ),
    },
    {
      id: "score",
      label: "Score",
      sortable: true,
      render: (row) => (
        <span className="driver-perf__score">
          <strong>{row.score}</strong>
          {row.score_band ? (
            <StatusChip label={row.score_band} tone={BAND_TONE[row.score_band] || "neutral"} />
          ) : null}
        </span>
      ),
    },
    { id: "recommendation", label: "Recommendation", render: (row) => row.recommendation || "—" },
    view,
  ];
}
