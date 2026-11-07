# Homepage urgent corrections (release/coordinated-admin-moosyl-rc1)

**Status:** Verified locally — **not deployed** (awaiting explicit CEO authorization).

## 1. Root causes

| Issue | Root cause | Fix |
|-------|------------|-----|
| Missing Rider/Driver/Delivery/Admin when logged in | Nav only rendered **My Account** when `hasStoredAuthCredentials()` was true; login links were hidden. | **Sign in to app** dropdown (`WebsiteSwitchLoginNavDropdown`) alongside **My Account**; `switchToLogin` clears session then navigates to `/login?next=...`. |
| Logout UI not updating same tab | `localStorage` updates do not fire the `storage` event in the same tab. | `notifyWebsiteAuthChanged()` + `WEBSITE_AUTH_CHANGED` listener in `useWebsiteAuth`; logout still calls `clearAuthSession()` and redirects to `/`. |
| Cities warning + all **Planned** | Production `GET /locations/operating-cities/` → **404**; prior logic treated empty operating set as “not live” for every wilaya. | Fallback to `/locations/cities/` + `filterMajorOperatingLocationCities`; if both fail, `serviceStatus: unknown` (not Planned) and `citiesUnavailable` banner. |

## 2. Files modified

- `frontend/src/website/WebsiteNavMenus.js` — Login vs My Account; Sign in to app; cities badges
- `frontend/src/website/useWebsiteAuth.js` — `logout`, `switchToLogin`, auth refresh events
- `frontend/src/website/websiteAuthEvents.js` — same-tab auth signal
- `frontend/src/website/websitePublicCities.js` — API fallback + `live` \| `planned` \| `unknown`
- `frontend/src/website/WebsiteCityPanel.js` — unknown status in panel
- `frontend/src/website/WebsiteApp.js` — mobile switch-login wiring
- `frontend/src/website/websiteI18n.js` / `website.css` — copy + unknown badge styles
- `frontend/src/website/__tests__/*` — catalog, auth, app nav tests
- `frontend/qa/capture-website-screenshots.cjs` — prod-like API mocks + new shots
- `frontend/docs/screenshots/runtime/website-*.png` — updated artifacts

## 3. Production API verification (2026-11-07)

| Endpoint | Result |
|----------|--------|
| `GET https://api.yalataxi.live/health/` | 200, DB/redis ok |
| `GET …/locations/operating-cities/` | **404** |
| `GET …/locations/cities/` | **200** |

After deploy, cities dropdown should infer live/planned from the cities catalog without showing the “temporarily unavailable” banner (unless catalog also fails).

## 4. Automated tests

- `src/website/__tests__/websitePublicCities.test.js` — PASS
- `src/website/__tests__/useWebsiteAuth.test.js` — PASS
- `src/website/__tests__/WebsiteApp.test.js` — PASS (Sign in to app when session stored)
- `src/website/__tests__/websiteWilayas.test.js` — PASS

## 5. Production web build

- Command: `REACT_APP_PROD_LEGACY_BACKEND=1 npm run build:web`
- `scripts/verify-web-build.ps1 -BuildDir frontend\build` — **PASS**
- Main bundle: `main.17ca5d7d.js`
- SHA256: `D24D34CAE4477DD0144FBC920EA211B8A2287E025C3AC92F7E1FEC0BFAE0381D`

## 6. UX scenarios (local build + Playwright captures)

| Scenario | Result |
|----------|--------|
| A — Logged out | **Login** dropdown with four apps (desktop + mobile screenshots) |
| B — Authenticated | **My Account** + **Sign in to app**; switch clears session before login URL |
| C — Cities | 13 wilayas; prod-like mock → live/planned from catalog; 503 mock → unknown badges + warning |

Screenshots: `frontend/docs/screenshots/runtime/website-login-dropdown-*.png`, `website-sign-in-to-app-dropdown-desktop.png`, `website-my-account-dropdown-desktop.png`, `website-cities-dropdown-desktop.png`, `website-cities-unknown-status-desktop.png`.

## 7. Deployment readiness

**Ready for frontend-only deploy** on `release/coordinated-admin-moosyl-rc1` after CEO GO.

- No backend migrations, Moosyl live changes, Ride #91, or financial data touched.
- Live site remains on prior bundle until authorized; this commit only prepares the artifact.

## 8. RBAC note

Selecting Rider/Driver/Delivery/Admin from **Sign in to app** does not grant cross-role access: session is cleared first; user must authenticate for the target app.
