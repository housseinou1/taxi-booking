/**
 * Shared Playwright API stubs for admin QA (no secrets).
 */
const SECURITY_OVERVIEW = {
  audit: { last_24h: 12, total: 400, high_risk_last_7d: 2 },
  administrators: { staff: 8, without_totp: 1 },
  fraud: { total: 3, open_last_7d: 1 },
  delivery_verification: { failures_last_24h: 0, events_last_24h: 4 },
};

const SECURITY_AUDIT = { results: [], count: 0, page: 1, total_pages: 1 };
const SECURITY_ACCESS = {
  results: [],
  summary: {
    total: 0,
    protected: 0,
    without_totp: 0,
    stale_login: 0,
    never_logged_in: 0,
  },
};
const SECURITY_ISSUES = {
  items: [
    {
      id: "mock-1",
      title: "CSS order (informational)",
      status: "tracked",
      severity: "low",
      summary: "Mock QA stub — no production state.",
      owner_action: "Monitor in staging.",
      checks: [{ name: "build", ok: true, detail: "verify-web-build" }],
    },
  ],
};

const SHARE_ANALYTICS = {
  total_shares: 0,
  completed_rides: 0,
  conversion_rate: 0,
};
const SHARE_CHART = { share_volume: [], economy_volume: [], labels: [] };

function mockFulfill(route, permissions) {
  const req = route.request();
  const rt = req.resourceType();
  if (rt !== "xhr" && rt !== "fetch") return route.continue();

  const p = new URL(req.url()).pathname;

  if (p.endsWith("/auth/login/")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access: "mock-access",
        refresh: "mock-refresh",
        user: {
          id: 1,
          email: "ceo-mock@yala.test",
          role: "admin",
          is_staff: true,
          is_superuser: true,
          user_type: "admin",
          full_name: "Mock CEO",
        },
        needs_payment_setup: false,
        needs_vehicle_setup: false,
      }),
    });
  }

  if (p.includes("/auth/token/refresh/")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: "mock-access-refreshed" }),
    });
  }

  if (p.endsWith("/auth/me/") || p.endsWith("/auth/me")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "ceo-mock@yala.test",
        role: "admin",
        is_staff: true,
        is_superuser: true,
        user_type: "admin",
        full_name: "Mock CEO",
      }),
    });
  }

  if (p.includes("/operations/admin/me/permissions/")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "x-permissions-version": permissions.permissions_version || "mock" },
      body: JSON.stringify(permissions),
    });
  }

  if (p.includes("/locations/operating-cities")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, name: "Nouakchott", slug: "nouakchott", is_major: true },
      ]),
    });
  }

  if (p.includes("/security/admin/console/overview")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SECURITY_OVERVIEW),
    });
  }
  if (p.includes("/security/admin/console/audit-stream")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SECURITY_AUDIT),
    });
  }
  if (p.includes("/security/admin/console/access-review")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SECURITY_ACCESS),
    });
  }
  if (p.includes("/security/admin/console/outstanding-issues")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SECURITY_ISSUES),
    });
  }

  if (p.includes("/api/admin/share/analytics/chart")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SHARE_CHART),
    });
  }
  if (p.includes("/api/admin/share/analytics")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SHARE_ANALYTICS),
    });
  }

  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
}

const CLEAR_PERMISSION_CACHE = `
  try {
    localStorage.removeItem("yala_admin_permissions");
    localStorage.removeItem("yala_admin_permissions_version");
    sessionStorage.removeItem("yala_admin_permissions");
  } catch (e) {}
`;

module.exports = {
  mockFulfill,
  CLEAR_PERMISSION_CACHE,
  SECURITY_OVERVIEW,
};
