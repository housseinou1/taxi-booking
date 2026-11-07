/**
 * A/B smoke test against a LIVE deployment.
 *
 * Aborts every XHR/fetch request (i.e. all API traffic, including same-origin
 * /auth/, /rides/, /operations/...) so NOTHING can be created or modified, while
 * still letting the site load its own HTML/JS/CSS/fonts/images normally.
 *
 * usage: node _regress-smoke-live.cjs https://www.yalataxi.live
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

const ROUTES = [
  ['/', 'public landing'],
  ['/login', 'auth login'],
  ['/rider', 'rider app shell'],
  ['/driver', 'driver app shell'],
  ['/delivery/courier', 'delivery courier'],
  ['/merchant/register', 'merchant register'],
  ['/privacy', 'privacy policy'],
  ['/admin', 'ADMIN entry'],
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
  let apiBlocked = 0;
  page.on('pageerror', (e) => jsErrors.push(String(e.message).replace(/\s+/g, ' ').slice(0, 160)));

  await page.route('**/*', (route) => {
    const rt = route.request().resourceType();
    if (rt === 'xhr' || rt === 'fetch') { apiBlocked += 1; return route.abort(); }
    return route.continue();
  });

  console.log('BASE = ' + BASE);
  for (const [route, label] of ROUTES) {
    let out = { route, label };
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);
      const info = await page.evaluate(() => {
        const root = document.getElementById('root');
        const body = document.body ? document.body.innerText || '' : '';
        return { mounted: root ? root.children.length : -1, title: document.title, head: body.replace(/\s+/g, ' ').trim().slice(0, 90) };
      });
      out = { ...out, ...info };
    } catch (e) {
      out.error = String(e.message).replace(/\s+/g, ' ').slice(0, 120);
    }
    console.log(JSON.stringify(out));
  }

  console.log('API CALLS BLOCKED (no writes possible): ' + apiBlocked);
  console.log('JS ERRORS (' + jsErrors.length + ')');
  [...new Set(jsErrors)].slice(0, 12).forEach((e) => console.log('  ' + e));
  await browser.close();
})();
