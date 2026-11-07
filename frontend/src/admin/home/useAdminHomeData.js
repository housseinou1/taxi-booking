/**
 * Real data for the Admin home dashboard.
 *
 * Sources:
 *   GET /operations/command/              -> live_operations, timeline, alerts
 *   GET /operations/executive/dashboard/  -> live, operations, finance (period + optional city)
 *   GET /admin/approvals/stats/           -> active/pending riders, drivers, couriers
 *   GET /rides/history/                   -> bare list of rides (legacy KPI fallback)
 *   GET /payments/admin/finance/overview/ -> finance module aggregates
 *   GET /operations/multi-city/           -> optional ceo_overview.revenue_by_city (ops + feature)
 *
 * HONESTY RULES:
 *   - Never invent a number. Absent values are null → UI shows "Not enough data yet".
 *   - Never compute a trend without a real prior-period baseline.
 *   - Never report uptime: not recorded.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import { subscribeOperationsUpdates } from "../operations/opsSocket";

/** Background refresh while the dashboard is open (ops centers poll ~8–15s; home is calmer). */
export const ADMIN_HOME_POLL_MS = 30_000;

const LIVE_EVENT_TYPES = new Set([
  "operations_update",
  "safety_alert",
  "ride_status_update",
  "ride_update",
]);

const NO_DATA = null;

function num(...candidates) {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && c.trim() !== "" && Number.isFinite(Number(c))) return Number(c);
  }
  return NO_DATA;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = k.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Dotted-path read that keeps null/undefined (no fallback chaining). */
function at(obj, path) {
  return path.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

/**
 * Sum of `fare` across completed rides in /rides/history/.
 * Returns null when there is nothing to sum, so the UI stays honest.
 */
export function sumCompletedFare(rides) {
  const list = Array.isArray(rides) ? rides : [];
  if (list.length === 0) return NO_DATA;
  let total = 0;
  let counted = 0;
  for (const r of list) {
    if (r?.status !== "completed") continue;
    const f = Number(r?.fare);
    if (Number.isFinite(f)) {
      total += f;
      counted += 1;
    }
  }
  return counted === 0 ? NO_DATA : Math.round(total * 100) / 100;
}

async function safeGet(url, config) {
  try {
    const res = await authenticatedApi.get(url, config);
    return res?.data ?? res ?? null;
  } catch {
    return null;
  }
}

/**
 * Executive dashboard-driven KPI row (CEO / Operations / Finance).
 * Prefers `/operations/executive/dashboard/` aggregates over ride-history sums.
 */
/** Normalized 0–1 series for a KPI mini-sparkline (real points only — never interpolated). */
function sparklineFromValues(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
    .filter((v) => v != null);
  if (nums.length < 2) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  if (span <= 0) return nums.map(() => 0.5);
  return nums.map((v) => (v - min) / span);
}

function sparklineForKpi(key, executive) {
  if (key !== "gross_revenue") return [];
  const chart = buildFinanceChart(executive);
  const rev = chart.map((p) => p.revenue).filter((v) => v != null && Number.isFinite(Number(v)));
  return sparklineFromValues(rev.map((v) => Number(v)));
}

export function buildExecutiveHomeKpis(executive) {
  if (executive == null || executive === undefined) return null;
  const counts = pick(executive, "operations.rides.counts") || {};
  const delCounts = pick(executive, "operations.deliveries.counts") || {};
  const live = pick(executive, "live.live") || {};
  const gross = num(pick(executive, "finance.summary.gross_revenue"));
  const base = [
    {
      key: "completed_rides",
      label: "Completed Rides",
      value: num(at(counts, "completed")),
      trend: NO_DATA,
      sparkline: [],
      tone: "amber",
    },
    {
      key: "completed_deliveries",
      label: "Completed Deliveries",
      value: num(at(delCounts, "delivered")),
      trend: NO_DATA,
      sparkline: [],
      tone: "blue",
    },
    {
      key: "gross_revenue",
      label: "Total Revenue",
      value: gross,
      suffix: "MRU",
      trend: NO_DATA,
      sparkline: [],
      tone: "cyan",
    },
    {
      key: "active_drivers",
      label: "Active Drivers",
      value: num(at(live, "active_drivers")),
      trend: NO_DATA,
      sparkline: [],
      tone: "green",
    },
    {
      key: "active_riders",
      label: "Active Customers",
      value: num(at(live, "active_riders")),
      trend: NO_DATA,
      sparkline: [],
      tone: "purple",
    },
  ];
  return base.map((row) => ({
    ...row,
    sparkline: sparklineForKpi(row.key, executive),
  }));
}

export function buildKpis({ command, executive, rides, approvals, finance }) {
  const execTiles = buildExecutiveHomeKpis(executive);
  if (execTiles) return [...execTiles, ...buildFinanceModuleTiles(finance)];

  const a = approvals || {};
  const counts = pick(executive, "operations.rides.counts") || {};
  const liveOps = pick(command, "live_operations") || {};
  const tiles = [];

  if (approvals !== null && approvals !== undefined) {
    tiles.push(
      {
        key: "riders",
        label: "Total Riders",
        value: num(at(a, "active_riders")),
        trend: NO_DATA,
        sparkline: [],
        tone: "green",
      },
      {
        key: "drivers",
        label: "Total Drivers",
        value: num(at(a, "active_drivers")),
        trend: NO_DATA,
        sparkline: [],
        tone: "blue",
      },
      {
        key: "delivery",
        label: "Delivery Drivers",
        value: num(at(a, "active_couriers")),
        trend: NO_DATA,
        sparkline: [],
        tone: "purple",
      }
    );
  }
  if (executive !== null && executive !== undefined) {
    tiles.push({
      key: "completed",
      label: "Completed Rides",
      value: num(at(counts, "completed")),
      trend: NO_DATA,
      sparkline: [],
      tone: "amber",
    });
  }
  if (rides !== null && rides !== undefined) {
    tiles.push({
      key: "revenue",
      label: "Total Revenue",
      value: sumCompletedFare(rides),
      suffix: "MRU",
      trend: NO_DATA,
      sparkline: [],
      tone: "cyan",
    });
  }
  if (command !== null && command !== undefined) {
    tiles.push({
      key: "active",
      label: "Active Rides",
      value: num(at(liveOps, "active_rides")),
      trend: NO_DATA,
      sparkline: [],
      tone: "green",
      live: true,
    });
  }

  return [...tiles, ...buildFinanceModuleTiles(finance)];
}

function buildFinanceModuleTiles(finance) {
  if (finance === null || finance === undefined) return [];
  const f = finance || {};
  const wallets = pick(f, "wallets") || {};
  const withdrawals = pick(f, "withdrawals") || {};
  const refunds = pick(f, "refunds") || {};
  const payouts = pick(f, "merchant_payouts") || {};
  return [
    {
      key: "wallet_balance",
      label: "Wallet Balance",
      value: num(at(wallets, "total_balance")),
      suffix: "MRU",
      trend: NO_DATA,
      sparkline: [],
      tone: "cyan",
    },
    {
      key: "pending_withdrawals",
      label: "Pending Withdrawals",
      value: num(at(withdrawals, "pending")),
      trend: NO_DATA,
      sparkline: [],
      tone: "amber",
    },
    {
      key: "refunds_awaiting_ceo",
      label: "Refunds Awaiting CEO",
      value: num(at(refunds, "awaiting_ceo")),
      trend: NO_DATA,
      sparkline: [],
      tone: "purple",
    },
    {
      key: "merchant_payouts_pending",
      label: "Merchant Payouts Pending",
      value: num(at(payouts, "pending")),
      trend: NO_DATA,
      sparkline: [],
      tone: "blue",
    },
  ];
}

export function buildFinanceChart(executive) {
  const chart = pick(executive, "finance.chart");
  if (!Array.isArray(chart) || chart.length === 0) return [];
  return chart.map((row) => ({
    date: row?.date || "",
    label: row?.label || row?.date || "",
    revenue: num(row?.revenue, row?.gross_revenue),
    commission: num(row?.commission, row?.platform_commission),
  }));
}

/** Mix of completed ride vs delivery counts for the donut (platform totals from executive). */
export function buildOrdersMix(executive) {
  if (executive == null || executive === undefined) return null;
  const rc = pick(executive, "operations.rides.counts") || {};
  const dc = pick(executive, "operations.deliveries.counts") || {};
  const rides = num(at(rc, "completed"));
  const deliveries = num(at(dc, "delivered"));
  if (rides == null && deliveries == null) return null;
  const r = Number(rides) || 0;
  const d = Number(deliveries) || 0;
  const total = r + d;
  if (total <= 0) return { total: 0, rides: r, deliveries: d, ridesPct: null, delPct: null };
  return {
    total,
    rides: r,
    deliveries: d,
    ridesPct: Math.round((100 * r) / total * 10) / 10,
    delPct: Math.round((100 * d) / total * 10) / 10,
  };
}

/**
 * Ride pipeline from executive operations ride counts (platform totals in DB).
 * UI must label these as all-time aggregates, not a single calendar day.
 */
/**
 * Order status column aligned with the executive reference: mixes live snapshot,
 * CEO daily summary (today), and platform-wide queue counts where "today" is unavailable.
 */
export function buildOrderStatusToday({ command, executive }) {
  const live = pick(command, "live_operations") || {};
  const ceo = pick(command, "ceo_summary") || {};
  const tripsToday = pick(ceo, "trips") || {};
  const delToday = pick(ceo, "deliveries") || {};
  const rc = pick(executive, "operations.rides.counts") || {};
  const dc = pick(executive, "operations.deliveries.counts") || {};

  const activeR = num(at(live, "active_rides"));
  const activeD = num(at(live, "active_deliveries"));
  let ongoing = NO_DATA;
  if (activeR != null || activeD != null) {
    ongoing = (activeR ?? 0) + (activeD ?? 0);
  }

  const cr = num(at(tripsToday, "completed_rides_today"));
  const cd = num(at(delToday, "completed_deliveries_today"));
  let completedToday = NO_DATA;
  if (cr != null || cd != null) {
    completedToday = (cr ?? 0) + (cd ?? 0);
  }

  const scheduled = num(at(rc, "scheduled"));
  const cancelledR = num(at(rc, "cancelled"));
  const cancelledD = num(at(dc, "cancelled"));
  let cancelled = NO_DATA;
  if (cancelledR != null || cancelledD != null) {
    cancelled = (cancelledR ?? 0) + (cancelledD ?? 0);
  }

  return [
    {
      key: "ongoing",
      label: "Ongoing",
      value: ongoing,
      hint: "Active rides and deliveries in progress (live snapshot).",
    },
    {
      key: "completed_today",
      label: "Completed",
      value: completedToday,
      hint: "Rides and deliveries completed today (CEO daily summary), when the command feed includes it.",
    },
    {
      key: "scheduled",
      label: "Scheduled",
      value: scheduled,
      hint: "Rides currently in scheduled status (platform total).",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: cancelled,
      hint: "Rides and deliveries in cancelled status (platform total).",
    },
  ];
}

export function buildOperationsPipeline(executive) {
  if (executive == null || executive === undefined) return [];
  const rc = pick(executive, "operations.rides.counts") || {};
  const ongoingKeys = ["requested", "scheduled", "driver_arriving", "driver_arrived", "in_progress", "searching"];
  let ongoing = 0;
  let ongoingAny = false;
  for (const k of ongoingKeys) {
    const v = num(at(rc, k));
    if (v != null) {
      ongoing += v;
      ongoingAny = true;
    }
  }
  return [
    { key: "ongoing", label: "Ongoing", value: ongoingAny ? ongoing : NO_DATA },
    { key: "completed", label: "Completed", value: num(at(rc, "completed")) },
    { key: "scheduled", label: "Scheduled", value: num(at(rc, "scheduled")) },
    { key: "cancelled", label: "Cancelled", value: num(at(rc, "cancelled")) },
  ];
}

/** Top cities by revenue share from multi-city CEO overview (real backend). */
export function buildCityPerformance(multiCity) {
  const rows = pick(multiCity, "ceo_overview.revenue_by_city");
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const parsed = rows
    .map((row) => ({
      id: row?.city_id,
      name: row?.city_name || "City",
      revenue: num(row?.revenue != null ? String(row.revenue) : null),
    }))
    .filter((r) => r.revenue != null && r.revenue > 0);
  const total = parsed.reduce((s, r) => s + r.revenue, 0);
  if (total <= 0) return [];
  return parsed
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((r) => ({
      ...r,
      pct: Math.round((100 * r.revenue) / total * 10) / 10,
    }));
}

/** Today's operations, from verified executive.live.today + command.live_operations. */
export function buildToday({ command, executive }) {
  const t = pick(executive, "live.today") || {};
  const liveOps = pick(command, "live_operations") || {};
  return {
    new_rides: num(at(t, "trips")),
    new_deliveries: num(at(t, "deliveries")),
    new_registrations: NO_DATA,
    open_safety_reports: num(at(liveOps, "open_safety_incidents")),
  };
}

/** Pending actions, from the verified /admin/approvals/stats/ shape. */
export function buildPending(approvals) {
  const a = approvals || {};
  return {
    pending_drivers: num(at(a, "pending_drivers")),
    pending_riders: num(at(a, "pending_riders")),
    pending_couriers: num(at(a, "pending_couriers")),
    approved_today: num(at(a, "approved_today")),
    rejected_today: num(at(a, "rejected_today")),
    suspended_accounts: num(at(a, "suspended_accounts")),
  };
}

/** Recent activity, from the verified command.timeline[] shape. */
export function buildActivity(command) {
  const list = pick(command, "timeline");
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((e) => ({
    text: e?.summary || e?.type || "Activity recorded",
    meta: e?.at || "",
    tone: "ok",
  }));
}

/** System health, from the verified live_operations.infrastructure shape. */
export function buildHealth(command) {
  const infra = pick(command, "live_operations.infrastructure");
  if (!infra || typeof infra !== "object") return [];
  const LABEL = {
    api: "API Services",
    database: "Database",
    redis: "Redis / Cache",
    celery: "Background Workers",
    websocket: "Notifications",
    payments: "Payments",
  };
  return Object.keys(LABEL)
    .filter((k) => infra[k] && typeof infra[k] === "object")
    .map((k) => {
      const status = String(infra[k].status || "unknown");
      return { name: LABEL[k], status, ok: status === "ok", label: status.replace(/_/g, " ") };
    });
}

const ALWAYS_TRUE = () => true;

const SOURCE_MODULES = ["ceo", "ops", "launch", "rides", "drivers", "riders", "finance"];

const PERIOD_API = { today: "daily", "7d": "weekly", "30d": "monthly", "90d": "monthly", "1y": "yearly" };

async function fetchAdminHomePayload({ grantKey, periodParam, cityId }) {
  const granted = new Set(grantKey ? grantKey.split(",") : []);
  const wants = {
    command: granted.has("ceo") || granted.has("ops") || granted.has("launch") || granted.has("finance"),
    executive: granted.has("ceo") || granted.has("ops") || granted.has("finance"),
    rides: granted.has("rides"),
    approvals: granted.has("drivers") || granted.has("riders"),
    finance: granted.has("finance"),
    multiCity: granted.has("ceo") || granted.has("ops"),
  };

  const execParams = { period: periodParam };
  if (cityId) execParams.city = cityId;

  const mcParams = {};
  if (cityId) mcParams.city_id = cityId;

  const spec = [
    { on: wants.command, run: () => safeGet(`${API_URL}/operations/command/`, { timeout: 20000 }) },
    {
      on: wants.executive,
      run: () =>
        safeGet(`${API_URL}/operations/executive/dashboard/`, {
          params: execParams,
          timeout: 20000,
        }),
    },
    { on: wants.rides, run: () => safeGet(`${API_URL}/rides/history/`) },
    { on: wants.approvals, run: () => safeGet(`${API_URL}/admin/approvals/stats/`) },
    {
      on: wants.finance,
      run: () => safeGet(`${API_URL}/payments/admin/finance/overview/`, { timeout: 20000 }),
    },
    {
      on: wants.multiCity,
      run: () => safeGet(`${API_URL}/operations/multi-city/`, { params: mcParams, timeout: 20000 }),
    },
  ];

  const results = await Promise.all(spec.map((s) => (s.on ? s.run() : Promise.resolve(null))));
  const [command, executive, rides, approvals, finance, multiCity] = results;

  const attempted = spec.filter((s) => s.on).length;
  const anyOk = results.some((value, index) => spec[index].on && value !== null);

  const executiveFinance = executive?.finance;
  const orderStatusToday = buildOrderStatusToday({
    command: command || {},
    executive: executive || {},
  });

  return {
    error: attempted > 0 && !anyOk ? "Could not reach the YALA API." : null,
    noPermittedSources: attempted === 0,
    raw: { command, executive, rides, approvals, finance, multiCity },
    kpis: buildKpis({ command, executive, rides, approvals, finance }),
    financeChart: buildFinanceChart(executive),
    ordersMix: buildOrdersMix(executive),
    orderStatusToday,
    operationsPipeline: buildOperationsPipeline(executive),
    cityPerformance: buildCityPerformance(multiCity),
    today: buildToday({ command, executive }),
    pending: buildPending(approvals),
    activity: buildActivity(command),
    health: buildHealth(command),
    alerts: pick(command, "alerts.alerts") || [],
    executiveMeta: executiveFinance
      ? {
          period: executiveFinance.period,
          startDate: executiveFinance.start_date,
          endDate: executiveFinance.end_date,
        }
      : null,
    approvals: approvals || {},
    finance: finance || {},
    generatedAt: pick(command, "generated_at") || pick(executive, "live.generated_at") || null,
  };
}

/**
 * @param {object} options
 * @param {function(string): boolean} [options.canView]
 * @param {string} [options.cityId] - locations.City id for executive + multi-city scope
 * @param {string} [options.executivePeriod] - UI period key: today | 7d | 30d | 90d | 1y
 * @param {boolean} [options.live] - poll + WebSocket refresh while mounted
 */
export default function useAdminHomeData({ canView, cityId, executivePeriod = "today", live = true } = {}) {
  const [state, setState] = useState({ loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const allowed = canView || ALWAYS_TRUE;
  const grantKey = SOURCE_MODULES.filter((m) => allowed(m)).join(",");

  const periodParam = PERIOD_API[executivePeriod] || "daily";
  const fetchKey = `${grantKey}|${periodParam}|${cityId || ""}`;

  const loadSoft = useCallback(async () => {
    setRefreshing(true);
    try {
      const payload = await fetchAdminHomePayload({ grantKey, periodParam, cityId });
      setState((s) => ({ ...s, loading: false, ...payload }));
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setRefreshing(false);
    }
  }, [grantKey, periodParam, cityId]);

  const loadSoftRef = useRef(loadSoft);
  loadSoftRef.current = loadSoft;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const payload = await fetchAdminHomePayload({ grantKey, periodParam, cityId });
      if (cancelled) return;
      setState({ loading: false, ...payload });
      setLastUpdatedAt(new Date().toISOString());
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce, grantKey, periodParam, cityId]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(() => {
      loadSoftRef.current();
    }, ADMIN_HOME_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, fetchKey]);

  useEffect(() => {
    if (!live) return undefined;
    return subscribeOperationsUpdates((message) => {
      const type = String(message?.type || "");
      if (type) setLiveConnected(true);
      if (type && LIVE_EVENT_TYPES.has(type)) {
        loadSoftRef.current();
      }
    });
  }, [live, fetchKey]);

  return {
    ...state,
    reload,
    refreshing,
    live: {
      connected: liveConnected,
      pollMs: ADMIN_HOME_POLL_MS,
      lastUpdatedAt,
      serverGeneratedAt: state.generatedAt,
    },
  };
}
