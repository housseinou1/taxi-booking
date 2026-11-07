# Admin routes without `.admin-shell` — investigation (2026-11-07)

## Summary

| Category | Count | Action |
|----------|------:|--------|
| **Unregistered in `App.js` (fell through to marketing `home`)** | 5 | **Fixed** — wired routes + `AdminShellPage` |
| **Legacy redirect without shell** | 2 | **Fixed** — delivery support, share analytics |
| **Wrong pathname / QA flake** | 4 | **Fixed** — classic pathname, security subpaths |
| **Intentional alias** | 2 | Documented (`/admin-dashboard`, `/admin/legacy` → classic) |
| **QA navigation race** | 1 | Script hardening (session re-seed, wait for shell) |

**Post-fix mock CEO sweep:** **93/100** routes expose `.admin-shell` (`admin-routes-auth-mock-report.json`).

---

## Root cause: inventory ≠ routing

`admin-route-inventory.cjs` lists paths from `PATH_MODULE_MAP` + string matches in `App.js`. Several analytics/marketing URLs were in RBAC map but **never** had `currentPath === …` handlers, so React set `page = "home"` (public landing, no shell).

### Fixed registrations

| Route | Page key | Component |
|-------|----------|-----------|
| `/admin/bi-growth`, `/admin/growth-intelligence` | `admin-bi-growth` | `BiGrowthCenter` in shell |
| `/admin/launch-growth`, `/admin/growth-sprint` | `admin-launch-growth` | `LaunchGrowthCenter` in shell |
| `/admin/legacy` | redirect | → `/admin/classic` (legacy console **in shell**) |
| `/admin/*` (unknown) | `admin-unmapped` | Shell + guidance (not 404 on marketing site) |

### Other fixes

| Route | Before | After |
|-------|--------|-------|
| `/admin/delivery/support` | `location.replace` to `?section=deliveries` (no shell) | `BetaFeedbackCenter` in shell |
| `/admin/share-analytics` | Standalone `TopBar` | `AdminShellPage` |
| `/admin/classic` | `pathname="/admin"` | `pathname="/admin/classic"` |
| `/admin/security/*` | Fixed pathname prop | Uses `window.location.pathname` |

### Theming inside shell

`BiGrowthCenter` / `LaunchGrowthCenter` keep internal KPI layout; standalone back-links hidden under `.admin-shell` via CSS.

---

## Authenticated QA (no production credentials)

| Script | Purpose |
|--------|---------|
| `frontend/qa/admin-routes-auth.cjs` | Live API login via env vars only |
| `frontend/qa/admin-routes-auth-mock.cjs` | CEO mock — shell coverage |
| `frontend/qa/admin-routes-auth-roles-mock.cjs` | CEO/HR/Finance/Ops mock RBAC |
| `frontend/qa/admin-id-cards-auth-mock.cjs` | ID card HR routes — shell + controls |

**Local accounts:** `python manage.py seed_pilot_uat` with `YALA_PILOT_UAT_PASSWORD` → `ceo@pilot.yala.test`, `hr@pilot.yala.test`, `finance1@pilot.yala.test`, `ops1@pilot.yala.test` (synthetic `@pilot.yala.test` only).

---

## Remaining QA (pre-deploy)

1. Run `admin-routes-auth.cjs` against **local/staging** Django with pilot emails.
2. Re-run `admin-routes-auth-roles-mock.cjs` after script fix (localStorage on `/login` first).
3. Manual CEO walkthrough on staging for finance/Moosyl (settlement **off** until G2).
