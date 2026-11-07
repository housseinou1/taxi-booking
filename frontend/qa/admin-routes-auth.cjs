/**
 * Authenticated admin route verification — credentials ONLY from environment variables
 * (e.g. scripts/qa-credentials.env loaded in the shell). Nothing is written to git or reports.
 *
 * Usage:
 *   npm run build:admin && npx serve -s build -l 5599
 *   # PowerShell: load scripts/qa-credentials.env into env (see qa-credentials.env.example)
 *   set YALA_API_URL=http://127.0.0.1:8000
 *   node qa/admin-routes-auth.cjs http://127.0.0.1:5599
 *
 * Optional role pass: YALA_QA_ROLE=ceo|hr|finance|ops (picks *_EMAIL / *_PASSWORD vars).
 * Screenshots (no tokens): set YALA_QA_SCREENSHOT_DIR=frontend/qa/screenshots/auth-run
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const API = (process.env.YALA_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const OUT = path.join(__dirname, "admin-routes-auth-report.json");
const SHOT_DIR = process.env.YALA_QA_SCREENSHOT_DIR
  ? path.resolve(process.env.YALA_QA_SCREENSHOT_DIR)
  : null;

const ROLE = (process.env.YALA_QA_ROLE || "ceo").toLowerCase();

const ROLE_ENV = {
  ceo: ["YALA_CEO_EMAIL", "YALA_CEO_PASSWORD"],
  hr: ["YALA_HR_EMAIL", "YALA_HR_PASSWORD"],
  finance: ["YALA_FINANCE_EMAIL", "YALA_FINANCE_PASSWORD"],
  ops: ["YALA_OPS_EMAIL", "YALA_OPS_PASSWORD"],
  admin: ["YALA_ADMIN_EMAIL", "YALA_ADMIN_PASSWORD"],
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

function pickCredentials() {
  const keys = ROLE_ENV[ROLE] || ROLE_ENV.ceo;
  let email = process.env[keys[0]] || "";
  let password = process.env[keys[1]] || "";
  if (!email || !password) {
    email = process.env.YALA_ADMIN_EMAIL || process.env.YALA_CEO_EMAIL || "";
    password = process.env.YALA_ADMIN_PASSWORD || process.env.YALA_CEO_PASSWORD || "";
  }
  if (!email || !password) {
    return null;
  }
  return { email, passwordKey: keys[0], role: ROLE };
}

async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

function slug(route) {
  return route.replace(/^\//, "").replace(/[/?&=]/g, "_").slice(0, 80);
}

(async () => {
  const creds = pickCredentials();
  if (!creds) {
    console.error(
      "SKIP: No credentials in environment. Load scripts/qa-credentials.env (see qa-credentials.env.example)."
    );
    process.exit(2);
  }

  const [emailKey] = ROLE_ENV[ROLE] || ROLE_ENV.ceo;
  const password = process.env[ROLE_ENV[ROLE]?.[1]] || process.env.YALA_ADMIN_PASSWORD || process.env.YALA_CEO_PASSWORD;
  const email = process.env[emailKey] || process.env.YALA_ADMIN_EMAIL || process.env.YALA_CEO_EMAIL;

  let loginPayload;
  try {
    loginPayload = await apiLogin(email, password);
  } catch (err) {
    console.error(`FAIL: API login at ${API} — ${err.message}`);
    process.exit(1);
  }

  const routes = loadRoutes();
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.evaluate(
    ({ access, refresh, user }) => {
      localStorage.setItem("access", access);
      if (refresh) localStorage.setItem("refresh", refresh);
      if (user) localStorage.setItem("user", JSON.stringify(user));
    },
    {
      access: loginPayload.access,
      refresh: loginPayload.refresh,
      user: loginPayload.user,
    }
  );

  const results = [];
  for (const route of routes) {
    const beforeErr = consoleErrors.length;
    let row = {
      route,
      ok: false,
      hasAdminShell: false,
      hasForbidden: false,
      controlCount: 0,
      pathname: "",
      error: null,
    };
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      try {
        await page.waitForSelector("#root > *", { timeout: 8000 });
      } catch {
        /* classify below */
      }
      try {
        await page.waitForSelector(".admin-shell", { timeout: route === "/admin-dashboard" ? 25000 : 12000 });
      } catch {
        /* classify below */
      }
      await page.waitForTimeout(route === "/admin-dashboard" ? 1200 : 600);
      const info = await page.evaluate(() => {
        const body = document.body?.innerText || "";
        const shell = document.querySelector(".admin-shell");
        const controls = document.querySelectorAll(
          "button, a.admin-btn, select, input[type='search'], [role='combobox'], .admin-table button"
        );
        return {
          hasAdminShell: Boolean(shell),
          hasForbidden: /not authorized|forbidden|access denied|do not have access/i.test(body),
          controlCount: controls.length,
          pathname: window.location.pathname,
          mounted: document.getElementById("root")?.children?.length || 0,
        };
      });
      row = { ...row, ...info, ok: info.mounted > 0 };
      if (SHOT_DIR && info.mounted > 0) {
        await page.screenshot({ path: path.join(SHOT_DIR, `${slug(route)}.png`), fullPage: false });
      }
    } catch (err) {
      row.error = String(err.message || err).slice(0, 200);
    }
    row.newConsoleErrors = consoleErrors.length - beforeErr;
    results.push(row);
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    apiBase: API,
    role: ROLE,
    credentialEnvKey: creds.passwordKey.replace("PASSWORD", "EMAIL"),
    total: results.length,
    mounted: results.filter((r) => r.mounted > 0).length,
    withAdminShell: results.filter((r) => r.hasAdminShell).length,
    forbidden: results.filter((r) => r.hasForbidden).length,
    screenshotDir: SHOT_DIR || null,
    results: results.map(({ route, ok, hasAdminShell, hasForbidden, controlCount, pathname, error, newConsoleErrors, mounted }) => ({
      route,
      ok,
      mounted,
      hasAdminShell,
      hasForbidden,
      controlCount,
      pathname,
      newConsoleErrors,
      error,
    })),
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    `Wrote ${OUT} — role=${ROLE} — ${report.withAdminShell}/${report.total} with admin shell, ${report.forbidden} forbidden`
  );
})();
