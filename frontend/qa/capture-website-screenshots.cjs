/**
 * Capture marketing website screenshots from a local static build (serve -s build).
 * Usage: node qa/capture-website-screenshots.cjs http://127.0.0.1:5598
 */
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

const BASE = (process.argv[2] || "http://127.0.0.1:5598").replace(/\/$/, "");
const OUT = path.join(__dirname, "..", "docs", "screenshots", "runtime");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9999999999, user_id: 1 })).toString("base64url")}.sig`;
const RIDER_USER = {
  id: 42,
  email: "rider.preview@yala.test",
  role: "rider",
  is_staff: false,
  user_type: "rider",
  full_name: "Preview Rider",
};

/** Prod-like: /operating-cities/ missing; catalog used for live/planned inference. */
async function mockCityApisProdLike(page) {
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.resourceType() !== "xhr" && r.resourceType() !== "fetch") return route.continue();
    const p = new URL(r.url()).pathname;
    if (p.includes("/locations/operating-cities")) {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
    }
    if (p.includes("/locations/cities")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Nouakchott", is_active: true },
          { id: 2, name: "Nouakchott Nord", is_active: true },
          { id: 3, name: "Nouadhibou", is_active: true },
          { id: 4, name: "Rosso", is_active: true },
        ]),
      });
    }
    return route.continue();
  });
}

async function mockCityApisAllUnavailable(page) {
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.resourceType() !== "xhr" && r.resourceType() !== "fetch") return route.continue();
    const p = new URL(r.url()).pathname;
    if (p.includes("/locations/operating-cities") || p.includes("/locations/cities")) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "unavailable" }) });
    }
    return route.continue();
  });
}

async function shot(page, file, opts = {}) {
  const target = path.join(OUT, file);
  await page.screenshot({ path: target, ...opts });
  console.log("wrote", file);
}

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;

  const browser = await chromium.launch(launchOpts);

  // Desktop homepage
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await mockCityApisProdLike(page);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await shot(page, "website-home-desktop.png", { fullPage: true });
    await shot(page, "website-flag-header-desktop.png", {
      clip: { x: 0, y: 0, width: 520, height: 120 },
    });
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "website-login-dropdown-desktop.png");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /cities/i }).first().click();
    await page.waitForTimeout(800);
    await shot(page, "website-cities-dropdown-desktop.png");
    const ceo = page.locator(".ys-ftr-ceo");
    await ceo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await ceo.boundingBox();
    if (box) {
      await shot(page, "website-footer-ceo-desktop.png", {
        clip: { x: Math.max(0, box.x - 24), y: box.y - 8, width: Math.min(1392, box.width + 48), height: box.height + 16 },
      });
    }
    await page.close();
  }

  // Mobile homepage
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mockCityApisProdLike(page);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await shot(page, "website-home-mobile.png", { fullPage: true });
    const ceoM = page.locator(".ys-ftr-ceo");
    await ceoM.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const boxM = await ceoM.boundingBox();
    if (boxM) {
      await shot(page, "website-footer-ceo-mobile.png", {
        clip: { x: Math.max(0, boxM.x - 8), y: boxM.y - 4, width: Math.min(390, boxM.width + 16), height: boxM.height + 8 },
      });
    }
    await page.close();
  }

  // My Account (authenticated rider)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await mockCityApisProdLike(page);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ access, user }) => {
        localStorage.setItem("access", access);
        localStorage.setItem("refresh", access);
        localStorage.setItem("user", JSON.stringify(user));
      },
      { access: jwt, user: RIDER_USER }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /my account/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "website-my-account-dropdown-desktop.png");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /sign in to app/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "website-sign-in-to-app-dropdown-desktop.png");
    await page.close();
  }

  // Cities unknown when APIs unavailable (desktop)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await mockCityApisAllUnavailable(page);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("button", { name: /cities/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "website-cities-unknown-status-desktop.png");
    await page.close();
  }

  // Logged-out visitor sees Login with four apps (mobile)
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mockCityApisProdLike(page);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("button", { name: /^login$/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "website-login-dropdown-mobile.png");
    await page.close();
  }

  await browser.close();
  console.log("done —", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
