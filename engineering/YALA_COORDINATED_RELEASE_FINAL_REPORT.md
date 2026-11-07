# YALA Technologies — Coordinated Release Final Report

**Date:** 2026-11-07  
**Scope:** Admin Dashboard + Moosyl integration (single coordinated production release)  
**Production deploy:** **HOLD** (G1 not granted)  
**Live Moosyl settlements:** **OFF** (G2 not granted)

---

## 1. Release artifact (code)

| Item | Value |
|------|--------|
| Release branch | `release/coordinated-admin-moosyl-rc1` |
| Release commit | `d30842bc4e3a2add8360af9a8e9b6a7aff379315` |
| Parent feature branch | `feature/admin-enterprise-top-nav` |
| RC git tag | **None** — created only after staging sign-off |

**Included:** Admin shell route fixes, Mauritania theme, HR/employee ID cards, operating cities, Moosyl settlement backend, wallet migration `0022` with non-destructive dedupe, `AdminPaymentDashboard` Moosyl tab, coordinated deploy/verify scripts, QA harnesses, engineering checklists.

**Excluded from commit:** `frontend/build/`, `db.sqlite3`, `.env*`, QA `*-report.json` (local artifacts).

---

## 2. Deploy script & build policy

| Requirement | Status |
|-------------|--------|
| Production SPA uses `npm run build:web` | Enforced in `verify-web-build.ps1` and `deploy-admin-redesign.ps1` |
| Reject `REACT_APP_TYPE=admin` on www | **Gate active** |
| Moosyl Finance panel in bundle | **Required** (was incorrectly rejected in older script logic; now **required**) |
| Backup / rollback scripts | Preserved (`rollback-admin-redesign.sh`) |
| Coordinated frontend step | `scripts/deploy-coordinated-frontend.ps1` → verify then deploy |

**Latest local verify (post-commit):**

- `verify-web-build.ps1 -BuildDir frontend/build` → **PASS**
- Main: `main.f45b1ae7.js`
- SHA256: `AEDB1B411DDFFC84EEA4EEDAC65ED157649418534F228A6AC7D4027E7206B726`
- Moosyl panel marker: **present**

---

## 3. Admin Dashboard QA (local / mock)

| Suite | Result | Notes |
|-------|--------|-------|
| `admin-routes-browser.cjs` (unauth mount) | **100/100** | No false “complete”; unauth has no `.admin-shell` by design |
| `admin-routes-auth-mock.cjs` (CEO mock) | **93/100** `.admin-shell` | See `ADMIN_SHELL_ROUTE_AUDIT.md` |
| `admin-routes-auth-roles-mock.cjs` + `YALA_QA_CRITICAL_ONLY=1` | ~**11/15** critical | `/admin`, `/admin/classic`, some security paths — timing/session |
| `admin-id-cards-auth-mock.cjs` | Shell + controls | HR/ID card flows |
| Jest full suite (prior run on branch) | **1829 passed** | Re-run via `scripts/run-coordinated-verification.ps1` before staging cut |

**Authenticated staging QA (CEO / HR / Finance / Ops):** **NOT RUN** — requires staging URL and vault credentials (`admin-routes-auth.cjs`, `scripts/qa-credentials.env.example`).

---

## 4. Moosyl sandbox lifecycle

| Provider / scenario | Local automated | Staging E2E |
|---------------------|-----------------|-------------|
| Options API / commission split | **PASS** (Django tests, env keys cleared) | Pending |
| Webhook + idempotency / failures | **PASS** (unit/integration tests) | Pending |
| Bankily / Masrvi / Sedad simulated payment | N/A locally | Pending sandbox keys |
| Wallet update + reconciliation | Covered in tests | Pending full chain on staging |
| Duplicate webhooks / refunds / retries | Test coverage exists | Pending operator matrix |

**Live settlements:** remain **disabled** everywhere until G2.

Django slice (2026-11-07): `payments.tests_moosyl_*` + `tests_provider_security` + `test_id_card_dashboard` → **71 tests OK**.

---

## 5. Wallet migration `0022`

| Environment | Duplicate groups | Financial amount changes | Constraint |
|-------------|------------------|--------------------------|------------|
| Local dev DB (`wallet_reference_inventory`) | **0** | N/A | Migration includes `RunPython` rename dedupe (`#dup{id}`) before unique index |
| Sanitized production-like copy | **NOT RUN** | — | **Blocker:** DBA must run inventory + migrate on copy only |

Report artifact (local): `engineering/wallet-0022-inventory-local.json`  
Procedure: `engineering/WALLET_MIGRATION_0022_RESOLUTION.md`

**No writes to production financial data** were performed.

---

## 6. Staging deployment

| Step | Status |
|------|--------|
| Deploy backend + workers + migrate | **NOT EXECUTED** |
| Deploy `build:web` artifact | **NOT EXECUTED** |
| Rider / Driver / Delivery smoke | **NOT EXECUTED** |
| Frontend/backend compatibility | Local verify only |
| Backup & rollback drill | **NOT EXECUTED** (G3 on staging) |

Checklist: `engineering/STAGING_VERIFICATION_CHECKLIST.md`

---

## 7. Security & permissions

- Admin routes use shell RBAC + `adminRouteAccess` / `topNavConfig` (see audit docs).
- Moosyl webhook endpoints: provider security tests **PASS** (local).
- Pilot UAT seed includes `hr@pilot.yala.test` / HR Manager group for QA mapping.
- **Staging penetration / role matrix on real JWTs:** pending authenticated QA.

---

## 8. Remaining issues (actionable)

1. **Staging deploy** of commit `d30842bc` — ops.
2. **Moosyl sandbox E2E** per provider — finance/ops + vault keys.
3. **Wallet 0022** on sanitized prod-like DB — DBA.
4. **Authenticated admin QA** on staging — four roles + ID cards + Finance Dashboard.
5. **RC tag** (e.g. `coordinated-admin-moosyl-rc1`) — after staging evidence.
6. **Residual mock QA:** security center mount, `/admin` home shell timing under role mock.
7. **Django full `payments` suite** may fail locally if `MOOSYL_*` env vars are set (documented; clear env for CI-like runs).

---

## 9. GO / NO-GO recommendation

| Gate | Decision |
|------|----------|
| **G1 — Production deploy** | **NO-GO** — staging not deployed; no rollback drill evidence |
| **G2 — Live Moosyl** | **NO-GO** — sandbox lifecycle not completed on staging |
| **Staging RC readiness** | **GO to begin staging work** — code consolidated on `release/coordinated-admin-moosyl-rc1` @ `d30842bc` |

**Safe without further approval:** staging deployment of this commit, sandbox Moosyl tests with settlements off, wallet inventory on sanitized DB copy, authenticated QA, backup drill, then RC tag.

**Requires CEO decision:** G1 production cutover, G2 live payment activation (separate decisions).

---

## 10. Quick operator commands

```powershell
# Local full verification (long)
.\scripts\run-coordinated-verification.ps1

# Web artifact gates
cd frontend; npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build

# Staging frontend (after build)
.\scripts\deploy-coordinated-frontend.ps1   # verify + deploy script path

# Wallet inventory (any DB)
cd backend\taxi
python manage.py wallet_reference_inventory
```

---

*This report reflects work completed safely without production deploy or live Moosyl activation.*
