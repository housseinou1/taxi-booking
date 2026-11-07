/**
 * Visit every registered admin route on a local static build (unauthenticated by default).
 * Usage:
 *   npm run build:admin
 *   npx serve -s build -l 5599
 *   node qa/admin-routes-browser.cjs http://127.0.0.1:5599
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:5599";
const OUT = path.join(__dirname, "admin-routes-browser-report.json");

function loadRoutes() {
  const { execSync } = require("child_process");
  const json = execSync("node qa/admin-route-inventory.cjs", { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  const data = JSON.parse(json);
  return data.paths || [];
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

(async () => {
  const routes = loadRoutes();
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ route: null, text: msg.text().slice(0, 240) });
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url().slice(0, 200), failure: req.failure()?.errorText || "" });
  });

  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("yalataxi.live")) return route.abort();
    return route.continue();
  });

  const results = [];
  for (const route of routes) {
    const beforeErr = consoleErrors.length;
    const beforeFail = failedRequests.length;
    let row = { route, ok: false, mounted: 0, title: "", hasAdminShell: false, hasForbidden: false, hasLogin: false };
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      try {
        await page.waitForSelector("#root > *", { timeout: 5000 });
      } catch {
        /* allow evaluate to classify blank root */
      }
      const info = await page.evaluate(() => {
        const root = document.getElementById("root");
        const body = document.body?.innerText || "";
        return {
          mounted: root ? root.children.length : 0,
          title: document.title,
          hasAdminShell: Boolean(document.querySelector(".admin-shell")),
          hasForbidden: /not authorized|forbidden|access denied/i.test(body),
          hasLogin: /sign in|log in/i.test(body) && Boolean(document.querySelector("form")),
        };
      });
      row = { ...row, ...info, ok: info.mounted > 0 };
    } catch (err) {
      row.error = String(err.message || err).slice(0, 200);
    }
    row.newConsoleErrors = consoleErrors.length - beforeErr;
    row.newFailedRequests = failedRequests.length - beforeFail;
    results.push(row);
  }

  await browser.close();
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    total: results.length,
    mounted: results.filter((r) => r.mounted > 0).length,
    withAdminShell: results.filter((r) => r.hasAdminShell).length,
    consoleErrorRoutes: results.filter((r) => r.newConsoleErrors > 0).length,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT} — ${report.mounted}/${report.total} mounted, ${report.withAdminShell} with admin shell`);
})();
