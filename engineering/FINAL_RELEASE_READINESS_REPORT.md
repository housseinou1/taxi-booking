# YALA Technologies — Final release readiness report

**Date:** 2026-11-07  
**Scope:** One coordinated release — Admin Dashboard + Moosyl + backend  
**Production deploy (G1):** **NOT AUTHORIZED**  
**Live Moosyl (G2):** **NOT AUTHORIZED**  
**Ride #91 / prod financial rows:** **NOT MODIFIED**

---

## Release identity

| Item | Value |
|------|--------|
| Branch | `release/coordinated-admin-moosyl-rc1` |
| Code commit (staging baseline) | `3ac53832a73e10626ba1f4fddf91209e25169265` |
| HEAD (status docs) | `f37d8b41` (+ pending QA harness commit) |
| Tag | **`coordinated-admin-moosyl-rc1.2`** (create **`rc1.3`** after final commit) |
| Production artifact | `npm run build:web` → `main.e47c65c7.js`, `verify-web-build.ps1` **PASS** |

---

## 1. Admin Dashboard verification

### Routing & shell (executed)

| Check | Result | Evidence |
|-------|--------|----------|
| Mock CEO 100 routes | **100/100** AdminShell | `admin-routes-auth-mock.cjs` 2026-11-07 |
| Live pilot CEO 100 routes | **100/100** AdminShell | `admin-routes-auth.cjs` + `REACT_APP_API_URL` local build |
| `/admin/security/*` | Shell + focus hints + themed sections | `SecurityOperationsCenter.js` + mock stubs |
| `/admin`, `/admin/classic`, `/admin/legacy` | Shell; timing guards in QA | App.js + AdminShell boot wrapper |
| Growth / legacy styling | Mauritanian tokens in shell | `BiGrowthCenter.css`, `LaunchGrowthCenter.css`, `AdminDashboard.css` |

### Four-role mock (critical 15 — executed)

| Role | Shell | Forbidden (expected denials) | RBAC violations |
|------|-------|------------------------------|-----------------|
| CEO | **15/15** | 0 | **0** |
| HR | **15/15** | 11 | **0** |
| Finance | **15/15** | 9 | **0** |
| Ops | **15/15** | 10 | **0** |

### Four-role mock (full 100×4)

| Status | Notes |
|--------|--------|
| **Script ready** | `YALA_QA_FULL_ONLY=1 node qa/admin-routes-auth-roles-mock.cjs http://127.0.0.1:5599` |
| **Executed this session** | Long run started; **confirm locally** before staging sign-off (≈20–40 min) |

### Live pilot authenticated (executed — synthetic `@pilot.yala.test`)

| Role | API (permissions, id-cards, CEO signature) | UI smoke |
|------|--------------------------------------------|----------|
| CEO | **3/3 OK** | **2/2** id-cards + payments |
| HR | **3/3 OK** | **2/2** |
| Finance | **3/3** (403 on id-cards/CEO sig **expected**) | **2/2** |
| Ops | **3/3** (403 expected) | **1/2** (`/admin` thin home — shell present) |

**Not claimed:** exhaustive click-through of every dropdown, filter, and form. **Targeted Jest:** AdminPaymentDashboard + EmployeeCardPanel + roleRouting → **26/26 PASS**.

**Full Jest suite:** **1819 pass / 10 fail / 1835 total** (failures in non-admin suites, e.g. driver achievements — **not** re-baselined this session).

---

## 2. Employee ID Card Management (executed — backend)

| Workflow | Automated evidence |
|----------|-------------------|
| Registration / HR APIs | `employees.tests.test_api`, phase 2/3 HR tests (in slices) |
| CEO signature endpoint | `test_signature_endpoint` **PASS** |
| PDF generation (no DOB/NI on PDF) | `test_card_pdf_endpoint` **PASS** |
| QR / public verify (no PII leak) | `test_verification_tokens`, `test_permissions_and_audit` **PASS** |
| Dashboard KPIs | `test_id_card_dashboard` **PASS** |

**Not executed:** physical printer / browser print dialog.

---

## 3. Moosyl integration

| Item | Status |
|------|--------|
| Bankily / Masravi / Sedad in options API | **PASS** (`tests_moosyl_options`) |
| Taxi **70/30**, delivery **80/20**, Moosyl **1%** YALA cost | **PASS** (automated) |
| Webhooks, HMAC, idempotency, failed events | **PASS** (`tests_moosyl_webhook`, `tests_provider_security`) |
| Admin Moosyl tab in `build:web` | **PASS** (`verify-web-build.ps1`) |
| Live sandbox E2E on Moosyl | **NOT RUN** (staging + vault) |
| `PAYMENTS_LIVE_MODE` | **OFF** |

**Wallet 0022:** local inventory **0** duplicates; prod-like sanitized DB → **blocked** (DBA).

---

## 4. Backend & compatibility

| Area | Local verification |
|------|-------------------|
| Operating cities / city bridge | `operations.tests_city_id_bridge` **PASS** |
| Payments slice | Moosyl + provider security **PASS** (MOOSYL env cleared) |
| Rider / Driver / Delivery | No regression suite re-run this session; staging smoke required |

---

## 5. Security & RBAC

- Module RBAC in `AdminShell` / `adminRouteAccess.js` (unchanged policy).
- Mock matrix: forbidden copy + `.admin-error-page--403` detection.
- Pilot: Finance/Ops **403** on CEO-only id-card APIs (**expected**).

---

## 6. Staging & rollback

| Item | Status |
|------|--------|
| Staging deploy | **BLOCKED** (no host/credentials in this environment) |
| Moosyl sandbox checklist | Documented in `MOOSYL_INTEGRATION_STATUS.md` |
| Backup / rollback drill | **NOT RUN** — scripts: `rollback-admin-redesign.sh`, `STAGING_HANDOFF.md` |

---

## 7. Remaining blockers

1. Staging environment + deploy operator  
2. Moosyl sandbox keys + E2E settlement chain  
3. Sanitized prod-like DB for wallet **0022** migration drill  
4. Full **100×4** mock matrix completion (command above)  
5. Full Jest **10** failures triage (non-admin)  
6. G1 / G2 CEO approvals  

---

## GO / NO-GO

| Gate | Recommendation |
|------|----------------|
| **Engineering RC for staging** | **GO** — tag `coordinated-admin-moosyl-rc1.2` / commit `3ac53832` |
| **G1 Production** | **NO-GO** |
| **G2 Live Moosyl** | **NO-GO** |

---

## Operator quick sequence

```powershell
.\scripts\run-coordinated-verification.ps1
cd frontend
$env:REACT_APP_API_URL='http://127.0.0.1:8000'   # local pilot UI only
npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build
node qa\_serve-release.cjs build 5599
node qa\admin-routes-auth-mock.cjs http://127.0.0.1:5599
$env:YALA_QA_FULL_ONLY='1'
node qa\admin-routes-auth-roles-mock.cjs http://127.0.0.1:5599
```

*Await explicit CEO authorization before production deployment or live payment activation.*
