/**
 * Employee ID card admin flows — mock CEO session, no credentials stored.
 * Usage: node qa/admin-id-cards-auth-mock.cjs http://127.0.0.1:5599
 */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const OUT = path.join(__dirname, "admin-id-cards-auth-mock-report.json");

const ROUTES = [
  "/admin/employees",
  "/admin/employees/id-cards",
  "/admin/hr",
];

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `h.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, user_id: 1 })}.sig`;

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
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
    const p = new URL(req.url()).pathname;
    if (p.includes("/operations/admin/me/permissions/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          role: "ceo",
          elevated: true,
          modules: ["home", "employees", "ceo", "hr"],
          assigned_city: { id: 1, name: "Nouakchott" },
        }),
      });
    }
    if (p.includes("/employees/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [], count: 0 }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const results = [];
  for (const route of ROUTES) {
    await page.goto(`${BASE}/login`);
    await page.evaluate(
      ({ access, user }) => {
        localStorage.setItem("access", access);
        localStorage.setItem("refresh", access);
        localStorage.setItem("user", JSON.stringify(user));
      },
      {
        access: jwt(),
        user: {
          id: 1,
          email: "ceo-mock@yala.test",
          role: "admin",
          is_staff: true,
          user_type: "admin",
        },
      }
    );
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector(".admin-shell", { timeout: 15000 }).catch(() => {});
    const probes = await page.evaluate(() => ({
      shell: Boolean(document.querySelector(".admin-shell")),
      hasTable: Boolean(document.querySelector("table, .admin-table")),
      hasForm: Boolean(document.querySelector("form, input[type='file']")),
      hasButtons: document.querySelectorAll("button").length,
      text: (document.body?.innerText || "").slice(0, 400),
    }));
    results.push({ route, ...probes });
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`Wrote ${OUT}`);
})();
