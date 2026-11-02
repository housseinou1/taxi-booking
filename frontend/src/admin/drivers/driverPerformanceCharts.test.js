/**
 * Driver Performance chart series builders.
 *
 * These guard the rule that a chart may only plot values the backend supplied:
 * real zeroes stay zero, missing data stays null/absent, and nothing is invented.
 */
import {
  buildCommissionBuckets,
  buildDailyCompletedSeries,
  buildDailyEarningsSeries,
  buildEarningsBuckets,
  buildOutcomeSeries,
  buildRatingSeries,
  buildScoreBandDistribution,
  isEmptySeries,
  recentDayKeys,
  toDateKey,
} from "./driverPerformanceCharts";

/** An ISO timestamp `days` ago at midday local, so the local date cannot shift. */
const dayOffset = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

describe("toDateKey / recentDayKeys", () => {
  it("returns null for unusable input instead of an epoch date", () => {
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey("")).toBeNull();
    expect(toDateKey("not-a-date")).toBeNull();
  });

  it("lists the last N local days oldest-first, including today", () => {
    expect(recentDayKeys(3, new Date(2026, 0, 10))).toEqual([
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
  });
});

describe("buildDailyCompletedSeries", () => {
  it("counts completed rides on their completion day and zeroes the rest", () => {
    const rides = [
      { status: "completed", completed_at: dayOffset(0) },
      { status: "completed", completed_at: dayOffset(0) },
      { status: "completed", completed_at: dayOffset(2) },
    ];
    const series = buildDailyCompletedSeries(rides, 3);
    expect(series).toHaveLength(3);
    expect(series[2].value).toBe(2);
    expect(series[1].value).toBe(0); // genuinely no rides that day
    expect(series[0].value).toBe(1);
  });

  it("ignores rides that are not completed and rides outside the window", () => {
    const rides = [
      { status: "cancelled", completed_at: dayOffset(1) },
      { status: "completed", completed_at: dayOffset(40) },
    ];
    expect(buildDailyCompletedSeries(rides, 3).every((point) => point.value === 0)).toBe(true);
  });

  it("returns an all-zero series for no rides rather than throwing", () => {
    const series = buildDailyCompletedSeries([], 2);
    expect(series).toHaveLength(2);
    expect(series.every((point) => point.value === 0)).toBe(true);
  });
});

describe("buildDailyEarningsSeries", () => {
  it("sums real driver_earning values per day and tolerates nulls", () => {
    const rides = [
      { status: "completed", completed_at: dayOffset(0), driver_earning: "120.50" },
      { status: "completed", completed_at: dayOffset(0), driver_earning: "79.50" },
      { status: "completed", completed_at: dayOffset(0), driver_earning: null },
    ];
    expect(buildDailyEarningsSeries(rides, 1)[0].value).toBe(200);
  });

  it("does not count earnings from non-completed rides", () => {
    const rides = [{ status: "cancelled", completed_at: dayOffset(0), driver_earning: "500" }];
    expect(buildDailyEarningsSeries(rides, 1)[0].value).toBe(0);
  });
});

describe("buildRatingSeries", () => {
  it("averages ratings per day and omits days with no rated ride", () => {
    const rides = [
      { completed_at: dayOffset(0), rating: 5 },
      { completed_at: dayOffset(0), rating: 4 },
      { completed_at: dayOffset(2), rating: 3 },
    ];
    const series = buildRatingSeries(rides, 3);
    expect(series).toHaveLength(2); // the middle day is omitted, not plotted as 0
    expect(series[series.length - 1].value).toBe(4.5);
    expect(series[0].value).toBe(3);
  });

  it("ignores zero and null ratings — an unrated ride is not a bad rating", () => {
    const rides = [
      { completed_at: dayOffset(0), rating: 0 },
      { completed_at: dayOffset(0), rating: null },
    ];
    expect(buildRatingSeries(rides, 1)).toEqual([]);
  });
});

describe("earnings buckets", () => {
  const payload = {
    today: { earnings_mru: "150.00", commission_mru: "25.00", ride_count: 2 },
    week: { earnings_mru: "900.00", commission_mru: "150.00", ride_count: 11 },
    month: { earnings_mru: "4100.00", commission_mru: "700.00", ride_count: 48 },
    total: { earnings_mru: "91200.00", commission_mru: "15800.00", ride_count: 1204 },
  };

  it("maps the four backend buckets in order", () => {
    const buckets = buildEarningsBuckets(payload);
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "Today",
      "This week",
      "This month",
      "All time",
    ]);
    expect(buckets[0].value).toBe(150);
    expect(buckets[3].value).toBe(91200);
  });

  it("reports a null bucket as null, never as 0", () => {
    const buckets = buildEarningsBuckets({ ...payload, today: { earnings_mru: null } });
    expect(buckets[0].value).toBeNull();
  });

  it("returns an empty array when earnings were not loaded", () => {
    expect(buildEarningsBuckets(null)).toEqual([]);
  });

  it("exposes platform commission from the same payload", () => {
    const commission = buildCommissionBuckets(payload);
    expect(commission[0].value).toBe(25);
    expect(commission[3].value).toBe(15800);
  });
});

describe("buildOutcomeSeries", () => {
  it("uses the backend's own totals, with the remainder as Other", () => {
    const series = buildOutcomeSeries({ total_rides: 10, completed_rides: 6, cancelled_rides: 2 });
    expect(series).toEqual([
      { label: "Completed", value: 6 },
      { label: "Cancelled", value: 2 },
      { label: "Other", value: 2 },
    ]);
  });

  it("never produces a negative Other bucket", () => {
    const series = buildOutcomeSeries({ total_rides: 1, completed_rides: 5, cancelled_rides: 5 });
    expect(series.find((point) => point.label === "Other").value).toBe(0);
  });

  it("returns nothing when the summary was not loaded", () => {
    expect(buildOutcomeSeries(null)).toEqual([]);
  });
});

describe("buildScoreBandDistribution", () => {
  it("counts backend-assigned bands, most common first", () => {
    const distribution = buildScoreBandDistribution([
      { score_band: "good" },
      { score_band: "good" },
      { score_band: "risk" },
      { score_band: undefined },
    ]);
    expect(distribution).toEqual([
      { label: "good", value: 2 },
      { label: "risk", value: 1 },
    ]);
  });
});

describe("isEmptySeries", () => {
  it("treats nulls, zeroes and empty input as no data", () => {
    expect(isEmptySeries([])).toBe(true);
    expect(isEmptySeries(null)).toBe(true);
    expect(isEmptySeries([{ label: "a", value: 0 }])).toBe(true);
    expect(isEmptySeries([{ label: "a", value: null }])).toBe(true);
    expect(isEmptySeries([{ label: "a", value: 0 }, { label: "b", value: 3 }])).toBe(false);
  });
});
