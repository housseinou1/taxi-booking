# YALA Technologies — Complete Admin Dashboard QA Audit

**Branch:** `feature/admin-enterprise-top-nav`  
**Git HEAD (baseline):** `a6d1ff37d4fe1916a9408f791e52265c41821e1b` (local ID-card / fleet fixes may be uncommitted)  
**Date:** 2026-11-07  
**Production deploy:** **NOT AUTHORIZED** — no production data, Moosyl, or prod migrations touched.

---

## Executive summary (honest)

| Metric | Value |
|--------|------:|
| **Admin routes discovered** (App.js + `PATH_MODULE_MAP`) | **72** unique paths |
| **Admin page components** (`page === "admin-*"` in App.js) | **~64** render targets |
| **Pages opened in browser by this agent session** | **0** |
| **Interactive controls clicked in browser** | **0** |
| **Automated: `npm run build:admin`** | **PASS** |
| **Automated: targeted backend tests** (50 tests) | **PASS** |
| **Automated: full `npm test` (CI)** | **FAIL** — 9 failures / 1835 tests |
| **Claim of “100% Admin complete”** | **NOT MADE** — browser + per-button QA incomplete |

This report combines **route inventory**, **RBAC mapping**, **automated build/tests**, **known fixed defects** (employee number URLs, fleet ESLint), and **gaps**. It does **not** substitute for CEO/staff walking every page with a logged-in session, DevTools, and screenshots.

---

## Methodology

| Layer | What we did | Limitation |
|-------|-------------|------------|
| **Route discovery** | Parsed `App.js` pathname → `setPage`, `adminRouteAccess.js`, `topNavConfig.js` | Duplicate nav paths (same page) counted once in module table |
| **API mapping** | Code review of module `*Api.js` + Django URL includes | Not every endpoint exercised |
| **Build** | `npm run build:admin` | Does not prove runtime API health |
| **Backend tests** | `locations.tests_operating_cities`, `test_fleet_performance`, `employees` numbering + API retrieve | Does not cover every admin API |
| **Frontend tests** | Full Jest run in CI mode | 9 known failures; not full E2E |
| **Browser / Playwright** | **Not executed** by agent in this audit pass | Required for button-level sign-off |

---

## Legend — result column

| Code | Meaning |
|------|---------|
| **PASS-A** | Automated test or build confirms behavior |
| **PASS-C** | Code review + prior manual screenshot (user session) |
| **PARTIAL** | Renders; API or subset of controls verified only |
| **FAIL** | Known broken test, 404, or confirmed defect |
| **BLOCKED** | Needs live backend + role account; not run here |
| **NOT-TESTED** | No automated or browser verification this session |

---

## Module verification table

| Page | Route | Buttons / controls (est.) | API status | Result | Issues |
|------|-------|---------------------------|------------|--------|--------|
| Executive / home | `/admin` | ~25 | Ops center APIs | PARTIAL | Theme AUTO; KPIs need live API |
| Classic admin | `/admin/classic` | ~15 | Mixed legacy | NOT-TESTED | Legacy surface |
| CEO Command | `/admin/ceo` | ~40 | Executive services | PARTIAL | BLOCKED without CEO login |
| CEO control / reports / master | `/admin/ceo-control`, `/ceo-reports`, `/ceo-master` | ~30 each | CEO APIs | NOT-TESTED | |
| Executive dashboard | `/admin/executive` | ~20 | Executive | NOT-TESTED | |
| Ops center home | `/admin/ops-center` | ~30 | Operations | PARTIAL | |
| Live operations | `/admin/ops-center/live`, `/admin/rides/live` | ~20 | Live ops | NOT-TESTED | |
| Ops finance | `/admin/ops-center/finance` | ~20 | Finance snapshot | NOT-TESTED | |
| Operations control | `/admin/operations-control` | ~35 | Dispatch | NOT-TESTED | |
| Multi-city | `/admin/multi-city` | ~20 | `multi_city` flag | NOT-TESTED | Feature flag |
| Rides management | `/admin/rides` | ~40 | Rides API | NOT-TESTED | |
| Rides reports | `/admin/rides/reports` | ~15 | Reports | NOT-TESTED | |
| Drivers management | `/admin/drivers` | ~50 | Drivers API | NOT-TESTED | |
| Drivers dashboard | `/admin/drivers/dashboard` | ~20 | Drivers | NOT-TESTED | |
| Driver documents | `/admin/driver-documents` | ~25 | Documents | NOT-TESTED | |
| Driver verification / performance / ratings / activity | `/admin/driver-*` | ~20 each | Driver APIs | NOT-TESTED | |
| Approvals | `/admin/approvals` | ~30 | Approvals | NOT-TESTED | |
| Fleet performance | `/admin/fleet` | ~45 | Fleet performance API | **PASS-A** | Taxi-only KPIs; 20 Jest tests pass; emoji→SVG partial |
| Vehicle management | `/admin/vehicles` | ~40 | Fleet/vehicles API | PARTIAL | Shares `fleetUi`; build pass |
| Riders / dashboard | `/admin/riders`, `/riders/dashboard` | ~35 | Riders API | NOT-TESTED | |
| Delivery hub | `/admin/delivery` | ~30 | Delivery | NOT-TESTED | Couriers separate from taxi fleet |
| Delivery couriers / cities / merchants / directory / support | `/admin/delivery/*` | ~25 each | Delivery APIs | NOT-TESTED | |
| Cities management | `/admin/cities` | ~35 | Cities + operating metros | **PASS-A** | 13-metro seed tests pass |
| City transfers (CEO) | `/admin/administration/city-transfers` | ~15 | Transfer requests API | PARTIAL | CEO auth BLOCKED |
| Smart pricing | `/admin/smart-pricing` | ~30 | Pricing/dispatch | NOT-TESTED | |
| Finance ops | `/admin/finance-ops` | ~40 | Finance | NOT-TESTED | |
| Finance approvals | `/admin/finance-approvals` | ~20 | Approvals | NOT-TESTED | |
| Payments | `/admin/payments` | ~30 | Payments | NOT-TESTED | Do not touch Moosyl prod |
| Withdrawals / accounts | `/admin/withdrawals`, `/withdrawal-accounts` | ~25 | Wallet | NOT-TESTED | |
| Business / accounts / merchant / partner | `/admin/business*` | ~25 each | Business APIs | NOT-TESTED | |
| Employees & HR center | `/admin/employees` | ~35 | `/employees/*` | **PASS-C** | User saw 404 pre-hyphen fix; **fixed** `lookup_value_regex` |
| Employee ID cards | `/admin/employees/id-cards` | ~20 | `/employees/id-cards/dashboard/` | PARTIAL | Requires **Django restart** for new routes |
| Registration + photo | `?view=register` | ~12 | POST + `uploadPhoto` | **PASS-C** | **Required ID photo** on register |
| Attendance | `/admin/attendance` | ~40 | Attendance APIs | NOT-TESTED | |
| HR management | `/admin/hr` | ~50 | HR phase-3 APIs | NOT-TESTED | |
| Verification | `/admin/verification` | ~25 | Verification APIs | NOT-TESTED | |
| Break notifications | `/admin/break-notifications` | ~15 | Break APIs | NOT-TESTED | |
| Trust & safety | `/admin/trust-safety` | ~30 | Safety APIs | NOT-TESTED | Prior 404 risks — verify live |
| Security / audit / fraud | `/admin/security/*` | ~25 | Security console | NOT-TESTED | |
| Support / beta | `/admin/support`, `/beta` | ~20 | Support | NOT-TESTED | |
| Roles | `/admin/roles` | ~15 | RBAC admin | NOT-TESTED | Backend enforcement required |
| BI / analytics | `/admin/business-intelligence`, `/bi` | ~25 | Analytics | NOT-TESTED | |
| Hall of Fame | `/admin/hall-of-fame` | ~20 | Hall API | **FAIL** | Jest: city filter assertion fails |
| API gateway | `/admin/api-gateway` | ~15 | Gateway | NOT-TESTED | |
| Compliance / launch / growth / incentives | various `/admin/*` | ~15–30 | Module-specific | NOT-TESTED | |
| Share analytics | `/admin/share-analytics` | ~10 | Analytics | NOT-TESTED | |

*Continue pattern for any alias routes in App.js not listed above; all map to the same components.*

---

## Employee ID Card module (focused checklist)

| Check | Status | Notes |
|-------|--------|-------|
| Unique `YALA-EMP-######` | **PASS-A** | Numbering tests; legacy `YAM11…LAR` preserved |
| Hyphenated API URLs | **PASS-A** | `lookup_value_regex` + `encodeURIComponent` |
| Registration + **ID photograph** | **PASS-C** | Required on form; upload after create |
| Directory / profile | PARTIAL | BLOCKED without HR Staff login |
| Signature + CEO signature | PARTIAL | CEO upload = Administrator; PDF includes CEO back |
| Card preview / PDF / print | PARTIAL | Photo required for print; CR80 PDF backend |
| QR verification | PARTIAL | Public route gated by settings |
| Mauritanian colors on HR UI | AUTO | Same as global AdminShell layers |
| Nav: **Employees & HR → Employee ID Cards** | PASS-C | `/admin/employees/id-cards` |

---

## Cities / fleet / statistics

| Requirement | Status |
|---------------|--------|
| 13 operating metros | **PASS-A** | `operating_cities` + seed tests |
| Unified Nouakchott | **PASS-A** | Canonical list in backend |
| Taxi vs courier separation in fleet KPIs | **PASS-A** | `fleet_performance` tests |
| KPIs from backend (no fake numbers) | PASS-C in fleet module | Other modules NOT-TESTED per page |

---

## Security & permissions

| Check | Status |
|-------|--------|
| `PATH_MODULE_MAP` + `canAccessPath` | PASS-C (code) |
| Employee HR / Admin DRF permissions | **PASS-A** (employee tests) |
| Multi-role browser matrix (CEO, HR, Finance, …) | **NOT-TESTED** |
| DOB field-level gate | **PASS-A** (`view_dob` tests) |

---

## Issues fixed during this program (recent)

1. **`fleetUi.js`** — ESLint `import/first` (build unblock).
2. **Employee detail 404** — `YALA-EMP-*` router regex + encoded URLs.
3. **ID photo on registration** — required upload step.
4. **Top nav query-only navigation** — `AdminTopNav` URL compare fix.
5. **Employee ID Cards route** — `/admin/employees/id-cards`.

---

## Remaining / unresolved

1. **Full browser QA** — every button on 72 routes: **not done** by agent.
2. **Jest suite** — 9 failures (e.g. `HallOfFameAdminPanel` city filter; others in full log).
3. **Theme per-page CEO screenshots** — see `ADMIN_THEME_ROUTE_AUDIT.md` (MANUAL).
4. **Workflow labels** (Draft / Pending CEO / …) vs `CardStatus` — display mapping only.
5. **Backend process** must be restarted after employee URL/dashboard changes.
6. **Screenshots** — save under `frontend/docs/screenshots/runtime/` during manual pass.

---

## Automated test log (this session)

```text
npm run build:admin                          → PASS
python manage.py test locations.tests_operating_cities \
  tests.operations.test_fleet_performance \
  employees.tests.test_number_generation \
  employees.tests.test_api.SearchRetrieveUpdateTests  → 50 tests OK
npm test --watchAll=false (CI)               → 1820 pass, 9 fail, 6 skip
npx eslint src/admin/fleet/fleetUi.js        → PASS (NODE_ENV=development)
```

---

## CEO manual pass (required before production approval)

1. Sign in as **CEO**, **Administrator**, **HR Staff**, **Finance** (separate sessions).
2. Open **each route** in the table above; record PASS/FAIL per page in a copy of this doc.
3. DevTools → Network: no unexpected **404/500** on primary load.
4. Capture screenshots: Executive, Fleet, Cities, Employees ID dashboard, card front/back, Approvals.
5. Confirm **13 cities** in fleet/city/delivery dropdowns.
6. Register test employee (non-prod DB only) with photo → issue card → PDF.

---

## Production safety

- No production employee/financial/Moosyl/Ride #91 changes.
- Migration `employees.0010_idcardofficialsettings` — **dev/local only** until approved.

**Bottom line:** The Admin Dashboard **compiles**, **critical backend slices pass**, and **known HR/fleet blockers were addressed**, but the dashboard is **not** certified **100% complete** until the CEO manual pass and Playwright/smoke scripts are run against a live stack with role accounts.
