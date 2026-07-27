import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { ensureValidAccessToken } from "../../auth/session";
import {
  aggregateRidesFinancials,
  normalizeChartPayload,
  normalizeEarningsPayload,
  toAmount,
} from "./earningsNormalize";

const AUTH_CONFIG = { suppressAuthRedirect: true };
const CACHE_KEY = "yala_driver_earnings_hub_cache_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_MS = 4000;

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // ignore quota errors
  }
}

async function getWithRetry(url, attempt = 0) {
  try {
    const response = await authenticatedApi.get(url, AUTH_CONFIG);
    return response.data;
  } catch (error) {
    if (attempt + 1 >= MAX_RETRIES) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    return getWithRetry(url, attempt + 1);
  }
}

export async function fetchEarningsChart(period = "daily") {
  const data = await getWithRetry(`${API_URL}/drivers/me/earnings/chart/?period=${period}`);
  return normalizeChartPayload(data);
}

export async function fetchRideDetail(rideId) {
  if (!rideId) return null;
  const data = await getWithRetry(`${API_URL}/rides/${rideId}/`);
  return data || null;
}

export async function fetchRecentTrips({ page = 1, status = "completed", dateFrom = "", dateTo = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), status });
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const data = await getWithRetry(`${API_URL}/drivers/me/rides/?${params.toString()}`);
  return {
    results: Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [],
    count: Number(data?.count ?? 0),
    currentPage: Number(data?.current_page ?? page),
    totalPages: Number(data?.total_pages ?? 1),
  };
}

export async function fetchDriverRideLedger() {
  const data = await getWithRetry(`${API_URL}/rides/driver-rides/`);
  return Array.isArray(data) ? data : [];
}

export async function fetchEarningsHub({ useCache = true } = {}) {
  const cached = useCache ? readCache() : null;
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const token = await ensureValidAccessToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  const [
    earningsRes,
    summaryRes,
    statsRes,
    onlineHoursRes,
    incentivesRes,
    bonusHistoryRes,
    walletRes,
    ridesRes,
  ] = await Promise.all([
    getWithRetry(`${API_URL}/drivers/me/earnings/`).catch(() => ({})),
    getWithRetry(`${API_URL}/rides/driver/earnings/`).catch(() => ({})),
    getWithRetry(`${API_URL}/drivers/me/stats/`).catch(() => ({})),
    getWithRetry(`${API_URL}/shifts/online-hours/`).catch(() => ({})),
    getWithRetry(`${API_URL}/incentives/my-progress/`).catch(() => ({})),
    getWithRetry(`${API_URL}/incentives/my-bonus-history/`).catch(() => ({})),
    getWithRetry(`${API_URL}/payments/withdrawals/`).catch(() => ({})),
    fetchDriverRideLedger().catch(() => []),
  ]);

  const earnings = normalizeEarningsPayload(earningsRes || {});
  const todayTripsFromSummary = Number(summaryRes?.today_completed_rides ?? 0);

  if (!earnings.today.rideCount && todayTripsFromSummary > 0) {
    earnings.today.rideCount = todayTripsFromSummary;
  }

  const todayFinancials = aggregateRidesFinancials(
    ridesRes,
    new Date().toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
  );

  const weekStart = getWeekStartIso();
  const monthStart = new Date();
  monthStart.setDate(1);
  const weekFinancials = aggregateRidesFinancials(ridesRes, weekStart, null);
  const monthFinancials = aggregateRidesFinancials(
    ridesRes,
    monthStart.toISOString().slice(0, 10),
    null,
  );

  const payload = {
    earnings,
    summary: {
      todayEarnings: toAmount(summaryRes?.today_earnings ?? earnings.today.totalEarnings),
      weekEarnings: toAmount(summaryRes?.week_earnings ?? earnings.week.totalEarnings),
      monthEarnings: toAmount(summaryRes?.month_earnings ?? earnings.month.totalEarnings),
      withdrawableBalance: toAmount(summaryRes?.withdrawable_balance),
      todayCompletedRides: todayTripsFromSummary || earnings.today.rideCount,
      charts: summaryRes?.charts || null,
      earningsDate: summaryRes?.earnings_date || null,
    },
    stats: statsRes || {},
    onlineHours: {
      today: toAmount(onlineHoursRes?.today_hours),
      week: toAmount(onlineHoursRes?.week_hours),
      month: toAmount(onlineHoursRes?.month_hours),
      total: toAmount(onlineHoursRes?.total_hours),
    },
    incentives: {
      campaigns: Array.isArray(incentivesRes?.active_campaigns)
        ? incentivesRes.active_campaigns
        : Array.isArray(incentivesRes?.active_goals)
          ? incentivesRes.active_goals
          : [],
      bonusSummary: incentivesRes?.bonus_summary || {},
      completed: Array.isArray(incentivesRes?.completed) ? incentivesRes.completed : [],
      totalBonusEarned: toAmount(incentivesRes?.total_bonus_earned),
      bonusHistory: Array.isArray(bonusHistoryRes?.history)
        ? bonusHistoryRes.history
        : Array.isArray(bonusHistoryRes?.results)
          ? bonusHistoryRes.results
          : Array.isArray(bonusHistoryRes)
            ? bonusHistoryRes
            : [],
    },
    wallet: walletRes || {},
    ridesLedger: ridesRes,
    financials: {
      today: todayFinancials,
      week: weekFinancials,
      month: monthFinancials,
    },
    fetchedAt: new Date().toISOString(),
  };

  writeCache(payload);
  return payload;
}

function getWeekStartIso() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  now.setDate(now.getDate() - diff);
  return now.toISOString().slice(0, 10);
}

export function clearEarningsHubCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
