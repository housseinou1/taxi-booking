/**
 * Isolated browser smoke test of a BUILT frontend artifact.
 *
 * - serves the real build (static server, SPA fallback like nginx)
 * - ABORTS every request to *.yalataxi.live, so no production API is contacted
 *   and nothing can be created or modified anywhere
 * - renders each key route and reports DOM/console evidence
 *
 * usage: node _regress-smoke.cjs http://127.0.0.1:5599
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:5599';

// The bundled @playwright/test expects build 1228 but 1248 is installed; point at
// whichever chromium is actually present so the smoke test can run offline.
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

const ROUTES = [
  ['/', 'public landing'],
  ['/login', 'auth login'],
  ['/rider', 'rider app shell'],
  ['/rider-dashboard', 'rider dashboard'],
  ['/driver', 'driver app shell'],
  ['/driver/wallet', 'driver wallet'],
  ['/delivery/courier', 'delivery courier'],
  ['/delivery/account', 'delivery account'],
  ['/merchant/register', 'merchant register'],
  ['/privacy', 'privacy policy'],
  ['/admin', 'ADMIN (redesigned entry)'],
  ['/admin/classic', 'ADMIN legacy entry'],
  ['/admin/rides', 'admin rides'],
  ['/admin/fleet', 'admin fleet'],
  ['/nonexistent-route-xyz', 'unknown route fallback'],
];

(async () => {
  const launchOpts = { headless: true };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  const jsErrors = [];
  const blocked = new Set();
  page.on('pageerror', (e) => jsErrors.push(String(e.message).replace(/\s+/g, ' ').slice(0, 160)));

  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('yalataxi.live') || u.includes('googleapis') || u.includes('gstatic')) {
      try { blocked.add(new URL(u).host); } catch { /* ignore */ }
      return route.abort();
    }
    return route.continue();
  });

  const rows = [];
  for (const [route, label] of ROUTES) {
    const before = jsErrors.length;
    let out = { route, label };
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);
      const info = await page.evaluate(() => {
        const root = document.getElementById('root');
        const body = document.body ? document.body.innerText || '' : '';
        return {
          mounted: root ? root.children.length : -1,
          title: document.title,
          head: body.replace(/\s+/g, ' ').trim().slice(0, 90),
        };
      });
      out = { ...out, ...info, newErrors: jsErrors.length - before };
    } catch (e) {
      out.error = String(e.message).replace(/\s+/g, ' ').slice(0, 120);
      out.newErrors = jsErrors.length - before;
    }
    rows.push(out);
    console.log(JSON.stringify(out));
  }

  console.log('--- BLOCKED HOSTS (no production contact) ---');
  console.log([...blocked].join(', ') || '(none attempted)');
  console.log('--- JS ERRORS (' + jsErrors.length + ') ---');
  [...new Set(jsErrors)].slice(0, 15).forEach((e) => console.log('  ' + e));

  await browser.close();
})();
