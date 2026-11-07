# YALA Technologies — Homepage corrections (release branch)

**Status:** Ready for CEO review — **not deployed to production** (awaiting explicit GO).

## Scope delivered

1. **Login ▼ / My Account ▼** — Rider, Driver, Delivery, and Admin sign-in via existing `/login?next=…`; authenticated users see Dashboard, My Profile, and Logout via `auth/session.js` + `roleRouting.js`.
2. **Mauritanian flag** — Emoji 🇲🇷 replaced with `website/MauritaniaFlag.js` (green field, red top/bottom stripes, gold crescent and star) in header, footer, and About page.
3. **Cities ▼** — Searchable dropdown for 13 wilayas; live vs planned status from `GET /locations/operating-cities/`; Nouakchott districts from `GET /locations/cities/` when available; home `#city-services` panel after selection.

## Verification (local)

| Check | Result |
|-------|--------|
| `npm test` (full) | **1829 passed**, 1 failed (`FleetPerformanceCenter` timeout — unrelated flaky suite) |
| Website Jest | **PASS** (`WebsiteApp.test.js`, `websiteWilayas.test.js`) |
| `REACT_APP_PROD_LEGACY_BACKEND=1` + `npm run build:web` | **PASS** — `main.c448a0e1.js` |
| `verify-web-build.ps1` | Run with `-BuildDir frontend/build` after build |
| Prod deploy | **Not executed** per CEO instruction |

## Screenshots

Capture after staging/local serve of `frontend/build`:

- Desktop: header with Login ▼, Cities ▼, circular flag emblem
- Mobile: burger menu login links + cities dropdown
- Suggested path: `frontend/docs/screenshots/runtime/website-nav-corrections-{desktop,mobile}.png`
