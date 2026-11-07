/**
 * Multi-role authenticated admin sweep (mock API only — no secrets, no production).
 * Simulates CEO, HR, Finance, Operations permission payloads and probes controls.
 *
 *   node qa/admin-routes-auth-roles-mock.cjs http://127.0.0.1:5599
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { mockFulfill, CLEAR_PERMISSION_CACHE } = require("./admin-mock-api.cjs");

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const OUT = path.join(__dirname, "admin-routes-auth-roles-mock-report.json");

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `h.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, user_id: 1 })}.sig`;

/** Mirrors `operations.admin_permissions_service.MODULES_BY_ROLE`. */
const ROLE_PROFILES = {
  ceo: {
    role: "ceo",
    elevated: true,
    modules: [
      "home",
      "ceo",
      "ops",
      "rides",
      "drivers",
      "riders",
      "delivery",
      "employees",
      "finance",
      "support",
      "marketing",
      "analytics",
      "system",
      "security",
      "trust_safety",
      "compliance",
      "launch",
      "business",
      "fleet",
    ],
  },
  hr: { role: "hr", elevated: false, modules: ["home", "employees"] },
  finance: { role: "finance", elevated: false, modules: ["home", "finance", "business", "bi", "security"] },
  ops: {
    role: "ops",
    elevated: false,
    modules: ["home", "ops", "rides", "drivers", "riders", "delivery", "fleet", "launch", "status"],
  },
};

/** Routes non-CEO roles must NOT access (expect 403 copy inside shell). */
const MUST_DENY_BY_ROLE = {
  hr: ["/admin/payments", "/admin/finance-approvals", "/admin/security", "/admin/fleet"],
  finance: ["/admin/employees/id-cards", "/admin/fleet", "/admin/drivers"],
  ops: ["/admin/payments", "/admin/finance-approvals", "/admin/employees/id-cards", "/admin/security/audit"],
};

const CRITICAL_ROUTES = [
  "/admin",
  "/admin/fleet",
  "/admin/drivers",
  "/admin/employees",
  "/admin/employees/id-cards",
  "/admin/payments",
  "/admin/cities",
  "/admin/administration/city-transfers",
  "/admin/finance-approvals",
  "/admin/delivery/directory",
  "/admin/bi-growth",
  "/admin/launch-growth",
  "/admin/security",
  "/admin/security/audit",
  "/admin/classic",
];

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

async function installMocks(page, profileKey) {
  const profile = ROLE_PROFILES[profileKey];
  const user = {
    id: profileKey === "ceo" ? 1 : 2,
    email: `${profileKey}-mock@yala.test`,
    role: "admin",
    is_staff: true,
    is_superuser: profileKey === "ceo",
    user_type: "admin",
    full_name: `Mock ${profileKey.toUpperCase()}`,
  };
  const permissions = {
    role: profile.role,
    home_route: "/admin",
    elevated: profile.elevated,
    permissions_version: `mock-${profileKey}`,
    modules: profile.modules,
    feature_flags: {},
    assigned_city: { id: 1, name: "Nouakchott" },
  };

  await page.route("**/*", (route) => mockFulfill(route, permissions));

  return { user, access: jwt(), refresh: jwt() };
}

async function visitRoute(page, route, session) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate(
    ({ access, refresh, user, clearScript }) => {
      // eslint-disable-next-line no-eval
      eval(clearScript);
      localStorage.setItem("access", access);
      localStorage.setItem("refresh", refresh);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { ...session, clearScript: CLEAR_PERMISSION_CACHE }
  );
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45000 });
  } catch (err) {
    if (!String(err.message || "").includes("interrupted")) throw err;
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  }
  const slow =
    route === "/admin" ||
    route === "/admin/classic" ||
    route === "/admin/legacy" ||
    route.startsWith("/admin/security");
  try {
    await page.waitForSelector(".admin-shell, .admin-error-page--403, .admin-forbidden", {
      timeout: slow ? 35000 : 22000,
    });
  } catch {
    /* classify below */
  }
  await page.waitForTimeout(slow ? 1400 : 800);
  return page.evaluate(() => {
    const body = document.body?.innerText || "";
    const shell = document.querySelector(".admin-shell");
    const controls = document.querySelectorAll(
      "button, select, input:not([type='hidden']), textarea, [role='combobox'], .admin-table button"
    );
    const clickable = [...controls].filter((el) => !el.disabled).length;
    return {
      mounted: document.getElementById("root")?.children?.length || 0,
      hasAdminShell: Boolean(shell),
      hasForbidden:
        Boolean(document.querySelector(".admin-error-page--403")) ||
        /not authorized|forbidden|access denied|do not have access|don't have permission/i.test(body),
      controlCount: controls.length,
      clickableCount: clickable,
      pathname: window.location.pathname,
    };
  });
}

async function runRoleMatrix(browser, routeList, matrixLabel) {
  const rolesOut = {};
  for (const roleKey of Object.keys(ROLE_PROFILES)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const session = await installMocks(page, roleKey);
    await context.addInitScript(
      ({ access, refresh, user }) => {
        try {
          localStorage.setItem("access", access);
          localStorage.setItem("refresh", refresh);
          localStorage.setItem("user", JSON.stringify(user));
        } catch {
          /* about:blank */
        }
      },
      session
    );
    const rows = [];
    const rbacViolations = [];
    for (const route of routeList) {
      try {
        const info = await visitRoute(page, route, session);
        const mustDeny = (MUST_DENY_BY_ROLE[roleKey] || []).includes(route);
        const rbacOk = mustDeny ? info.hasForbidden : true;
        if (mustDeny && !info.hasForbidden) rbacViolations.push(route);
        rows.push({
          route,
          ...info,
          ok: info.mounted > 0 && (info.hasAdminShell || info.hasForbidden),
          mustDeny,
          rbacOk,
        });
      } catch (err) {
        rows.push({ route, ok: false, error: String(err.message || err).slice(0, 120) });
      }
    }
    rolesOut[roleKey] = {
      matrix: matrixLabel,
      total: rows.length,
      withShell: rows.filter((r) => r.hasAdminShell).length,
      forbidden: rows.filter((r) => r.hasForbidden).length,
      rbacViolations,
      avgControls: Math.round(
        rows.filter((r) => r.controlCount).reduce((s, r) => s + (r.controlCount || 0), 0) /
          Math.max(1, rows.filter((r) => r.controlCount).length)
      ),
      results: rows,
    };
    await context.close();
  }
  return rolesOut;
}

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  const browser = await chromium.launch(launchOpts);
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    matrices: {},
  };

  const criticalOnly = process.env.YALA_QA_CRITICAL_ONLY === "1";
  const fullOnly = process.env.YALA_QA_FULL_ROUTES === "1";
  const autoFull = process.env.YALA_QA_AUTO_FULL !== "0";

  report.matrices.critical = await runRoleMatrix(browser, CRITICAL_ROUTES, "critical");

  const ceoCritical = report.matrices.critical.ceo;
  const ceoCriticalOk =
    ceoCritical.withShell >= CRITICAL_ROUTES.length && ceoCritical.rbacViolations.length === 0;

  if (!criticalOnly && (fullOnly || (autoFull && ceoCriticalOk))) {
    console.log("Running full 100-route matrix (autoFull=%s ceoCriticalOk=%s)", autoFull, ceoCriticalOk);
    report.matrices.full = await runRoleMatrix(browser, loadRoutes(), "full-100");
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  for (const [label, roles] of Object.entries(report.matrices)) {
    for (const [role, data] of Object.entries(roles)) {
      console.log(
        `matrix=${label} role=${role} shell=${data.withShell}/${data.total} forbidden=${data.forbidden} rbacViolations=${data.rbacViolations.length}`
      );
    }
  }
  console.log(`Wrote ${OUT}`);
})();
