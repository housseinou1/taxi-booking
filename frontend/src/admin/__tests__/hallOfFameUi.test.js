import {
  BADGE_TIERS,
  DASH,
  MONTHS,
  RECOGNITION_CATEGORIES,
  badgeMeta,
  byRankThenScore,
  categoryLabel,
  categoryMeta,
  formatAwardDate,
  formatScore,
  groupByCategory,
  groupByPeriod,
  isRankedCategory,
  milestoneRequirement,
  monthLabel,
  monthlyStats,
  periodLabel,
  recognitionStats,
  selectedPeriodLabel,
} from "../hallOfFameUi";

/**
 * Mirrors `HallOfFameRecognition.CATEGORY_CHOICES` in
 * backend/taxi/taxi/drivers/models.py. If the backend adds a category this test
 * fails - which is the point, because the panel must only present real categories.
 */
const BACKEND_CATEGORY_CHOICES = [
  "driver_of_month",
  "top_city",
  "top_national",
  "lifetime_milestone",
];

/** Mirrors `HallOfFameRecognition.BADGE_CHOICES`. */
const BACKEND_BADGE_CHOICES = ["gold", "silver", "bronze"];

describe("hallOfFameUi domain model", () => {
  it("mirrors the backend category choices exactly", () => {
    expect(RECOGNITION_CATEGORIES.map((item) => item.code).sort()).toEqual(
      [...BACKEND_CATEGORY_CHOICES].sort()
    );
  });

  it("mirrors the backend badge choices exactly", () => {
    expect(Object.keys(BADGE_TIERS).sort()).toEqual([...BACKEND_BADGE_CHOICES].sort());
  });

  it("marks only the genuinely ranked categories as ranked", () => {
    expect(isRankedCategory("top_national")).toBe(true);
    expect(isRankedCategory("top_city")).toBe(true);
    // These store a default rank of 1, which is NOT a competition placing.
    expect(isRankedCategory("driver_of_month")).toBe(false);
    expect(isRankedCategory("lifetime_milestone")).toBe(false);
  });

  it("labels categories from the engine's own vocabulary", () => {
    expect(categoryLabel("driver_of_month")).toBe("Driver of the Month");
    expect(categoryLabel("top_national")).toBe("Top Driver in Mauritania");
    expect(categoryLabel("top_city")).toBe("Top Driver by City");
    expect(categoryLabel("lifetime_milestone")).toBe("Lifetime Milestone");
    // Unknown values degrade to a readable string instead of throwing.
    expect(categoryLabel("something_new")).toBe("something new");
    expect(categoryLabel(null)).toBe("Recognition");
  });

  it("gives every category an icon and a meta record", () => {
    RECOGNITION_CATEGORIES.forEach((item) => {
      expect(item.icon).toBeTruthy();
      expect(categoryMeta(item.code)).toBe(item);
    });
    expect(categoryMeta("nope")).toBeNull();
  });

  it("maps badges to tiers and falls back safely", () => {
    expect(badgeMeta("gold")).toEqual({ label: "Gold", tone: "gold" });
    expect(badgeMeta("silver")).toEqual({ label: "Silver", tone: "silver" });
    expect(badgeMeta("bronze")).toEqual({ label: "Bronze", tone: "bronze" });
    expect(badgeMeta(undefined)).toEqual({ label: "Recognised", tone: "info" });
  });
});

describe("hallOfFameUi periods and formatting", () => {
  it("maps month numbers to names and rejects anything else", () => {
    expect(MONTHS).toHaveLength(12);
    expect(monthLabel(1)).toBe("January");
    expect(monthLabel(9)).toBe("September");
    expect(monthLabel("12")).toBe("December");
    expect(monthLabel(0)).toBeNull();
    expect(monthLabel(13)).toBeNull();
    expect(monthLabel(null)).toBeNull();
    expect(monthLabel("")).toBeNull();
  });

  it("labels a monthly award with its month and a milestone as all-time", () => {
    expect(periodLabel({ year: 2026, month: 9 })).toBe("September 2026");
    // Lifetime milestones carry month = null; they must never be folded into a month.
    expect(periodLabel({ year: 2026, month: null })).toBe("2026 all-time");
    expect(periodLabel({})).toBe(DASH);
  });

  it("describes the period the filters currently request", () => {
    expect(selectedPeriodLabel({ month: "", year: 2026 })).toBe("Full year 2026");
    expect(selectedPeriodLabel({ month: "9", year: 2026 })).toBe("September 2026");
  });

  it("formats the 0-100 performance score without inventing a value", () => {
    expect(formatScore(96)).toBe("96");
    expect(formatScore(96.5)).toBe("96.5");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(null)).toBe(DASH);
    expect(formatScore(undefined)).toBe(DASH);
    expect(formatScore("")).toBe(DASH);
  });

  it("reads the monthly ride and rating statistics from metadata", () => {
    expect(
      monthlyStats({ metadata: { monthly_completed_rides: 210, monthly_rating: 4.85 } })
    ).toEqual({ rides: 210, rating: 4.9 });
    // Milestone records carry no monthly statistics.
    expect(monthlyStats({ metadata: { rides_required: 1000 } })).toEqual({
      rides: null,
      rating: null,
    });
    expect(monthlyStats({})).toEqual({ rides: null, rating: null });
    expect(monthlyStats(null)).toEqual({ rides: null, rating: null });
  });

  it("reads the milestone threshold from metadata", () => {
    expect(milestoneRequirement({ metadata: { rides_required: 5000 } })).toBe("5,000 rides");
    expect(milestoneRequirement({ metadata: { years_required: 5 } })).toBe("5 years of service");
    expect(milestoneRequirement({ metadata: {} })).toBeNull();
    expect(milestoneRequirement(null)).toBeNull();
  });

  it("formats the award date and degrades safely", () => {
    expect(formatAwardDate("2026-09-30T18:00:00Z")).toMatch(/2026/);
    expect(formatAwardDate(null)).toBe(DASH);
    expect(formatAwardDate("not-a-date")).toBe(DASH);
  });
});


describe("hallOfFameUi aggregation", () => {
  const members = [
    { id: 1, driver_id: 11, category: "driver_of_month", performance_score: 96, rank: 1 },
    { id: 2, driver_id: 11, category: "top_city", performance_score: 80, rank: 1 },
    { id: 3, driver_id: 12, category: "top_national", performance_score: 91, rank: 2 },
    { id: 4, driver_id: 13, category: "lifetime_milestone", performance_score: 70, rank: 1 },
  ];

  it("counts recognitions, unique drivers, categories and the best score", () => {
    expect(recognitionStats(members)).toEqual({
      recognitions: 4,
      drivers: 3, // driver 11 appears twice
      categories: 4,
      bestScore: 96,
    });
  });

  it("returns a null best score rather than 0 when nothing is present", () => {
    // A 0 would be indistinguishable from a genuine worst-possible score.
    expect(recognitionStats([]).bestScore).toBeNull();
    expect(recognitionStats([]).recognitions).toBe(0);
    expect(recognitionStats().bestScore).toBeNull();
  });

  it("groups by category and seeds the canonical order", () => {
    const groups = groupByCategory(members);
    expect(Object.keys(groups)).toEqual(RECOGNITION_CATEGORIES.map((item) => item.code));
    expect(groups.top_city).toHaveLength(1);
    expect(groups.driver_of_month).toHaveLength(1);
    // Categories with no rows still exist as empty arrays, so sections never reorder.
    expect(groupByCategory([]).top_national).toEqual([]);
  });

  it("orders a leaderboard by placing, then score, then name", () => {
    const rows = [
      { rank: 2, performance_score: 80, driver_name: "B" },
      { rank: 1, performance_score: 70, driver_name: "C" },
      { rank: 2, performance_score: 95, driver_name: "A" },
    ];
    expect([...rows].sort(byRankThenScore).map((row) => row.driver_name)).toEqual(["C", "A", "B"]);
  });
});

describe("hallOfFameUi period separation", () => {
  it("keeps each month's placings in their own group, newest first", () => {
    const rows = [
      { id: 1, year: 2026, month: 9, rank: 1, performance_score: 90, driver_name: "Sep #1" },
      { id: 2, year: 2026, month: 9, rank: 2, performance_score: 80, driver_name: "Sep #2" },
      { id: 3, year: 2026, month: 10, rank: 1, performance_score: 95, driver_name: "Oct #1" },
    ];
    const groups = groupByPeriod(rows);

    expect(groups.map((group) => group.label)).toEqual(["October 2026", "September 2026"]);
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[1].rows).toHaveLength(2);
    // September's board never contains October's winner.
    expect(groups[1].rows.map((row) => row.driver_name)).toEqual(["Sep #1", "Sep #2"]);
  });

  it("puts all-time rows in their own group", () => {
    const groups = groupByPeriod([
      { id: 1, year: 2026, month: null, rank: 1, driver_name: "Milestone" },
      { id: 2, year: 2026, month: 9, rank: 1, driver_name: "Monthly" },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["September 2026", "2026 all-time"]);
  });

  it("orders within a period by placing", () => {
    const groups = groupByPeriod([
      { id: 1, year: 2026, month: 9, rank: 3, performance_score: 99, driver_name: "Third" },
      { id: 2, year: 2026, month: 9, rank: 1, performance_score: 50, driver_name: "First" },
    ]);
    expect(groups[0].rows.map((row) => row.driver_name)).toEqual(["First", "Third"]);
  });

  it("handles an empty input", () => {
    expect(groupByPeriod()).toEqual([]);
    expect(groupByPeriod([])).toEqual([]);
  });
});

