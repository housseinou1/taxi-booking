/**
 * Driver Performance — chart series builders.
 *
 * Every function here is PURE and takes only data the backend already returned.
 * No series is synthesised: a day with no rides is reported as 0 because the
 * driver genuinely had no rides, and a bucket the backend did not provide is
 * reported as null (never 0), so the UI can render "no data" honestly.
 *
 * Sources (all pre-existing endpoints):
 *   GET /drivers/performance/                → per-driver score + ride counters
 *   GET /rides/admin/driver/<id>/history/    → rides with completed_at, status,
 *                                              driver_earning, rating
 *   GET /rides/admin/driver/<id>/earnings/   → { total, today, week, month }
 *
 * There is no fleet-level driver time-series endpoint, so fleet charts are limited
 * to distributions of backend-provided values. Time series are built per driver
 * from that driver's real ride rows.
 */

const DAY_MS = 86400000;

/** Local-date key `YYYY-MM-DD`. Returns null for unusable input. */
export function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The last `days` local dates, oldest first, including today. */
export function recentDayKeys(days = 14, now = new Date()) {
  const keys = [];
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(toDateKey(new Date(base.getTime() - offset * DAY_MS)));
  }
  return keys;
}

const shortLabel = (key) => {
  const [, month, day] = String(key).split("-");
  return `${day}/${month}`;
};

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Daily completed trips for one driver.
 *
 * Rides are counted on `completed_at` (falling back to `created_at`) so a trip
 * lands on the day it finished.
 */
export function buildDailyCompletedSeries(rides = [], days = 14) {
  const keys = recentDayKeys(days);
  const counts = new Map(keys.map((key) => [key, 0]));

  rides.forEach((ride) => {
    if (String(ride?.status || "").toLowerCase() !== "completed") return;
    const key = toDateKey(ride.completed_at || ride.created_at);
    if (key && counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  return keys.map((key) => ({ label: shortLabel(key), value: counts.get(key) }));
}

/** Daily driver earnings for one driver, from real `driver_earning` values. */
export function buildDailyEarningsSeries(rides = [], days = 14) {
  const keys = recentDayKeys(days);
  const totals = new Map(keys.map((key) => [key, 0]));

  rides.forEach((ride) => {
    if (String(ride?.status || "").toLowerCase() !== "completed") return;
    const key = toDateKey(ride.completed_at || ride.created_at);
    if (!key || !totals.has(key)) return;
    totals.set(key, totals.get(key) + num(ride.driver_earning));
  });

  return keys.map((key) => ({ label: shortLabel(key), value: Math.round(totals.get(key)) }));
}

/**
 * Average customer rating per day for one driver.
 *
 * Days with no rated ride are omitted rather than plotted as 0 — a missing rating
 * is not a bad rating.
 */
export function buildRatingSeries(rides = [], days = 14) {
  const keys = recentDayKeys(days);
  const buckets = new Map(keys.map((key) => [key, []]));

  rides.forEach((ride) => {
    const rating = Number(ride?.rating);
    if (!Number.isFinite(rating) || rating <= 0) return;
    const key = toDateKey(ride.completed_at || ride.created_at);
    if (key && buckets.has(key)) buckets.get(key).push(rating);
  });

  return keys
    .filter((key) => buckets.get(key).length > 0)
    .map((key) => {
      const values = buckets.get(key);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { label: shortLabel(key), value: Number(average.toFixed(2)) };
    });
}

const EARNINGS_BUCKETS = [
  { label: "Today", key: "today" },
  { label: "This week", key: "week" },
  { label: "This month", key: "month" },
  { label: "All time", key: "total" },
];

/**
 * Earnings buckets from GET /rides/admin/driver/<id>/earnings/.
 * A bucket the backend returned as null is reported as null so the chart can show
 * "no data" instead of a false zero.
 */
export function buildEarningsBuckets(earnings) {
  if (!earnings) return [];
  return EARNINGS_BUCKETS.map(({ label, key }) => {
    const bucket = earnings[key];
    if (!bucket || bucket.earnings_mru === null || bucket.earnings_mru === undefined) {
      return { label, value: null };
    }
    return { label, value: num(bucket.earnings_mru) };
  });
}

/** Platform commission per bucket, from the same real payload. */
export function buildCommissionBuckets(earnings) {
  if (!earnings) return [];
  return EARNINGS_BUCKETS.map(({ label, key }) => {
    const bucket = earnings[key];
    if (!bucket || bucket.commission_mru === null || bucket.commission_mru === undefined) {
      return { label, value: null };
    }
    return { label, value: num(bucket.commission_mru) };
  });
}

/** Completed vs cancelled vs other, from the backend's own history summary. */
export function buildOutcomeSeries(summary) {
  if (!summary) return [];
  const total = num(summary.total_rides);
  const completed = num(summary.completed_rides);
  const cancelled = num(summary.cancelled_rides);
  return [
    { label: "Completed", value: completed },
    { label: "Cancelled", value: cancelled },
    { label: "Other", value: Math.max(0, total - completed - cancelled) },
  ];
}

/**
 * Fleet score-band distribution.
 *
 * Counts the bands the backend assigned. This is a distribution of real values,
 * not a time series, so it is the only fleet-level chart the current API supports.
 */
export function buildScoreBandDistribution(drivers = []) {
  const counts = new Map();
  drivers.forEach((driver) => {
    const band = driver?.score_band;
    if (!band) return;
    counts.set(band, (counts.get(band) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

/**
 * True when a series carries no usable value, so the chart shell can show its
 * empty state rather than an axis of zeroes. Nulls are treated as "no data".
 */
export function isEmptySeries(data) {
  if (!Array.isArray(data) || data.length === 0) return true;
  return data.every(
    (point) => point?.value === null || point?.value === undefined || Number(point.value) === 0
  );
}
