# YALA Technologies — Coordinated Release Plan (Single Production Cut)

**Status:** Development & staging preparation — **no production deploy without explicit CEO approval**  
**Policy:** One coordinated release. No repeated partial production deployments. No live payment activation without separate sign-off.

---

## Release gate (all phases)

| Gate | Owner | Requirement |
|------|--------|-------------|
| G0 | Engineering | All critical tests green on release branch |
| G1 | CEO | Written approval to deploy application code |
| G2 | CEO + Finance | Written approval for production Moosyl credentials & webhooks |
| G3 | Ops | Backup verified + rollback drill signed |
| G4 | CEO | Post-deploy smoke sign-off |

Approving this document or the development chat **does not** satisfy G1–G4.

---

## Phase 1 — Enterprise Admin Dashboard

| Requirement | Status | Evidence / notes |
|-------------|--------|------------------|
| Horizontal nav + dropdowns | **Done (feature branch)** | `AdminShell`, `AdminTopNav`, `topNavConfig.js` |
| White / navy / green theme | **Done** | `AdminShell.css`, enterprise home CSS |
| Executive stats & revenue | **Done** | `AdminHomeDashboard`, live refresh + WS |
| Tables, filters, actions | **Mostly done** | Fleet, drivers, delivery modules; global search still **Soon** |
| Responsive desktop/mobile | **Done** | Top nav mobile drawer |
| RBAC | **Done** | `/operations/admin/me/permissions/`, route gates |
| API integrations | **Mostly done** | Permissions ETag cache; verify per-module on staging |
| **Local admin login (Cursor review)** | **Operational** | See `scripts/start-local-admin-review.ps1` |

**Local review URL:** `http://localhost:3000/login?next=/admin`  
**Dev API:** `http://127.0.0.1:8000` with `DJANGO_DEBUG=True` (CORS for :3000).

---

## Phase 2 — Nationwide operations

| Requirement | Status | Evidence / notes |
|-------------|--------|------------------|
| Wilayas / geography model | **Done** | `mauritaniaGeoIdentity.js`, city management |
| 13 operating metros (admin filters) | **Done** | `GET /locations/operating-cities/`, `operating_cities.py` |
| Nouakchott unified | **Done** | `city_id_bridge.py`, operating payload collapse |
| City dispatch restrictions | **Done** | `driver_dispatch_service`, operating city check |
| CEO city transfers | **Done** | `OperatingCityTransferRequest`, auth blocks self-move |
| Searchable city dropdowns | **Done** | `SearchableSelect` in `AdminHeader` |
| CEO oversight / multi-city | **Done** | Executive, command, multi-city APIs |
| Backend regional permissions | **Done** | `StaffCityAssignment`, delivery city scope |
| Preserve historical records | **Policy enforced** | No destructive city data migrations in this effort |

**Staging check:** Confirm all 13 names exist as `locations.City` rows so operating-cities API returns `count: 13`.

---

## Phase 3 — Moosyl & payments

| Area | Status | Notes |
|------|--------|-------|
| Moosyl config / sandbox | **Implemented** | `moosyl_settlement.py`, admin `MoosylPaymentPanel` |
| Bankily / Masrvi / Sedad | **Implemented** | Provider modules under `payments/` |
| Webhook signature verification | **Implemented** | Tests in `tests_moosyl_*` |
| Duplicate tx protection | **Partial** | Wallet `reference` unique constraint **blocked locally** — see wallet doc |
| Commission taxi 70/30 | **Configured** | `APP_FEE_PERCENT` / ride settlement |
| Delivery 80/20 | **Verify on staging** | Confirm delivery settlement paths in code review |
| Moosyl 1% as YALA expense | **Document** | Confirm against provider contract before prod |
| No financial record deletion | **Policy** | Dedupe migration must **relabel**, not delete |

**Production Moosyl:** Secrets stay in env / vault only — never committed.

---

## Phase 4 — Regression testing (pre-deploy)

Run on release branch before G1:

```powershell
# Backend (from backend/taxi, DJANGO_DEBUG=True)
python manage.py test operations.tests_city_id_bridge locations.tests_operating_cities payments.tests_moosyl_options --verbosity=1

# Frontend admin focus
cd frontend
$env:CI="true"
npx react-scripts test --testPathPattern="admin/(home|fleet|city)" --watchAll=false
```

**Staging E2E (manual + scripts):** `frontend/qa/_regress-smoke.cjs`, ride/delivery scripts under `scripts/`, Moosyl **sandbox** only.

| Surface | Automated | Manual staging |
|---------|-----------|----------------|
| Rider / Driver / Delivery | Partial (Jest + device scripts) | Required before G1 |
| Admin shell | Jest admin suites | CEO walkthrough |
| City authorization | Django bridge tests | Fleet + dispatch E2E |
| Moosyl webhooks | Unit tests | Sandbox webhook replay |

---

## Phase 5 — One production release (after G1–G3)

**Sequence (do not reorder without ops review):**

1. Database backup + migration plan (including wallet dedupe if approved).
2. Backend deploy + `migrate` (no financial deletes).
3. Celery/workers + Redis channels.
4. **Coordinated** frontend `npm run build:web` **and** backend deploy + `migrate` (not frontend-only unless CEO explicitly changes policy).
5. Moosyl webhook URL cutover (G2).
6. Post-deploy smoke: auth, `/admin`, ride offer, delivery scope, **sandbox** payment ping, webhook receipt.

**Rollback:** `release/ROLLBACK_PLAN.md`, `scripts/rollback-admin-redesign.sh`.

**Commit policy:** Single release branch; squash or tagged release commit only after Phase 4 green.

---

## Current blockers (must clear before deploy request)

1. **`payments.0022`** — unique `(wallet, reference)` fails on duplicate `challenge:4` (see `engineering/WALLET_MIGRATION_0022_RESOLUTION.md`). **Do not apply fix without CEO approval.**
2. **Operating cities seed** — Local DB may list fewer than 13 until location cities are seeded (names only; IDs from DB).
3. **Global admin search** — UI placeholder; not a deploy blocker if documented.
4. **Staging full matrix** — Phase 4 manual pass not yet signed.

---

## How to review the Admin UI now (Cursor browser)

```powershell
# From repo root
.\scripts\start-local-admin-review.ps1
```

Then open **http://localhost:3000/login?next=/admin** and sign in with your local staff user (e.g. `local-admin@yala.local` if created for dev).

---

## CEO sign-off checklist (deployment authorization)

- [ ] I have reviewed the Admin Dashboard on staging or local build.
- [ ] Phase 4 regression results attached.
- [ ] Wallet migration 0022 resolution approved.
- [ ] Moosyl production credentials and webhook URLs configured (not in git).
- [ ] I authorize **one** coordinated production deployment (G1).
- [ ] I authorize live payment activation (G2) — separate from G1 if needed.

*Document version: 2026-11-07*
