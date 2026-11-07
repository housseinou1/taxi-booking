/**
 * Authenticated pilot functional smoke — real Django API, synthetic @pilot.yala.test accounts.
 * Credentials: YALA_PILOT_UAT_PASSWORD + role emails (see scripts/qa-credentials.env.example).
 * Does NOT store passwords in the report.
 *
 *   set YALA_API_URL=http://127.0.0.1:8000
 *   set YALA_PILOT_UAT_PASSWORD=...
 *   node qa/admin-pilot-functional.cjs http://127.0.0.1:5599
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const API = (process.env.YALA_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const OUT = path.join(__dirname, "admin-pilot-functional-report.json");
const PASS = process.env.YALA_PILOT_UAT_PASSWORD || process.env.YALA_CEO_PASSWORD || "";

const ROLES = {
  ceo: "ceo@pilot.yala.test",
  hr: "hr@pilot.yala.test",
  finance: "finance1@pilot.yala.test",
  ops: "ops1@pilot.yala.test",
};

async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} HTTP ${res.status}`);
  return res.json();
}

async function apiGet(token, urlPath) {
  const res = await fetch(`${API}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: res.ok ? await res.json().catch(() => null) : await res.text() };
}

function resolveChromium() {
  const base = path.join(process.env.USERPROFILE || "", "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs
    .readdirSync(base)
    .filter((x) => x.startsWith("chromium-"))
    .sort()
    .reverse()) {
    const p = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

(async () => {
  if (!PASS) {
    console.error("SKIP: set YALA_PILOT_UAT_PASSWORD (pilot seed password)");
    process.exit(2);
  }

  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API,
    uiBase: BASE,
    roles: {},
  };

  for (const [roleKey, email] of Object.entries(ROLES)) {
    const roleReport = { email, api: [], ui: [], ok: true };
    let login;
    try {
      login = await apiLogin(email, PASS);
    } catch (err) {
      roleReport.ok = false;
      roleReport.api.push({ check: "login", ok: false, detail: err.message });
      report.roles[roleKey] = roleReport;
      continue;
    }
    const token = login.access;

    const checks = [
      ["/operations/admin/me/permissions/", "permissions"],
      ["/employees/id-cards/dashboard/", "id_cards_dashboard"],
      ["/employees/id-cards/ceo-signature/", "ceo_signature"],
    ];
    for (const [path, name] of checks) {
      const { status, body } = await apiGet(token, path);
      const ok =
        status === 200 ||
        (status === 403 && name === "id_cards_dashboard" && !["ceo", "hr"].includes(roleKey)) ||
        (status === 403 && name === "ceo_signature" && roleKey !== "ceo");
      roleReport.api.push({
        check: name,
        status,
        ok,
        deniedExpected: status === 403,
      });
      if (!ok && status !== 403) roleReport.ok = false;
    }

    const browser = await chromium.launch(launchOpts);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.evaluate(
      ({ access, refresh, user }) => {
        localStorage.setItem("access", access);
        localStorage.setItem("refresh", refresh);
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.removeItem("yala_admin_permissions");
        sessionStorage.removeItem("yala_admin_permissions");
      },
      { access: token, refresh: login.refresh, user: login.user }
    );

    const uiRoutes =
      roleKey === "hr" || roleKey === "ceo"
        ? ["/admin/employees/id-cards", "/admin/payments"]
        : ["/admin", "/admin/payments"];

    for (const route of uiRoutes) {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45000 });
        await page.waitForSelector(".admin-shell", { timeout: 35000 });
        await page.waitForTimeout(1200);
        const exercised = await page.evaluate(() => {
          const tab = [...document.querySelectorAll("button")].find((b) =>
            /moosyl/i.test(b.textContent || "")
          );
          if (tab) {
            tab.click();
            return { moosylTabClicked: true };
          }
          const refresh = [...document.querySelectorAll("button")].find((b) =>
            /refresh|reload/i.test(b.textContent || "")
          );
          if (refresh && !refresh.disabled) {
            refresh.click();
            return { refreshClicked: true };
          }
          return { moosylTabClicked: false, refreshClicked: false };
        });
        const shell = await page.evaluate(() => ({
          hasShell: Boolean(document.querySelector(".admin-shell")),
          pathname: window.location.pathname,
          bodyLen: (document.body?.innerText || "").length,
        }));
        roleReport.ui.push({
          route,
          ok: shell.hasShell && shell.pathname === route && shell.bodyLen > 80,
          pathname: shell.pathname,
          bodyLen: shell.bodyLen,
          hasShell: shell.hasShell,
          exercised,
        });
      } catch (err) {
        roleReport.ui.push({ route, ok: false, error: String(err.message || err).slice(0, 120) });
        roleReport.ok = false;
      }
    }
    await browser.close();
    const apiOk = roleReport.api.every((x) => x.ok);
    const uiOk = roleReport.ui.length === 0 || roleReport.ui.every((x) => x.ok);
    roleReport.ok = apiOk && uiOk;
    report.roles[roleKey] = roleReport;
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  for (const [k, v] of Object.entries(report.roles)) {
    console.log(`role=${k} ok=${v.ok} api=${v.api.filter((x) => x.ok).length}/${v.api.length} ui=${v.ui.filter((x) => x.ok).length}/${v.ui.length}`);
  }
  console.log(`Wrote ${OUT}`);
})();
