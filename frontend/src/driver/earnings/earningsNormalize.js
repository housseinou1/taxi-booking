import { MARKET } from "../../marketConfig";

export function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatEarningsMRU(amount) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${MARKET.currency}`;
}

export function normalizePeriodEntry(entry = {}) {
  return {
    totalEarnings: toAmount(entry.total_earnings ?? entry.total),
    rideCount: Number(entry.ride_count ?? 0),
    currency: entry.currency || "MRU",
  };
}

export function normalizeEarningsPayload(payload = {}) {
  if (payload.earnings && typeof payload.earnings === "object") {
    const periods = payload.earnings;
    const breakdowns = payload.bonus_breakdowns || {};

    const mapBreakdown = (entry = {}) => ({
      bonus: toAmount(entry.bonus ?? entry.bonus_earnings),
      incentive: toAmount(entry.incentive ?? entry.incentive_earnings),
      referral: toAmount(entry.referral ?? entry.referral_earnings),
    });

    const mapPeriod = (key) => normalizePeriodEntry(periods[key] || {});

    return {
      today: mapPeriod("today"),
      week: mapPeriod("week"),
      month: mapPeriod("month"),
      year: mapPeriod("year"),
      lifetime: mapPeriod("lifetime"),
      breakdown: {
        today: mapBreakdown(breakdowns.today),
        week: mapBreakdown(breakdowns.week),
        month: mapBreakdown(breakdowns.month),
        year: mapBreakdown(breakdowns.year),
        lifetime: mapBreakdown(breakdowns.lifetime),
      },
      currency: payload.currency || "MRU",
    };
  }

  return {
    today: { totalEarnings: toAmount(payload.today_earnings), rideCount: 0 },
    week: { totalEarnings: toAmount(payload.week_earnings), rideCount: 0 },
    month: { totalEarnings: toAmount(payload.month_earnings), rideCount: 0 },
    year: { totalEarnings: toAmount(payload.year_earnings), rideCount: 0 },
    lifetime: { totalEarnings: toAmount(payload.total_earnings), rideCount: 0 },
    breakdown: {},
    currency: "MRU",
  };
}

export function normalizeChartPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.chart_data)
      ? payload.chart_data
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return list.map((item) => ({
    ...item,
    value: toAmount(item?.value ?? item?.earnings),
    earnings: toAmount(item?.earnings ?? item?.value),
    ride_count: Number(item?.ride_count ?? item?.trips ?? 0),
    label: item?.label || "",
  }));
}

function parseRideDate(ride) {
  const raw = ride?.completed_at || ride?.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterRidesInRange(rides, startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

  return (Array.isArray(rides) ? rides : []).filter((ride) => {
    if (ride?.status !== "completed") return false;
    const date = parseRideDate(ride);
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

export function aggregateRidesFinancials(rides, startDate = null, endDate = null) {
  const filtered = startDate || endDate
    ? filterRidesInRange(rides, startDate, endDate)
    : (Array.isArray(rides) ? rides : []).filter((ride) => ride?.status === "completed");

  return filtered.reduce(
    (acc, ride) => {
      acc.gross += toAmount(ride.fare);
      acc.commission += toAmount(ride.app_fee);
      acc.net += toAmount(ride.driver_earning ?? ride.driver_share);
      acc.tripCount += 1;
      const minutes = tripDrivingMinutes(ride);
      if (minutes != null) acc.drivingMinutes += minutes;
      return acc;
    },
    { gross: 0, commission: 0, net: 0, tripCount: 0, drivingMinutes: 0 },
  );
}

export function tripDrivingMinutes(ride) {
  const endRaw = ride?.completed_at;
  const startRaw = ride?.driver_arrived_at || ride?.created_at;
  if (!endRaw || !startRaw) return null;
  const end = new Date(endRaw);
  const start = new Date(startRaw);
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime()) || end <= start) {
    return null;
  }
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function averageTripValue(totalEarnings, tripCount) {
  if (!tripCount) return 0;
  return totalEarnings / tripCount;
}

export function revenuePerHour(earnings, hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  return toAmount(earnings) / h;
}
