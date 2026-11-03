import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertBanner,
  BarChart,
  DataTable,
  DateRangePicker,
  DonutChart,
  KPICard,
  LineChart,
  Modal,
  StatusChip,
} from "../components/library";
import { getDriverEarnings, getDriverRideHistory } from "./driversApi";
import {
  buildCommissionBuckets,
  buildDailyCompletedSeries,
  buildDailyEarningsSeries,
  buildEarningsBuckets,
  buildOutcomeSeries,
  buildRatingSeries,
  isEmptySeries,
} from "./driverPerformanceCharts";
import "./driverPerformance.css";

/**
 * Individual driver performance profile.
 *
 * Everything here is backend data:
 *   GET /drivers/performance/               → the score/rates passed in as `row`
 *   GET /rides/admin/driver/<id>/earnings/  → today / week / month / total buckets
 *   GET /rides/admin/driver/<id>/history/   → real rides (paginated, date-filterable)
 *
 * The ride-history endpoint genuinely supports `date_from` / `date_to`, so the
 * date-range selector below is a real server-side filter, not a client-side slice.
 *
 * Charts are built only from rows the backend returned. Because ride history is
 * paginated (max 100 rows per request), the time-series charts state the window
 * they cover rather than implying they are the driver's entire history.
 */

const HISTORY_PAGE_SIZE = 100;
const SERIES_DAYS = 14;

const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

export default function DriverPerformanceProfile({ row, onClose }) {
  const [earnings, setEarnings] = useState({ state: "idle", data: null, error: "" });
  const [history, setHistory] = useState({ state: "idle", data: null, error: "" });
  const [range, setRange] = useState({ start: "", end: "" });

  const driverId = row?.driver_id;

  const loadEarnings = useCallback(async () => {
    if (!driverId) return;
    setEarnings({ state: "loading", data: null, error: "" });
    try {
      const data = await getDriverEarnings(driverId);
      setEarnings({ state: "done", data, error: "" });
    } catch (error) {
      setEarnings({ state: "error", data: null, error: error?.message || "Could not load earnings." });
    }
  }, [driverId]);

  const loadHistory = useCallback(
    async (start = "", end = "") => {
      if (!driverId) return;
      setHistory({ state: "loading", data: null, error: "" });
      try {
        const params = { page: 1, page_size: HISTORY_PAGE_SIZE };
        if (start) params.date_from = start;
        if (end) params.date_to = end;
        const data = await getDriverRideHistory(driverId, params);
        setHistory({ state: "done", data, error: "" });
      } catch (error) {
        setHistory({
          state: "error",
          data: null,
          error: error?.message || "Could not load ride history.",
        });
      }
    },
    [driverId]
  );

  useEffect(() => {
    setEarnings({ state: "idle", data: null, error: "" });
    setHistory({ state: "idle", data: null, error: "" });
    setRange({ start: "", end: "" });
    if (driverId) {
      loadEarnings();
      loadHistory();
    }
  }, [driverId, loadEarnings, loadHistory]);

  const rides = useMemo(
    () => (Array.isArray(history.data?.results) ? history.data.results : []),
    [history.data]
  );
  const summary = history.data?.summary || null;

  /**
   * The history endpoint paginates (max 100 rows per request), so the time-series
   * charts can cover only a window of the driver's rides. `count` is the total the
   * backend matched; when it exceeds the rows returned, the charts are a partial
   * view and must say so.
   */
  const totalMatching = Number(history.data?.count ?? rides.length);
  const isTruncated = totalMatching > rides.length;

  // Carried on every chart so a screenshot of a chart alone still states its window.
  const windowNote = isTruncated
    ? `Partial window — ${rides.length} of ${totalMatching.toLocaleString()} rides`
    : `All ${rides.length} ride${rides.length === 1 ? "" : "s"} in this filter`;

  const series = useMemo(
    () => ({
      completed: buildDailyCompletedSeries(rides, SERIES_DAYS),
      earnings: buildDailyEarningsSeries(rides, SERIES_DAYS),
      ratings: buildRatingSeries(rides, SERIES_DAYS),
      buckets: buildEarningsBuckets(earnings.data),
      outcomes: buildOutcomeSeries(summary),
    }),
    [rides, earnings.data, summary]
  );

  const bucket = (key) => earnings.data?.[key] || null;

  // Money values arrive as Decimal strings or null (never 0 when there is no data).
  const money = (value) =>
    value === null || value === undefined || value === ""
      ? "No data"
      : `${Number(value).toLocaleString()} MRU`;

  const commissionSeries = useMemo(
    () => buildCommissionBuckets(earnings.data),
    [earnings.data]
  );

  const historyColumns = useMemo(
    () => [
      { id: "id", label: "Ride", sortable: true },
      {
        id: "completed_at",
        label: "Date",
        sortable: true,
        render: (ride) => {
          const stamp = ride.completed_at || ride.created_at;
          return stamp ? new Date(stamp).toLocaleDateString() : "—";
        },
      },
      {
        id: "status",
        label: "Status",
        sortable: true,
        render: (ride) => (
          <StatusChip
            label={String(ride.status || "").replace(/_/g, " ")}
            tone={ride.status === "completed" ? "success" : ride.status === "cancelled" ? "danger" : "warning"}
          />
        ),
      },
      { id: "fare", label: "Fare (MRU)", sortable: true, render: (ride) => money(ride.fare) },
      {
        id: "driver_earning",
        label: "Driver earning (MRU)",
        sortable: true,
        render: (ride) => money(ride.driver_earning),
      },
      {
        id: "rating",
        label: "Rating",
        sortable: true,
        render: (ride) =>
          Number(ride.rating) > 0 ? `${Number(ride.rating).toFixed(1)} / 5` : "Not rated",
      },
    ],
    []
  );

  // Every hook above runs unconditionally, and the guard sits after them, so the
  // hook order cannot change when a driver is selected or the dialog closes.
  if (!row) return null;

  const completionRate = Number(row.accepted_rides)
    ? (Number(row.completed_rides) / Number(row.accepted_rides)) * 100
    : null;

  return (
    <Modal open title={`${row.driver_name} — performance profile`} onClose={onClose}>
      <h4>Driver information</h4>
      <dl className="driver-perf__detail">
        <div>
          <dt>Driver ID</dt>
          <dd>{row.driver_id}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{row.driver_name}</dd>
        </div>
        <div>
          <dt>City</dt>
          <dd>{row.city_name || "—"}</dd>
        </div>
        <div>
          <dt>Vehicle category</dt>
          <dd>{row.driver_category_label || "—"}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{row.driver_level || "—"}</dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd>
            <StatusChip
              label={row.status || "unknown"}
              tone={row.status === "approved" ? "success" : "warning"}
            />
          </dd>
        </div>
      </dl>

      <h4>Ride performance</h4>
      <dl className="driver-perf__detail">
        <div>
          <dt>Requests received</dt>
          <dd>{row.received_rides}</dd>
        </div>
        <div>
          <dt>Accepted</dt>
          <dd>{row.accepted_rides}</dd>
        </div>
        <div>
          <dt>Declined</dt>
          <dd>{row.declined_rides}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>{row.missed_rides}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{row.completed_rides}</dd>
        </div>
        <div>
          <dt>Cancelled</dt>
          <dd>{row.cancelled_rides}</dd>
        </div>
        <div>
          <dt>Acceptance rate</dt>
          <dd>{pct(row.acceptance_rate)}</dd>
        </div>
        <div>
          <dt>Completion rate</dt>
          <dd>{completionRate === null ? "No accepted rides recorded" : pct(completionRate)}</dd>
        </div>
        <div>
          <dt>On-time rate</dt>
          <dd>
            {Number(row.arrival_samples) > 0 ? (
              <>
                {pct(row.on_time_rate)}{" "}
                <small>
                  ({row.on_time_arrivals}/{row.arrival_samples} arrivals)
                </small>
              </>
            ) : (
              <span className="driver-perf__insufficient">No arrival samples recorded</span>
            )}
          </dd>
        </div>
      </dl>

      <h4>Customer satisfaction</h4>
      <dl className="driver-perf__detail">
        <div>
          <dt>Average rating</dt>
          <dd>
            {Number(row.rating_average) > 0
              ? `${Number(row.rating_average).toFixed(2)} / 5`
              : "No ratings recorded"}
          </dd>
        </div>
        <div>
          <dt>Complaints / review</dt>
          <dd>
            {row.account_risk_flag || row.account_under_review ? (
              <StatusChip
                label={row.account_risk_flag ? "Flagged" : "Under review"}
                tone={row.account_risk_flag ? "danger" : "warning"}
                title={row.account_risk_reason || ""}
              />
            ) : (
              <StatusChip label="None recorded" tone="neutral" />
            )}
          </dd>
        </div>
      </dl>
      {row.account_risk_reason ? (
        <p className="driver-perf__reason">
          <strong>Reason on record:</strong> {row.account_risk_reason}
        </p>
      ) : null}

      <h4>Financial summary</h4>
      {earnings.state === "loading" ? (
        <p className="driver-perf__insufficient">Loading earnings…</p>
      ) : earnings.state === "error" ? (
        <p className="driver-perf__reason">{earnings.error}</p>
      ) : earnings.state === "done" ? (
        <>
          <div className="admin-kpi-row driver-perf__kpis">
            <KPICard
              label="Earnings today"
              value={money(bucket("today")?.earnings_mru)}
              subtitle={`${bucket("today")?.ride_count ?? 0} completed rides`}
              icon="💰"
            />
            <KPICard
              label="This week"
              value={money(bucket("week")?.earnings_mru)}
              subtitle={`${bucket("week")?.ride_count ?? 0} completed rides`}
              icon="📅"
            />
            <KPICard
              label="This month"
              value={money(bucket("month")?.earnings_mru)}
              subtitle={`${bucket("month")?.ride_count ?? 0} completed rides`}
              icon="🗓"
            />
            <KPICard
              label="All-time earnings"
              value={money(bucket("total")?.earnings_mru)}
              subtitle={`${bucket("total")?.ride_count ?? 0} completed rides`}
              icon="🏦"
            />
          </div>

          <div className="driver-perf__chart-row">
            <BarChart
              title="Driver earnings by period (MRU)"
              data={series.buckets}
              empty={isEmptySeries(series.buckets)}
              emptyLabel="No completed rides in these periods"
            />
            <BarChart
              title="Platform commission by period (MRU)"
              data={commissionSeries}
              empty={isEmptySeries(commissionSeries)}
              emptyLabel="No commission recorded in these periods"
            />
          </div>

          <dl className="driver-perf__detail">
            <div>
              <dt>Commission (all time)</dt>
              <dd>{money(bucket("total")?.commission_mru)}</dd>
            </div>
            <div>
              <dt>Payout basis (all time)</dt>
              <dd>{money(bucket("total")?.payout_mru)}</dd>
            </div>
            <div>
              <dt>Average per completed ride</dt>
              <dd>{money(history.data?.summary?.average_earning_mru)}</dd>
            </div>
            <div>
              <dt>Lifetime ride earnings</dt>
              <dd>{money(history.data?.summary?.total_earnings_mru)}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <h4>Performance trends</h4>
      {history.state === "error" ? (
        <p className="driver-perf__reason">{history.error}</p>
      ) : (
        <>
          {isTruncated ? (
            <AlertBanner
              tone="warning"
              title="These charts cover only part of this driver's history"
            >
              The ride-history API returns at most {HISTORY_PAGE_SIZE} rides per request, so these
              charts are built from the <strong>{rides.length}</strong> most recent rides out of{" "}
              <strong>{totalMatching.toLocaleString()}</strong> matching the current filter. Days
              before that window can show zero activity even though the driver was working. Narrow
              the date range below to inspect an earlier period.
            </AlertBanner>
          ) : (
            <p className="driver-perf__insufficient">
              Built from all {rides.length} ride{rides.length === 1 ? "" : "s"} returned by the
              ride-history API for this filter (max {HISTORY_PAGE_SIZE} per request).
            </p>
          )}
          <div className="driver-perf__chart-row">
            <LineChart
              title={`Completed trips — last ${SERIES_DAYS} days`}
              subtitle={windowNote}
              data={series.completed}
              loading={history.state === "loading"}
              empty={history.state === "done" && isEmptySeries(series.completed)}
              emptyLabel="No completed trips in this window"
            />
            <BarChart
              title={`Driver earnings per day (MRU) — last ${SERIES_DAYS} days`}
              subtitle={windowNote}
              data={series.earnings}
              loading={history.state === "loading"}
              empty={history.state === "done" && isEmptySeries(series.earnings)}
              emptyLabel="No earnings in this window"
            />
            <LineChart
              title="Average customer rating over time"
              subtitle={windowNote}
              data={series.ratings}
              loading={history.state === "loading"}
              empty={history.state === "done" && isEmptySeries(series.ratings)}
              emptyLabel="No rated rides in this window"
            />
            <DonutChart
              title="Ride outcomes (lifetime)"
              subtitle="Lifetime totals from the history summary, not limited by pagination"
              data={series.outcomes}
              loading={history.state === "loading"}
              empty={history.state === "done" && isEmptySeries(series.outcomes)}
              emptyLabel="No rides recorded"
            />
          </div>
        </>
      )}

      <h4>Ride history</h4>
      <div className="driver-perf__range">
        <DateRangePicker
          start={range.start}
          end={range.end}
          onStartChange={(value) => setRange((prev) => ({ ...prev, start: value }))}
          onEndChange={(value) => setRange((prev) => ({ ...prev, end: value }))}
          label="Ride date range (applied by the API, not the browser)"
        />
        <div className="driver-perf__range-actions">
          <button
            type="button"
            className="admin-lib-btn"
            disabled={history.state === "loading"}
            onClick={() => loadHistory(range.start, range.end)}
          >
            Apply
          </button>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            disabled={history.state === "loading"}
            onClick={() => {
              setRange({ start: "", end: "" });
              loadHistory();
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {history.state === "error" ? <p className="driver-perf__reason">{history.error}</p> : null}

      <DataTable
        title="Rides"
        columns={historyColumns}
        rows={rides}
        rowKey="id"
        loading={history.state === "loading"}
        searchable={false}
        pageSize={10}
        exportFilename={`driver-${row.driver_id}-rides`}
        emptyLabel={
          range.start || range.end
            ? "No rides matched this date range."
            : "This driver has no recorded rides."
        }
      />

      <p className="driver-perf__note">
        Score {row.score} ({row.score_band}) — {row.recommendation}. Scoring is operational only:
        safety incidents are reviewed separately and never suspend a driver automatically.
      </p>
    </Modal>
  );
}
