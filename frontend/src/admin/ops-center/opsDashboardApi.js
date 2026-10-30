/**
 * Ops Center dashboard adapter.
 *
 * `GET /operations/admin/dashboard/` no longer exists on the backend (404), but
 * five Ops Center pages still called it. No single endpoint replaces it: the old
 * route returned a UNION of blocks. This adapter reassembles that shape from the
 * two REAL endpoints that together carry the same information:
 *
 *   GET /operations/command/                     -> live_operations, alerts,
 *                                                   analytics, timeline, trips,
 *                                                   deliveries, heat_map, audit,
 *                                                   incidents, ceo_summary
 *   GET /operations/executive/dashboard/?period= -> live, finance, map,
 *                                                   operations, security,
 *                                                   support, qa
 *
 * No backend API was added. Results are cached briefly and concurrent callers
 * share one in-flight promise, so five pages opening the same view produce two
 * network requests instead of ten.
 */
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const CACHE_TTL_MS = 30000;

let cache = null; // { at, data }
let inFlight = null;

function buildDashboard(command, executive) {
  const live = executive?.live?.live || {};
  const today = executive?.live?.today || {};
  const summary = executive?.finance?.summary || {};
  const support = executive?.support || {};
  const liveOps = command?.live_operations || {};

  return {
    generated_at: command?.generated_at || executive?.live?.generated_at || null,

    // ── blocks consumed by the Ops Center pages ─────────────────────────────
    live,
    today,
    live_operations: liveOps,
    security: executive?.security || {},
    support,
    map: executive?.map || {},
    operations: executive?.operations || {},
    qa: executive?.qa || {},
    maintenance_mode: executive?.maintenance_mode || {},
    alerts: command?.alerts || {},
    analytics: command?.analytics || {},
    timeline: command?.timeline || [],
    trips: command?.trips || [],
    deliveries: command?.deliveries || [],
    heat_map: command?.heat_map || {},
    incidents: command?.incidents || {},
    audit: command?.audit || {},
    ceo_summary: command?.ceo_summary || {},
    permissions: { ...(executive?.permissions || {}), ...(command?.permissions || {}) },

    /**
     * Flat finance block. Only fields that a real endpoint actually reports are
     * populated — nothing is derived or estimated. Fields no existing endpoint
     * provides (weekly/monthly revenue, per-vertical approval queues) are left
     * absent so callers fall back to their own explicit defaults instead of
     * displaying an invented number.
     */
    finance: {
      active_drivers: live.active_drivers,
      active_couriers: live.active_couriers,
      active_deliveries: live.active_deliveries,
      active_riders: live.active_riders,
      active_trips: live.active_trips,
      today_revenue: today.revenue,
      today_trips: today.trips,
      today_deliveries: today.deliveries,
      gross_revenue: summary.gross_revenue,
      platform_commission: summary.platform_commission,
      wallet_balance: summary.wallet_balance,
      pending_withdrawals:
        typeof liveOps.pending_withdrawals === "object"
          ? liveOps.pending_withdrawals?.count
          : liveOps.pending_withdrawals ?? summary.pending_withdrawals,
      open_support_tickets: liveOps.open_support_tickets ?? support.open_tickets,
      failed_payments: liveOps.failed_payments?.count,
    },
  };
}

/** Fetch (or reuse) the assembled Ops Center dashboard. */
export async function fetchOpsDashboard({ period = "daily", force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inFlight) return inFlight;

  inFlight = Promise.allSettled([
    authenticatedApi.get(`${API_URL}/operations/command/`, { timeout: 20000 }),
    authenticatedApi.get(`${API_URL}/operations/executive/dashboard/`, {
      params: { period },
      timeout: 20000,
    }),
  ])
    .then(([commandRes, executiveRes]) => {
      const command = commandRes.status === "fulfilled" ? commandRes.value.data : null;
      const executive = executiveRes.status === "fulfilled" ? executiveRes.value.data : null;
      if (!command && !executive) {
        throw new Error("Ops Center dashboard is unavailable.");
      }
      const data = buildDashboard(command, executive);
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drop the cached dashboard (used on manual refresh). */
export function clearOpsDashboardCache() {
  cache = null;
}
