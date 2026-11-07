/**
 * YALA — authenticated end-to-end regression against the BUILT artifact.
 *
 * Drives the REAL login UI. Every API call is intercepted and fulfilled with
 * canned JSON, so no production/backend service is contacted and NO record can
 * be created, modified or read anywhere.
 *
 * Proves: login + role routing + role-lock enforcement + the redesigned Admin
 * home actually rendering, in the shipped bundle.
 *
 * usage: node _regress-e2e.cjs http://127.0.0.1:5599
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5599').replace(/\/$/, '');

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
const jwt = (offsetSec) =>
  'h.' + b64url({ exp: Math.floor(Date.now() / 1000) + offsetSec, user_id: 1 }) + '.sig';

const USERS = {
  admin: { id: 1, email: 'admin@yala.test', role: 'admin', is_staff: true, is_superuser: true, user_type: 'admin', full_name: 'Ada Admin' },
  driver: { id: 2, email: 'driver@yala.test', role: 'driver', is_driver: true, user_type: 'driver', full_name: 'Dan Driver' },
  rider: { id: 3, email: 'rider@yala.test', role: 'rider', user_type: 'rider', full_name: 'Rita Rider' },
};

const PERMISSIONS = {
  role: 'ceo',
  home_route: '/admin/home/ceo',
  elevated: true,
  permissions_version: 'regress-1',
  modules: ['home', 'ceo', 'ops', 'rides', 'drivers', 'riders', 'delivery', 'employees', 'support', 'finance', 'trust_safety', 'security', 'compliance', 'analytics', 'system', 'launch', 'business', 'marketing'],
  feature_flags: {},
  assigned_city: { id: 1, name: 'Nouakchott' },
};

const SCENARIOS = [
  { name: 'ADMIN login @/admin', at: '/admin', user: 'admin', expectPath: '/admin', expectText: 'Admin Console' },
  { name: 'DRIVER login @/driver', at: '/driver', user: 'driver', expectPath: '/driver' },
  { name: 'RIDER login @/rider', at: '/rider', user: 'rider', expectPath: '/rider' },
  { name: 'COURIER login @/delivery/courier', at: '/delivery/courier', user: 'driver', expectPath: '/delivery/courier' },
  { name: 'REJECT rider signing in as driver', at: '/driver', user: 'rider', expectError: 'not a Driver' },
  { name: 'REJECT driver signing in as admin', at: '/admin', user: 'driver', expectError: 'not a Admin' },
];

async function installMocks(page, userKey) {
  await page.route('**/*', (route) => {
    const req = route.request();
    const rt = req.resourceType();
    if (rt !== 'xhr' && rt !== 'fetch') return route.continue();
    const p = new URL(req.url()).pathname;
    if (p.endsWith('/auth/login/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: jwt(3600),
          refresh: jwt(86400),
          user: USERS[userKey],
          needs_payment_setup: false,
          needs_vehicle_setup: false,
        }),
      });
    }
    if (p.includes('/operations/admin/me/permissions/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERMISSIONS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function hasEmailInput(page) {
  for (let i = 0; i < 3; i += 1) {
    try {
      if ((await page.locator('input[type="email"]').count()) > 0) return true;
    } catch (e) {
      /* execution context destroyed mid-navigation - retry */
    }
    await page.waitForTimeout(700);
  }
  return false;
}

async function ensureLoginForm(page) {
  if (await hasEmailInput(page)) return true;
  let n = 0;
  try {
    n = await page.locator('button, a').count();
  } catch (e) {
    n = 0;
  }
  for (let i = 0; i < n; i += 1) {
    let t = '';
    try {
      t = (((await page.locator('button, a').nth(i).innerText()) || '')).trim().toLowerCase();
    } catch (e) {
      continue;
    }
    if (t.startsWith('sign in') || t === 'log in' || t === 'login') {
      try {
        await page.locator('button, a').nth(i).click({ timeout: 5000 });
      } catch (e) {
        /* ignore */
      }
      await page.waitForTimeout(1500);
      if (await hasEmailInput(page)) return true;
    }
  }
  return await hasEmailInput(page);
}

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);

  const rows = [];
  for (const s of SCENARIOS) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(String(e.message).replace(/\s+/g, ' ').slice(0, 120)));
    await installMocks(page, s.user);

    let verdict = 'FAIL';
    let detail = '';
    try {
      await page.goto(BASE + s.at, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2000);
      const hasForm = await ensureLoginForm(page);
      if (!hasForm) {
        detail = 'login form not reachable';
      } else {
        await page.locator('input[type="email"]').first().fill(USERS[s.user].email);
        await page.locator('input[type="password"]').first().fill('Regress!Pass1');
        // Enter on the password field submits the form regardless of how many
        // submit buttons exist; fall back to an explicit click.
        await page.locator('input[type="password"]').first().press('Enter').catch(() => {});
        await page.waitForTimeout(2500);
        if (await page.locator('.yala-login__error, .yala-login__form').count()) {
          try {
            await page.locator('button[type="submit"]').first().click({ timeout: 4000 });
          } catch (e) {
            /* already submitted or navigating */
          }
        }
        await page.waitForTimeout(3500);

        let body = '';
        try {
          body = (await page.evaluate(() => (document.body ? document.body.innerText : ''))) || '';
        } catch (e) {
          body = '';
        }
        const url = new URL(page.url());
        let errText = '';
        try {
          const errEl = page.locator('.yala-login__error').first();
          if (await errEl.count()) errText = ((await errEl.innerText()) || '').trim();
        } catch (e) {
          errText = '';
        }

        if (s.expectError) {
          if (errText.includes(s.expectError)) {
            verdict = 'PASS';
            detail = 'correctly blocked: ' + errText.slice(0, 60);
          } else {
            detail = 'expected rejection "' + s.expectError + '" but got "' + errText.slice(0, 60) + '"';
          }
        } else if (url.pathname.startsWith(s.expectPath)) {
          if (s.expectText && !body.includes(s.expectText)) {
            detail = 'routed OK but marker "' + s.expectText + '" missing';
          } else {
            verdict = 'PASS';
            detail = 'landed ' + url.pathname + (s.expectText ? ' and rendered "' + s.expectText + '"' : '');
          }
        } else {
          detail = 'landed ' + url.pathname + ' (expected ' + s.expectPath + ')' + (errText ? ' | err: ' + errText.slice(0, 60) : '');
        }
      }
    } catch (e) {
      detail = String(e.message).replace(/\s+/g, ' ').slice(0, 130);
    }

    rows.push({ scenario: s.name, verdict, detail, jsErrors: jsErrors.length });
    console.log(JSON.stringify(rows[rows.length - 1]));
    await ctx.close();
  }

  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  console.log('E2E RESULT: ' + pass + '/' + rows.length + ' PASS');
  await browser.close();
})();
