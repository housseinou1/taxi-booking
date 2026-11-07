/**
 * CEO-equivalent admin route sweep with mocked API only (no backend, no secrets stored).
 * Proves shell mount + control density; does NOT substitute live RBAC/API verification.
 *
 *   node qa/admin-routes-auth-mock.cjs http://127.0.0.1:5599
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { mockFulfill, CLEAR_PERMISSION_CACHE } = require("./admin-mock-api.cjs");

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const OUT = path.join(__dirname, "admin-routes-auth-mock-report.json");

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `h.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, user_id: 1 })}.sig`;

const USER = {
  id: 1,
  email: "ceo-mock@yala.test",
  role: "admin",
  is_staff: true,
  is_superuser: true,
  user_type: "admin",
  full_name: "Mock CEO",
};

const PERMISSIONS = {
  role: "ceo",
  home_route: "/admin/home/ceo",
  elevated: true,
  permissions_version: "mock-1",
  modules: [
    "home",
    "ceo",
    "ops",
    "rides",
    "drivers",
    "riders",
    "delivery",
    "employees",
    "support",
    "finance",
    "trust_safety",
    "security",
    "compliance",
    "analytics",
    "system",
    "launch",
    "business",
    "marketing",
    "fleet",
  ],
  feature_flags: {},
  assigned_city: { id: 1, name: "Nouakchott" },
};

function loadRoutes() {
  const { execSync } = require("child_process");
  const json = execSync("node qa/admin-route-inventory.cjs", {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  return JSON.parse(json).paths || [];
}

function resolveChromium() {
  const base = path.join(process.env.USERPROFILE || "", "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs
    .readdirSync(base)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const p = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function installMocks(page) {
  await page.route("**/*", (route) => {
    const req = route.request();
    const rt = req.resourceType();
    if (rt !== "xhr" && rt !== "fetch") return route.continue();
    const p = new URL(req.url()).pathname;
    if (p.endsWith("/auth/login/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access: jwt(),
          refresh: jwt(),
          user: USER,
          needs_payment_setup: false,
          needs_vehicle_setup: false,
        }),
      });
    }
    return mockFulfill(route, PERMISSIONS);
  });
}

(async () => {
  const routes = loadRoutes();
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sessionSeed = {
    access: jwt(),
    refresh: jwt(),
    user: USER,
    clearScript: CLEAR_PERMISSION_CACHE,
  };
  await context.addInitScript((seed) => {
    try {
      // eslint-disable-next-line no-eval
      eval(seed.clearScript);
      localStorage.setItem("access", seed.access);
      localStorage.setItem("refresh", seed.refresh);
      localStorage.setItem("user", JSON.stringify(seed.user));
    } catch {
      /* about:blank */
    }
  }, sessionSeed);
  const page = await context.newPage();
  await installMocks(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });

  const seedSession = async () => {
    try {
      await page.evaluate(
        ({ access, refresh, user, clearScript }) => {
          // eslint-disable-next-line no-eval
          eval(clearScript);
          localStorage.setItem("access", access);
          localStorage.setItem("refresh", refresh);
          localStorage.setItem("user", JSON.stringify(user));
        },
        { ...sessionSeed }
      );
    } catch (err) {
      if (!String(err.message || "").includes("Execution context was destroyed")) throw err;
    }
  };

  const results = [];
  for (const route of routes) {
    let row = { route, mounted: 0, hasAdminShell: false, hasForbidden: false, controlCount: 0 };
    try {
      await seedSession();
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45000 });
      } catch (err) {
        if (!String(err.message || "").includes("interrupted")) throw err;
        await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
      }
      const slow =
        route === "/admin" ||
        route === "/admin-dashboard" ||
        route === "/admin/classic" ||
        route.startsWith("/admin/security");
      try {
        await page.waitForSelector(".admin-shell", { timeout: slow ? 35000 : 20000 });
      } catch {
        /* some routes intentionally differ */
      }
      await page.waitForTimeout(slow ? 1200 : 400);
      const info = await page.evaluate(() => {
        const body = document.body?.innerText || "";
        const controls = document.querySelectorAll(
          "button, select, input[type='search'], textarea, [role='combobox'], .admin-table button, .admin-top-nav a"
        );
        return {
          mounted: document.getElementById("root")?.children?.length || 0,
          hasAdminShell: Boolean(document.querySelector(".admin-shell")),
          hasForbidden:
            Boolean(document.querySelector(".admin-error-page--403")) ||
            /not authorized|forbidden|access denied|do not have access|don't have permission/i.test(body),
          controlCount: controls.length,
        };
      });
      row = { ...row, ...info, ok: info.hasAdminShell || info.hasForbidden };
    } catch (err) {
      row.error = String(err.message || err).slice(0, 160);
    }
    results.push(row);
  }

  await browser.close();
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    mode: "mock-api-ceo",
    total: results.length,
    withAdminShell: results.filter((r) => r.hasAdminShell).length,
    forbidden: results.filter((r) => r.hasForbidden).length,
    failed: results.filter((r) => !r.ok && !r.error).length,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    `Wrote ${OUT} — ${report.withAdminShell}/${report.total} with admin shell (mock CEO)`
  );
})();
