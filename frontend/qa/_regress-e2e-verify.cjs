/**
 * Focused live verification of the two acceptance-critical claims, using
 * wait-for-condition (not fixed sleeps):
 *   1. an authenticated ADMIN lands at /admin AND the redesigned home renders
 *   2. a DRIVER login completes and reaches the driver area
 *
 * All xhr/fetch are fulfilled from memory -> no production API call is made.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://www.yalataxi.live').replace(/\/$/, '');

function resolveChromium() {
  const base = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (s) => 'h.' + b64url({ exp: Math.floor(Date.now() / 1000) + s, user_id: 1 }) + '.sig';

const USERS = {
  admin: { id: 1, email: 'admin@yala.test', role: 'admin', is_staff: true, is_superuser: true, user_type: 'admin', full_name: 'Ada Admin' },
  driver: { id: 2, email: 'driver@yala.test', role: 'driver', is_driver: true, user_type: 'driver', full_name: 'Dan Driver' },
};

const PERMISSIONS = {
  role: 'ceo', home_route: '/admin/home/ceo', elevated: true, permissions_version: 'live-verify',
  modules: ['home', 'ceo', 'ops', 'rides', 'drivers', 'riders', 'delivery', 'employees', 'support', 'finance', 'trust_safety', 'security', 'compliance', 'analytics', 'system', 'launch', 'business', 'marketing'],
  feature_flags: {}, assigned_city: { id: 1, name: 'Nouakchott' },
};

async function run(browser, label, at, userKey, waitFn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const jsErrors = [];
  let loginIntercepts = 0;
  let leaked = 0;
  page.on('pageerror', (e) => jsErrors.push(String(e.message).replace(/\s+/g, ' ').slice(0, 120)));

  await page.route('**/*', (route) => {
    const rt = route.request().resourceType();
    if (rt !== 'xhr' && rt !== 'fetch') return route.continue();
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/auth/login/')) {
      loginIntercepts += 1;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ access: jwt(3600), refresh: jwt(86400), user: USERS[userKey], needs_payment_setup: false, needs_vehicle_setup: false }),
      });
    }
    if (p.includes('/operations/admin/me/permissions/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERMISSIONS) });
    }
    leaked += 1; // any other API call is fulfilled, never forwarded
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  const out = { label, at, loginIntercepts };
  try {
    await page.goto(BASE + at, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForSelector('input[type="email"]', { timeout: 25000 });
    await page.locator('input[type="email"]').first().fill(USERS[userKey].email);
    await page.locator('input[type="password"]').first().fill('Regress!Pass1');
    await page.locator('input[type="password"]').first().press('Enter');
    const ok = await waitFn(page);
    out.waited = ok;
    out.url = new URL(page.url()).pathname;
    try {
      out.body = ((await page.evaluate(() => (document.body ? document.body.innerText : ''))) || '').replace(/\s+/g, ' ').slice(0, 110);
    } catch (e) {
      out.body = '';
    }
    out.verdict = ok ? 'PASS' : 'FAIL';
  } catch (e) {
    out.verdict = 'FAIL';
    out.error = String(e.message).replace(/\s+/g, ' ').slice(0, 130);
  }
  out.jsErrors = jsErrors.length;
  out.otherApiFulfilled = leaked;
  console.log(JSON.stringify(out));
  await ctx.close();
  return out;
}

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  console.log('BASE = ' + BASE);

  const rows = [];
  rows.push(await run(browser, 'ADMIN -> /admin renders redesigned home', '/admin', 'admin', async (page) => {
    for (let i = 0; i < 40; i += 1) {
      try {
        const body = await page.evaluate(() => (document.body ? document.body.innerText : ''));
        if (body.includes('Admin Console')) return true;
      } catch (e) {
        /* navigating */
      }
      await page.waitForTimeout(500);
    }
    return false;
  }));

  rows.push(await run(browser, 'DRIVER -> reaches driver area', '/driver', 'driver', async (page) => {
    for (let i = 0; i < 40; i += 1) {
      if (new URL(page.url()).pathname.startsWith('/driver')) return true;
      await page.waitForTimeout(500);
    }
    return false;
  }));

  console.log('VERIFY RESULT: ' + rows.filter((r) => r.verdict === 'PASS').length + '/' + rows.length + ' PASS');
  await browser.close();
})();
