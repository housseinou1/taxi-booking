const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

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

const BASE = (process.argv[2] || "http://127.0.0.1:5599").replace(/\/$/, "");
const OUT = path.join(__dirname, "..", "docs", "screenshots", "runtime");

const shots = [
  ["/admin/fleet", "admin-fleet-mock.png"],
  ["/admin/employees/id-cards", "admin-employees-id-cards-mock.png"],
  ["/admin/payments", "admin-payments-mock.png"],
];

const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9999999999, user_id: 1 })).toString("base64url")}.sig`;
const USER = {
  id: 1,
  email: "mock@yala.test",
  role: "admin",
  is_staff: true,
  is_superuser: true,
  user_type: "admin",
  full_name: "Mock CEO",
};
const PERM = {
  role: "ceo",
  elevated: true,
  modules: ["home", "ceo", "ops", "fleet", "employees", "finance", "delivery"],
  assigned_city: { id: 1, name: "Nouakchott" },
};

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.resourceType() !== "xhr" && r.resourceType() !== "fetch") return route.continue();
    const p = new URL(r.url()).pathname;
    if (p.includes("permissions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PERM),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  for (const [route, file] of shots) {
    await page.goto(`${BASE}/login`);
    await page.evaluate(
      ({ jwt: access, user }) => {
        localStorage.setItem("access", access);
        localStorage.setItem("refresh", access);
        localStorage.setItem("user", JSON.stringify(user));
      },
      { jwt, user: USER }
    );
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log("wrote", file);
  }
  await browser.close();
})();
