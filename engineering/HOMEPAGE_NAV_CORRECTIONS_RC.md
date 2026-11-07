# YALA Technologies — Homepage & footer corrections (release branch)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Production deploy:** **NOT AUTHORIZED** — await explicit CEO GO.

## Deliverables (all four CEO-requested homepage items)

| # | Item | Status |
|---|------|--------|
| 1 | Login ▼ / My Account ▼ (Rider, Driver, Delivery, Admin) | Done |
| 2 | Official Mauritanian flag (SVG, red stripes) | Done |
| 3 | Cities ▼ — 13 wilayas, search, live vs planned | Done |
| 4 | Footer CEO block + slogan | Done (`8cc5ea01`+) |

## CEO footer (exact copy)

- **Created by: Housseinou Sakho**
- *Chief Executive Officer (CEO)*
- **YALA Technologies**
- **Email:** [sakho@yalataxi.live](mailto:sakho@yalataxi.live)
- **Website:** [www.yalataxi.live](https://www.yalataxi.live)
- **YALA Technologies | Moving Mauritania Forward**

Implemented in `WebsiteApp.js` → `.ys-ftr-ceo`; contacts reuse `CEO_CONTACT` from `FounderCard.js` (support column unchanged).

## Commits (recent)

| Hash | Summary |
|------|---------|
| `1732ccb8` | Login, cities, flag, mobile My Account |
| `8cc5ea01` | CEO footer + slogan |
| *(this commit)* | Fleet test stability + website screenshots + readiness doc |

## Automated tests

| Suite | Result |
|-------|--------|
| Website (`WebsiteApp`, `websiteWilayas`) | **23 tests PASS** |
| `AdminTopNav` (nav regression) | **PASS** |
| `FleetPerformanceCenter` (isolated rerun) | **20/20 PASS** |
| Full Jest | **173 suites, 1831 passed**, 6 skipped, 0 failed (after fleet timeout fix) |

### FleetPerformanceCenter failure analysis

- **Symptom:** `renders the header, all five tabs…` exceeded Jest’s default **5000 ms** waiting for `findByRole("Fleet Overview")` when the **entire** suite ran under load (~137 s).
- **Cause:** **Flaky timing**, not a product regression — the same test passes in **~300 ms** when run alone; mocks and assertions are unchanged by website work.
- **Fix:** `jest.setTimeout(20000)` on the suite and `{ timeout: 12000 }` on the initial `findByRole` wait.

## Production web build

```text
REACT_APP_PROD_LEGACY_BACKEND=1
npm run build:web
verify-web-build.ps1 -BuildDir frontend/build  → PASS
```

Latest bundle at time of report: **`main.8c8a9bcd.js`** (SHA256 on verify step).

## Screenshots (local build `serve -s build -l 5598`)

Captured via `frontend/qa/capture-website-screenshots.cjs`:

| File | Content |
|------|---------|
| `frontend/docs/screenshots/runtime/website-home-desktop.png` | Homepage desktop |
| `frontend/docs/screenshots/runtime/website-home-mobile.png` | Homepage mobile |
| `frontend/docs/screenshots/runtime/website-login-dropdown-desktop.png` | Login ▼ open |
| `frontend/docs/screenshots/runtime/website-my-account-dropdown-desktop.png` | My Account ▼ (mock rider session) |
| `frontend/docs/screenshots/runtime/website-cities-dropdown-desktop.png` | Cities ▼ open |
| `frontend/docs/screenshots/runtime/website-flag-header-desktop.png` | Header flag emblem |
| `frontend/docs/screenshots/runtime/website-footer-ceo-desktop.png` | CEO footer block |
| `frontend/docs/screenshots/runtime/website-footer-ceo-mobile.png` | CEO footer mobile |

## Production safety checklist

- [x] Frontend-only changes on release branch  
- [x] `REACT_APP_PROD_LEGACY_BACKEND=1` preserved  
- [ ] **No** deploy to yalataxi.live until CEO GO  
- [ ] **No** merge to `main`  
- [ ] **No** backend DB / migrations / Moosyl live / Ride #91 changes  

## Rollback (prior prod frontend)

Pre-deploy backup documented in `engineering/FRONTEND_PRODUCTION_DEPLOY_READY.md` (`78ccffa4` era).
