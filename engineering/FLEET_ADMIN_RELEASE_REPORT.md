# YALA Enterprise Admin — Fleet & release readiness (CEO review)

**Branch:** `feature/admin-enterprise-top-nav`  
**Working tree commit (pre-commit of this work):** `a6d1ff37d4fe1916a9408f791e52265c41821e1b`  
**Deploy:** Not merged — await explicit CEO approval. No production data / Moosyl changes.

## 1. Taxi vs delivery separation

| Surface | Population |
|---------|------------|
| **Fleet Performance Center** (`/admin/fleet`) | **Taxi drivers only** — `operations.fleet_metrics.driver_profiles()` |
| **Delivery Management** (`/admin/delivery`) | Couriers via existing delivery overview APIs |

**Backend:** `build_fleet_overview`, `build_driver_performance_rows`, `build_document_monitoring`, `build_fleet_snapshot` exclude users with `DriverDeliverySettings`. Overview includes `population: "taxi_drivers"`.

**Test:** `tests.operations.test_fleet_performance.test_fleet_overview_excludes_couriers` — **PASS**

## 2. KPI icons & encoding

- `FleetKpiIcons.js` — SVG icons for fleet KPI cards
- `fleetUi.js` — em dash via `\u2014`; `KpiCard` / `EmptyState` render SVG icon names
- Fleet overview KPIs relabeled **(taxi)**; corrupted emoji icons replaced on overview + vehicle/utilisation blocks

## 3. Operating cities (13)

- `GET /locations/operating-cities/` auto-seeds missing metros (`operating_city_seed.py`)
- Fleet city dropdown: single **All cities** row; 13 metros from API
- Tests: `locations.tests_operating_cities` — **4/4 PASS**

## 4. Mauritanian flag theme

- Flag frame: red bands, green field, gold accents (`yalaAdminTricolor.css`, `admin-shell--flag`)
- Not claiming page-by-page **VERIFIED** without CEO screenshots — see `ADMIN_THEME_ROUTE_AUDIT.md`

## 5. Test & build results (this session)

| Suite | Result |
|-------|--------|
| `tests.operations.test_fleet_performance` | **9/9 PASS** |
| `locations.tests_operating_cities` | **4/4 PASS** |
| `src/admin/fleet/FleetPerformanceCenter.test.js` | Run locally after pull (20 tests) |
| `npm run build:admin` | **PASS** |
| Full frontend `npm test` | **Not全部 green** — known failures: `HallOfFameAdminPanel` city filter (unrelated) |

## 6. Screenshots (CEO action)

Agent cannot capture Cursor browser screenshots in this environment. Please capture:

1. `/admin` — Operations Console  
2. `/admin/fleet` — Fleet Performance Center (taxi KPIs + 13-city dropdown)  
3. `/admin/drivers` — Driver Management  
4. `/admin/delivery/couriers` — Couriers  
5. `/admin/cities` — Cities  
6. `/admin/finance-ops` — Finance  
7. `/admin/approvals` — Approvals  

Save under `frontend/docs/screenshots/runtime/` and mark routes in `ADMIN_THEME_ROUTE_AUDIT.md`.

## 7. Moosyl / production

No wallet, Moosyl, or financial transaction changes in this task. Coordinate with `engineering/YALA_COORDINATED_RELEASE_PLAN.md` for Phase 5 after CEO sign-off.
