/**
 * Real data for the Admin home dashboard.
 *
 * Sources (all pre-existing, no new backend route):
 *   GET /operations/command/              -> live_operations, timeline, alerts
 *   GET /operations/executive/dashboard/  -> live, operations, finance, support, security
 *   GET /admin/approvals/stats/           -> active/pending riders, drivers, couriers
 *   GET /rides/history/                   -> bare list of rides (fare, status)
 *
 * FIELD CONTRACTS WERE VERIFIED against a running backend (local staging,
 * sqlite) on 2026-11-05. Exact shapes observed:
 *
 *   /admin/approvals/stats/
 *     { pending_riders, pending_drivers, pending_couriers, approved_today,
 *       rejected_today, suspended_accounts, active_riders, active_drivers,
 *       active_couriers, is_ceo }
 *
 *   /operations/executive/dashboard/
 *     .live.live    { active_drivers, active_couriers, active_riders,
 *                     active_deliveries, active_trips }
 *     .live.today   { trips, deliveries, revenue, driver_earnings,
 *                     courier_earnings, platform_commission,
 *                     withdrawal_requests, refund_requests }
 *     .operations.rides.counts { requested, scheduled, driver_arriving,
 *                     driver_arrived, in_progress, completed, cancelled,
 *                     rider_no_show, searching }
 *     .operations.rides.queue[ { id, status, pickup, destination, created_at } ]
 *     .finance.summary { gross_revenue, platform_commission, wallet_balance, ... }
 *     .support      { open_tickets, urgent_tickets, refund_requests, disputes }
 *     .security     { blocked_accounts, suspended_drivers, expired_documents,
 *                     failed_logins_24h, open_fraud_flags }
 *
 *   /operations/command/
 *     .live_operations { active_rides, active_deliveries, online_drivers,
 *                     online_couriers, open_safety_incidents,
 *                     open_support_tickets, system_alerts, platform_status,
 *                     infrastructure{api,database,redis,celery,websocket} }
 *     .ceo_summary.revenue { gross_today_mru, net_estimate_mru, refunds_today_mru }
 *     .ceo_summary.trips   { completed_rides_today,
 *                            ride_completion_rate_7d_pct,  <-- null in practice
 *                            cancellation_rate_7d_pct }    <-- null in practice
 *     .timeline[ { at, type, summary, entity_type, entity_id } ]
 *     .alerts   { total, critical_count, alerts[ { severity, title, created_at } ] }
 *
 *   /rides/history/  -> a BARE ARRAY (not paginated) of ride objects, each with
 *                       status, fare, created_at, completed_at, pickup,
 *                       destination, driver_name, rider_name.
 *
 * HONESTY RULES (these matter):
 *   - Never invent a number. If a value is absent, it is null and the UI shows
 *     "Not enough data yet".
 *   - Never compute a trend without a real prior-period baseline. The backend
 *     itself returns ride_completion_rate_7d_pct = null, which is why every
 *     trend chip reads "Trend unavailable".
 *   - Never report uptime: nothing in the system records it.
 */
import { useCallback, useEffect, useState } from "react";

import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

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

export function buildKpis({ command, executive, rides, approvals, finance }) {
  const a = approvals || {};
  const counts = pick(executive, "operations.rides.counts") || {};
  const liveOps = pick(command, "live_operations") || {};
  const f = finance || {};
  const tiles = [];

  // Operational tiles. Each group is emitted ONLY when the role was actually
  // allowed to fetch that source - so Finance/HR/Platform never see six blank
  // "Not enough data yet" tiles for data they are not entitled to.
  if (approvals !== null && approvals !== undefined) {
    tiles.push(
      { key: "riders", label: "Total Riders", value: num(at(a, "active_riders")), trend: NO_DATA, tone: "green" },
      { key: "drivers", label: "Total Drivers", value: num(at(a, "active_drivers")), trend: NO_DATA, tone: "blue" },
      { key: "delivery", label: "Delivery Drivers", value: num(at(a, "active_couriers")), trend: NO_DATA, tone: "purple" },
    );
  }
  if (executive !== null && executive !== undefined) {
    tiles.push({
      key: "completed",
      label: "Completed Rides",
      value: num(at(counts, "completed")),
      trend: NO_DATA,
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
      tone: "cyan",
    });
  }
  if (command !== null && command !== undefined) {
    tiles.push({
      key: "active",
      label: "Active Rides",
      value: num(at(liveOps, "active_rides")),
      trend: NO_DATA,
      tone: "green",
      live: true,
    });
  }

  // Finance tiles, for roles holding the "finance" module. Every value is an
  // aggregate over stored columns (wallet balances, queue counts) - never a ride
  // row and never personal data.
  if (finance !== null && finance !== undefined) {
    const wallets = pick(f, "wallets") || {};
    const withdrawals = pick(f, "withdrawals") || {};
    const refunds = pick(f, "refunds") || {};
    const payouts = pick(f, "merchant_payouts") || {};
    tiles.push(
      {
        key: "wallet_balance",
        label: "Wallet Balance",
        value: num(at(wallets, "total_balance")),
        suffix: "MRU",
        trend: NO_DATA,
        tone: "cyan",
      },
      {
        key: "pending_withdrawals",
        label: "Pending Withdrawals",
        value: num(at(withdrawals, "pending")),
        trend: NO_DATA,
        tone: "amber",
      },
      {
        key: "refunds_awaiting_ceo",
        label: "Refunds Awaiting CEO",
        value: num(at(refunds, "awaiting_ceo")),
        trend: NO_DATA,
        tone: "purple",
      },
      {
        key: "merchant_payouts_pending",
        label: "Merchant Payouts Pending",
        value: num(at(payouts, "pending")),
        trend: NO_DATA,
        tone: "blue",
      },
    );
  }

  return tiles;
}

/** Today's operations, from verified executive.live.today + command.live_operations. */
export function buildToday({ command, executive }) {
  const t = pick(executive, "live.today") || {};
  const liveOps = pick(command, "live_operations") || {};
  return {
    new_rides: num(at(t, "trips")),
    new_deliveries: num(at(t, "deliveries")),
    // No endpoint exposes today's registrations; stay honest rather than guess.
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
  return list.slice(0, 6).map((e) => ({
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
    api: "API Service",
    database: "Database",
    redis: "Redis / Cache",
    celery: "Background Workers",
    websocket: "Real-time Tracking",
  };
  return Object.keys(LABEL)
    .filter((k) => infra[k] && typeof infra[k] === "object")
    .map((k) => {
      const status = String(infra[k].status || "unknown");
      return { name: LABEL[k], status, ok: status === "ok", label: status.replace(/_/g, " ") };
    });
}

/**
 * Stable identity for the "no permission filtering" default. Kept at module
 * scope so the effect dependency array does not change on every render.
 */
const ALWAYS_TRUE = () => true;

/** Modules that influence which dashboard sources are fetched. */
const SOURCE_MODULES = ["ceo", "ops", "launch", "rides", "drivers", "riders", "finance"];

/**
 * Fetch the admin home dashboard data, filtered by the caller's role.
 *
 * `canView(module)` comes from the admin shell's permission context. Each source
 * is requested ONLY when the role's module set grants it, so a Finance user no
 * longer calls (and is no longer refused by) operations/executive endpoints -
 * and vice versa. When `canView` is omitted every source is requested, which
 * preserves the previous behaviour for tests and for any non-admin caller.
 */
export default function useAdminHomeData({ canView } = {}) {
  const [state, setState] = useState({ loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const allowed = canView || ALWAYS_TRUE;

  // IMPORTANT: depend on a stable STRING derived from the permission decisions,
  // never on the canView function identity. An inline caller-provided canView
  // would otherwise be a new function on every render, retriggering the effect
  // forever. This key only changes when the granted module set actually changes.
  const grantKey = SOURCE_MODULES.filter((m) => allowed(m)).join(",");

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      // Who may read what. Mirrors the backend module gates exactly:
      //   /operations/command/             -> ceo, ops, launch, finance
      //   /operations/executive/dashboard/ -> ceo, ops, finance
      //   /rides/history/                  -> rides
      //   /admin/approvals/stats/          -> all staff (aggregate counters)
      //   /payments/admin/finance/overview/-> finance
      const granted = new Set(grantKey ? grantKey.split(",") : []);
      const wants = {
        command:
          granted.has("ceo") || granted.has("ops") || granted.has("launch") || granted.has("finance"),
        executive: granted.has("ceo") || granted.has("ops") || granted.has("finance"),
        rides: granted.has("rides"),
        approvals: granted.has("drivers") || granted.has("riders"),
        finance: granted.has("finance"),
      };

      const spec = [
        { on: wants.command, run: () => safeGet(`${API_URL}/operations/command/`, { timeout: 20000 }) },
        {
          on: wants.executive,
          run: () =>
            safeGet(`${API_URL}/operations/executive/dashboard/`, {
              params: { period: "today" },
              timeout: 20000,
            }),
        },
        { on: wants.rides, run: () => safeGet(`${API_URL}/rides/history/`) },
        { on: wants.approvals, run: () => safeGet(`${API_URL}/admin/approvals/stats/`) },
        {
          on: wants.finance,
          run: () => safeGet(`${API_URL}/payments/admin/finance/overview/`, { timeout: 20000 }),
        },
      ];

      const results = await Promise.all(
        spec.map((s) => (s.on ? s.run() : Promise.resolve(null)))
      );
      const [command, executive, rides, approvals, finance] = results;

      if (cancelled) return;

      // Only report a connectivity error when a source was ATTEMPTED and all
      // attempts failed. A role with no permitted sources gets a neutral state.
      const attempted = spec.filter((s) => s.on).length;
      const anyOk = results.some((value, index) => spec[index].on && value !== null);

      setState({
        loading: false,
        error: attempted > 0 && !anyOk ? "Could not reach the YALA API." : null,
        noPermittedSources: attempted === 0,
        raw: { command, executive, rides, approvals, finance },
        kpis: buildKpis({ command, executive, rides, approvals, finance }),
        today: buildToday({ command, executive }),
        pending: buildPending(approvals),
        activity: buildActivity(command),
        health: buildHealth(command),
        alerts: pick(command, "alerts.alerts") || [],
        approvals: approvals || {},
        finance: finance || {},
        generatedAt: pick(command, "generated_at") || null,
      });
    })();

    return () => { cancelled = true; };
  }, [nonce, grantKey]);

  return { ...state, reload };
}
