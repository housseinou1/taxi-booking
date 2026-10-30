/**
 * YALA Hall of Fame - domain model and presentation helpers.
 *
 * Mirrors the backend recognition engine so the admin panel can only ever present
 * recognitions the engine actually produced:
 *   - HallOfFameRecognition.CATEGORY_CHOICES / BADGE_CHOICES   (drivers/models.py)
 *   - MILESTONES + the 4 award categories                      (drivers/hall_of_fame.py)
 *   - performance_score is int(round(0..100))                  (drivers/performance.py)
 *
 * Pure helpers only: no fetching, no mutation, no recognition-rule changes.
 */

/** Placeholder for "no value". Escaped so this source file stays pure ASCII. */
export const DASH = "\u2014";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The four award categories the recognition engine can produce.
 *
 * Source of truth: `HallOfFameRecognition.CATEGORY_CHOICES` in
 * `backend/taxi/taxi/drivers/models.py`. The engine awards:
 *   - `driver_of_month`   : exactly one winner per month (badge gold)
 *   - `top_national`      : ranks 1-3 per month ("#N Driver in Mauritania")
 *   - `top_city`          : ranks 1-3 per city per month ("#N Driver in <City>")
 *   - `lifetime_milestone`: 1,000 / 5,000 / 10,000 rides and "5 Years with Yala"
 *
 * `ranked` marks the categories whose `rank` is a genuine competition placing.
 * For `lifetime_milestone` the engine stores a default rank of 1, which is NOT a
 * placing, so it must never be shown as "#1".
 */
export const RECOGNITION_CATEGORIES = [
  {
    code: "driver_of_month",
    label: "Driver of the Month",
    short: "Driver of the Month",
    icon: "\uD83C\uDFC6",
    ranked: false,
  },
  {
    code: "top_national",
    label: "Top Driver in Mauritania",
    short: "National",
    icon: "\uD83C\uDF0D",
    ranked: true,
  },
  {
    code: "top_city",
    label: "Top Driver by City",
    short: "City",
    icon: "\uD83C\uDFD9\uFE0F",
    ranked: true,
  },
  {
    code: "lifetime_milestone",
    label: "Lifetime Milestone",
    short: "Milestone",
    icon: "\uD83C\uDF96\uFE0F",
    ranked: false,
  },
];

const CATEGORY_BY_CODE = RECOGNITION_CATEGORIES.reduce((acc, item) => {
  acc[item.code] = item;
  return acc;
}, {});

export function categoryMeta(code) {
  return CATEGORY_BY_CODE[code] || null;
}

export function categoryLabel(code) {
  if (!code) return "Recognition";
  return CATEGORY_BY_CODE[code]?.label || String(code).replaceAll("_", " ");
}

export function isRankedCategory(code) {
  return Boolean(CATEGORY_BY_CODE[code]?.ranked);
}

/**
 * Award tiers. The engine stores gold / silver / bronze on EVERY category, so the
 * tier means "award level", not necessarily a competition placing: a 10,000-ride
 * milestone is gold while a 1,000-ride milestone is bronze. The UI therefore shows
 * the tier as an award level and only adds "#N" for ranked categories.
 */
export const BADGE_TIERS = {
  gold: { label: "Gold", tone: "gold" },
  silver: { label: "Silver", tone: "silver" },
  bronze: { label: "Bronze", tone: "bronze" },
};

export function badgeMeta(badge) {
  return BADGE_TIERS[badge] || { label: "Recognised", tone: "info" };
}

export function monthLabel(month) {
  const index = Number(month);
  if (!Number.isFinite(index) || index < 1 || index > 12) return null;
  return MONTHS[index - 1];
}

/**
 * Reporting period for a recognition.
 *
 * Monthly awards carry a month; lifetime milestones are all-time and have
 * `month = null`, so they are labelled "all-time" rather than being silently
 * folded into whichever month happens to be selected.
 */
export function periodLabel(member) {
  const month = monthLabel(member?.month);
  const year = member?.year;
  if (month && year) return `${month} ${year}`;
  if (year) return `${year} all-time`;
  return month || DASH;
}

/** The period currently requested by the filters, for the header indicator. */
export function selectedPeriodLabel({ month, year }) {
  const label = monthLabel(month);
  if (label) return `${label} ${year}`;
  return `Full year ${year}`;
}

/** Performance score is a 0-100 integer produced by the engine. */
export function formatScore(value) {
  if (value === null || value === undefined || value === "") return DASH;
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : DASH;
}

/** Monthly ride volume / rating carried in `metadata` by the ranking engine. */
export function monthlyStats(member) {
  const meta = member?.metadata || {};
  const rides = Number(meta.monthly_completed_rides);
  const rating = Number(meta.monthly_rating);
  return {
    rides: Number.isFinite(rides) ? rides : null,
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
  };
}

/** Milestone threshold carried in `metadata` (rides_required / years_required). */
export function milestoneRequirement(member) {
  const meta = member?.metadata || {};
  const rides = Number(meta.rides_required);
  if (Number.isFinite(rides) && rides > 0) return `${rides.toLocaleString("en-US")} rides`;
  const years = Number(meta.years_required);
  if (Number.isFinite(years) && years > 0) return `${years} years of service`;
  return null;
}

/** Human date for `awarded_at` (an ISO datetime from the engine). */
export function formatAwardDate(value) {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Group recognitions by category, seeding the canonical category order so sections
 * never reorder themselves between renders.
 */
export function groupByCategory(members = []) {
  const groups = {};
  RECOGNITION_CATEGORIES.forEach((category) => {
    groups[category.code] = [];
  });
  members.forEach((member) => {
    if (!groups[member.category]) groups[member.category] = [];
    groups[member.category].push(member);
  });
  return groups;
}

/**
 * Headline figures for the overview cards.
 *
 * Computed from the SERVER-SCOPED set (year + city + month), which is the set the
 * endpoint actually returns. `bestScore` is null when nothing is present so the UI
 * can render a dash instead of a misleading 0.
 */
export function recognitionStats(members = []) {
  const drivers = new Set();
  const categories = new Set();
  let bestScore = null;

  members.forEach((member) => {
    if (member.driver_id !== null && member.driver_id !== undefined) {
      drivers.add(member.driver_id);
    }
    if (member.category) categories.add(member.category);
    const score = Number(member.performance_score);
    if (Number.isFinite(score) && (bestScore === null || score > bestScore)) {
      bestScore = score;
    }
  });

  return {
    recognitions: members.length,
    drivers: drivers.size,
    categories: categories.size,
    bestScore,
  };
}

/** Leaderboard ordering: placing first, then score, then name. */
export function byRankThenScore(a, b) {
  const rankA = Number(a.rank) || 99;
  const rankB = Number(b.rank) || 99;
  if (rankA !== rankB) return rankA - rankB;
  const scoreA = Number(a.performance_score) || 0;
  const scoreB = Number(b.performance_score) || 0;
  if (scoreA !== scoreB) return scoreB - scoreA;
  return String(a.driver_name || "").localeCompare(String(b.driver_name || ""));
}

/**
 * Split rows into their reporting periods, newest first.
 *
 * The engine stores one set of monthly placings per month, so a year-wide query
 * returns several independent leaderboards. Ranking them together would compare
 * September's #1 against October's #3, which is meaningless - this keeps each
 * period's placings in their own group.
 *
 * Rows with no month (lifetime milestones) form their own "all-time" group.
 */
export function groupByPeriod(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const month = Number.isFinite(Number(row.month)) && row.month ? Number(row.month) : null;
    const key = `${row.year}-${month ?? "all"}`;
    if (!groups.has(key)) groups.set(key, { key, year: row.year, month, rows: [] });
    groups.get(key).rows.push(row);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      label:
        group.month && group.year
          ? `${monthLabel(group.month)} ${group.year}`
          : group.year
          ? `${group.year} all-time`
          : "All-time",
      rows: [...group.rows].sort(byRankThenScore),
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return (b.year || 0) - (a.year || 0);
      return (b.month || 0) - (a.month || 0);
    });
}


