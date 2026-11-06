/**
 * Tests for useAdminHomeData — the data layer behind the Admin home dashboard.
 *
 * These encode the HONESTY CONTRACT: a missing figure must surface as null
 * (rendered as "Not enough data yet"), never as an invented number. Field names
 * mirror the contracts verified against a running backend on 2026-11-05.
 */
import { renderHook, waitFor } from "@testing-library/react";

import useAdminHomeData, {
  buildActivity,
  buildHealth,
  buildKpis,
  buildPending,
  buildToday,
  sumCompletedFare,
} from "../useAdminHomeData";

jest.mock("../../../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("../../../apiConfig", () => ({ API_URL: "http://127.0.0.1:8000" }));

const api = require("../../../auth/authenticatedApi").default;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Verified fixtures ────────────────────────────────────────────────────────

const APPROVALS = {
  pending_riders: 0,
  pending_drivers: 8,
  pending_couriers: 2,
  approved_today: 0,
  rejected_today: 0,
  suspended_accounts: 0,
  active_riders: 136,
  active_drivers: 95,
  active_couriers: 21,
  is_ceo: true,
};

const EXECUTIVE = {
  live: { today: { trips: 0, deliveries: 0, revenue: "0.00" } },
  operations: { rides: { counts: { completed: 55, cancelled: 24, in_progress: 0 } } },
};

const COMMAND = {
  generated_at: "2026-11-05T16:55:08Z",
  live_operations: {
    active_rides: 0,
    open_safety_incidents: 0,
    infrastructure: {
      api: { status: "degraded" },
      database: { status: "ok" },
      redis: { status: "not_configured" },
      celery: { status: "unreachable" },
      websocket: { status: "degraded" },
    },
  },
  timeline: [
    { at: "2026-07-24T14:50:17Z", type: "trip_cancelled", summary: "Ride #85 - cancelled" },
    { at: "2026-07-24T14:50:16Z", type: "trip_completed", summary: "Ride #84 completed" },
  ],
};

const RIDES = [
  { id: 1, status: "completed", fare: "100.50" },
  { id: 2, status: "completed", fare: "20" },
  { id: 3, status: "cancelled", fare: "999" },
];

/** Real shape returned by /payments/admin/finance/overview/ (aggregates only). */
const FINANCE = {
  withdrawals: { total: 2, pending: 0, approved: 0, rejected: 1, paid: 1, open_amount: 0 },
  wallets: { wallets: 5, total_balance: 5200, total_pending_balance: 1000 },
  refunds: { total: 0, requested: 0, awaiting_ceo: 0, approved: 0, rejected: 0, refunded: 0 },
  merchant_payouts: { total: 0, pending: 0, paid: 0, pending_amount: 0 },
};

/** Route each URL to its fixture; pass a truthy value to force that call to fail. */
function mockEndpoints({ command, executive, rides, approvals, finance } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes("/operations/command/")) {
      return command ? Promise.reject(new Error("x")) : Promise.resolve({ data: COMMAND });
    }
    if (url.includes("/operations/executive/dashboard/")) {
      return executive ? Promise.reject(new Error("x")) : Promise.resolve({ data: EXECUTIVE });
    }
    if (url.includes("/rides/history/")) {
      return rides ? Promise.reject(new Error("x")) : Promise.resolve({ data: RIDES });
    }
    if (url.includes("/admin/approvals/stats/")) {
      return approvals ? Promise.reject(new Error("x")) : Promise.resolve({ data: APPROVALS });
    }
    if (url.includes("/payments/admin/finance/overview/")) {
      return finance ? Promise.reject(new Error("x")) : Promise.resolve({ data: FINANCE });
    }
    return Promise.reject(new Error("unexpected url " + url));
  });
}

// ── sumCompletedFare ─────────────────────────────────────────────────────────

describe("sumCompletedFare", () => {
  it("sums only completed rides", () => {
    expect(sumCompletedFare(RIDES)).toBe(120.5);
  });

  it("returns null for an empty list (never 0)", () => {
    expect(sumCompletedFare([])).toBeNull();
  });

  it("returns null when nothing is completed", () => {
    expect(sumCompletedFare([{ status: "cancelled", fare: "10" }])).toBeNull();
  });

  it("returns null for a non-array", () => {
    expect(sumCompletedFare(null)).toBeNull();
  });

  it("ignores unparseable fares without inventing a total", () => {
    expect(sumCompletedFare([{ status: "completed", fare: "abc" }])).toBeNull();
  });
});

// ── buildKpis ────────────────────────────────────────────────────────────────

describe("buildKpis", () => {
  const kpis = buildKpis({ command: COMMAND, executive: EXECUTIVE, rides: RIDES, approvals: APPROVALS });
  const byKey = (k) => kpis.find((x) => x.key === k);

  it("reads the verified approvals fields", () => {
    expect(byKey("riders").value).toBe(136);
    expect(byKey("drivers").value).toBe(95);
    expect(byKey("delivery").value).toBe(21);
  });

  it("reads completed rides from operations.rides.counts.completed", () => {
    expect(byKey("completed").value).toBe(55);
  });

  it("reads active rides from live_operations.active_rides", () => {
    expect(byKey("active").value).toBe(0);
  });

  it("computes revenue from real completed fares", () => {
    expect(byKey("revenue").value).toBe(120.5);
    expect(byKey("revenue").suffix).toBe("MRU");
  });

  it("reports no trend, because the backend has no baseline", () => {
    kpis.forEach((k) => expect(k.trend).toBeNull());
  });

  it("emits NO tiles when no source is permitted (all null)", () => {
    // Phase 4: a role that is not entitled to any source must not be shown a
    // row of blank "Not enough data yet" tiles.
    expect(
      buildKpis({ command: null, executive: null, rides: null, approvals: null })
    ).toEqual([]);
  });

  it("keeps the honesty contract: a permitted-but-empty source yields null, not 0", () => {
    buildKpis({ command: {}, executive: {}, rides: [], approvals: {} })
      .forEach((k) => expect(k.value).toBeNull());
  });

  // ── Phase 4: role-aware KPI sets ───────────────────────────────────────────

  const FINANCE_ONLY = buildKpis({
    command: null,
    executive: null,
    rides: null,
    approvals: null,
    finance: FINANCE,
  });

  it("gives a Finance role its own aggregated tiles and nothing else", () => {
    expect(FINANCE_ONLY.map((t) => t.key)).toEqual([
      "wallet_balance",
      "pending_withdrawals",
      "refunds_awaiting_ceo",
      "merchant_payouts_pending",
    ]);
    expect(FINANCE_ONLY.find((t) => t.key === "wallet_balance").value).toBe(5200);
    expect(FINANCE_ONLY.find((t) => t.key === "wallet_balance").suffix).toBe("MRU");
  });

  it("never surfaces ride/revenue tiles to a Finance role (no ride-history access)", () => {
    const keys = FINANCE_ONLY.map((t) => t.key);
    expect(keys).not.toContain("revenue");
    expect(keys).not.toContain("riders");
    expect(keys).not.toContain("drivers");
    expect(keys).not.toContain("active");
  });

  it("shows Finance tiles alongside operational tiles for a combined role (CEO)", () => {
    const both = buildKpis({
      command: COMMAND,
      executive: EXECUTIVE,
      rides: RIDES,
      approvals: APPROVALS,
      finance: FINANCE,
    });
    expect(both.map((t) => t.key)).toEqual([
      "riders",
      "drivers",
      "delivery",
      "completed",
      "revenue",
      "active",
      "wallet_balance",
      "pending_withdrawals",
      "refunds_awaiting_ceo",
      "merchant_payouts_pending",
    ]);
  });
});

// ── buildToday / buildPending ────────────────────────────────────────────────

describe("buildToday", () => {
  it("maps the verified live.today fields", () => {
    const t = buildToday({ command: COMMAND, executive: EXECUTIVE });
    expect(t.new_rides).toBe(0);
    expect(t.new_deliveries).toBe(0);
    expect(t.open_safety_reports).toBe(0);
  });

  it("leaves registrations null - no endpoint provides it", () => {
    expect(buildToday({ command: COMMAND, executive: EXECUTIVE }).new_registrations).toBeNull();
  });

  it("degrades to nulls without data", () => {
    const t = buildToday({});
    expect(t.new_rides).toBeNull();
    expect(t.open_safety_reports).toBeNull();
  });
});

describe("buildPending", () => {
  it("maps the verified approvals fields", () => {
    const p = buildPending(APPROVALS);
    expect(p.pending_drivers).toBe(8);
    expect(p.pending_couriers).toBe(2);
    expect(p.pending_riders).toBe(0);
  });

  it("degrades to nulls without data", () => {
    expect(buildPending(null).pending_drivers).toBeNull();
  });
});


// ── buildActivity / buildHealth ──────────────────────────────────────────────

describe("buildActivity", () => {
  it("maps timeline entries to text/meta", () => {
    const a = buildActivity(COMMAND);
    expect(a).toHaveLength(2);
    expect(a[0].text).toBe("Ride #85 - cancelled");
    expect(a[0].meta).toBe("2026-07-24T14:50:17Z");
  });

  it("returns [] when there is no timeline", () => {
    expect(buildActivity({})).toEqual([]);
    expect(buildActivity(null)).toEqual([]);
  });

  it("caps the list at 6 entries", () => {
    const many = { timeline: Array.from({ length: 20 }, (_, i) => ({ summary: "e" + i })) };
    expect(buildActivity(many)).toHaveLength(6);
  });
});

describe("buildHealth", () => {
  it("maps infrastructure statuses to display rows", () => {
    const h = buildHealth(COMMAND);
    expect(h.map((x) => x.name)).toEqual([
      "API Service", "Database", "Redis / Cache", "Background Workers", "Real-time Tracking",
    ]);
    expect(h.find((x) => x.name === "Database").ok).toBe(true);
    expect(h.find((x) => x.name === "API Service").ok).toBe(false);
  });

  it("humanises an underscore status", () => {
    expect(buildHealth(COMMAND).find((x) => x.name === "Redis / Cache").label).toBe("not configured");
  });

  it("returns [] when infrastructure is absent", () => {
    expect(buildHealth({})).toEqual([]);
    expect(buildHealth(null)).toEqual([]);
  });
});

// ── the hook ─────────────────────────────────────────────────────────────────

describe("useAdminHomeData", () => {
  it("starts in a loading state", () => {
    mockEndpoints();
    const { result } = renderHook(() => useAdminHomeData());
    expect(result.current.loading).toBe(true);
  });

  it("resolves loading and exposes real data", async () => {
    mockEndpoints();
    const { result } = renderHook(() => useAdminHomeData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.kpis.find((k) => k.key === "riders").value).toBe(136);
    expect(result.current.activity).toHaveLength(2);
    expect(result.current.health).toHaveLength(5);
    expect(result.current.generatedAt).toBe("2026-11-05T16:55:08Z");
  });

  it("surfaces an error and null KPIs when every request fails", async () => {
    mockEndpoints({ command: 1, executive: 1, rides: 1, approvals: 1, finance: 1 });
    const { result } = renderHook(() => useAdminHomeData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Could not reach the YALA API.");
    expect(result.current.kpis.every((k) => k.value === null)).toBe(true);
  });

  it("still succeeds when only some endpoints fail", async () => {
    mockEndpoints({ command: 1 });
    const { result } = renderHook(() => useAdminHomeData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.kpis.find((k) => k.key === "riders").value).toBe(136);
    expect(result.current.activity).toEqual([]);
  });

  it("reload() refetches", async () => {
    mockEndpoints();
    const { result } = renderHook(() => useAdminHomeData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = api.get.mock.calls.length;
    result.current.reload();
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(before));
  });

  it("calls exactly the five verified endpoints when no role filter is given", async () => {
    mockEndpoints();
    const { result } = renderHook(() => useAdminHomeData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const urls = api.get.mock.calls.map((c) => c[0]);
    expect(urls).toHaveLength(5);
    expect(urls.some((u) => u.endsWith("/operations/command/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/operations/executive/dashboard/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/rides/stats/") || u.endsWith("/rides/history/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/admin/approvals/stats/"))).toBe(true);
    // Phase 4 added the Finance source; an unfiltered caller fetches everything.
    expect(urls.some((u) => u.endsWith("/payments/admin/finance/overview/"))).toBe(true);
  });

  // ── Phase 4: role-aware fetching ───────────────────────────────────────────

  describe("role-aware fetching (canView)", () => {
    /** canView stub that allows only the listed modules. */
    const only = (...modules) => (module) => modules.includes(module);

    it("a Finance role calls the finance, command and executive sources - but NOT ride history", async () => {
      mockEndpoints();
      const { result } = renderHook(() => useAdminHomeData({ canView: only("finance") }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("/payments/admin/finance/overview/"))).toBe(true);
      expect(urls.some((u) => u.includes("/operations/command/"))).toBe(true);
      expect(urls.some((u) => u.includes("/operations/executive/dashboard/"))).toBe(true);

      // Finance is in EXECUTIVE_GROUPS, so it may read the executive panels, but it
      // must never pull the raw ride-history database.
      expect(urls.some((u) => u.includes("/rides/history/"))).toBe(false);

      // Finance tiles are present alongside whatever the ops sources provided.
      expect(result.current.kpis.some((k) => k.key === "wallet_balance")).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("never exposes ride-level data to a Finance role", async () => {
      mockEndpoints();
      const { result } = renderHook(() => useAdminHomeData({ canView: only("finance") }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("/rides/history/"))).toBe(false);
      expect(result.current.kpis.some((k) => k.key === "revenue")).toBe(false);
    });

    it("an Operations role calls the ops sources and NOT finance", async () => {
      mockEndpoints();
      const { result } = renderHook(() => useAdminHomeData({ canView: only("ops") }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes("/operations/command/"))).toBe(true);
      expect(urls.some((u) => u.includes("/operations/executive/dashboard/"))).toBe(true);
      expect(urls.some((u) => u.includes("/payments/admin/finance/overview/"))).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("a role with no permitted source makes NO request and reports it (no error banner)", async () => {
      mockEndpoints();
      const { result } = renderHook(() => useAdminHomeData({ canView: only("analytics") }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(api.get).not.toHaveBeenCalled();
      expect(result.current.noPermittedSources).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.kpis).toEqual([]);
    });

    it("does NOT refetch in a loop when canView is recreated on every render", async () => {
      // Regression: the effect must key off the granted module set (a string),
      // never the canView function identity - otherwise an inline canView would
      // retrigger the effect forever and exhaust memory.
      mockEndpoints();
      const { result, rerender } = renderHook(() =>
        useAdminHomeData({ canView: (m) => m === "finance" })
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      const afterFirstLoad = api.get.mock.calls.length;
      // Finance legitimately reads finance + command + executive, so expect a
      // small fixed number - the point is that it does not keep growing.
      expect(afterFirstLoad).toBeGreaterThan(0);
      expect(afterFirstLoad).toBeLessThanOrEqual(3);

      rerender();
      rerender();
      await new Promise((r) => setTimeout(r, 80));

      expect(api.get.mock.calls.length).toBe(afterFirstLoad);
    });
  });
});

