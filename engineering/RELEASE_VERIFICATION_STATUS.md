# YALA — Release verification status (actual results)

**Date:** 2026-11-07  
**RC branch:** `release/coordinated-admin-moosyl-rc1`  
**RC1.3 (frozen):** tag `coordinated-admin-moosyl-rc1.3` → **`dd471e26`** (unchanged)  
**Latest verified (staging cut):** branch tip **`76126ab3`** · tag `coordinated-admin-moosyl-rc1.5` → **`69be7f60`** (code)  
**Staging plan:** [`STAGING_INFRASTRUCTURE_PLAN.md`](STAGING_INFRASTRUCTURE_PLAN.md)  
**Remote:** branch **ahead 4** commits vs `origin` — push before ops deploy  
**Production / live Moosyl:** **HOLD** (G1 / G2)

---

## Completed and tested (executed in this environment)

| Area | Evidence | Result |
|------|-----------|--------|
| Admin shell — 7 former gaps | `23de3a2a` + mock re-run | **100/100** mock CEO (`admin-routes-auth-mock.cjs`) |
| Multi-role mock (critical 15) | RBAC forbidden detection | **15/15** shell; HR **11** forbidden, Finance **9**, Ops **10** on denied routes; **0 rbacViolations** |
| **Full mock matrix (100 × 4 roles)** | `admin-routes-auth-roles-mock.cjs` | CEO **100/100**; HR/Finance/Ops **100/100** shell, **0 rbacViolations** (forbidden counts HR **82**, Finance **74**, Ops **52**) |
| Mock CEO 100 routes | 2026-11-07 re-run | **100/100** (`/admin/security/*` mounted) |
| Pilot `seed_pilot_uat` | nested atomic on partner outbox | **PASS** with `YALA_UAT_LOCAL=1` |
| Moosyl commissions (taxi 70/30, delivery 80/20, methods) | `payments.tests_moosyl_options` | **PASS** (incl. Bankily / Masravi / Sedad in options API) |
| Moosyl webhooks, idempotency, security | `tests_moosyl_webhook`, `tests_provider_security` | **PASS** (52+ tests in slice) |
| Employee ID cards (API) | registration, PDF (no DOB/NI in PDF), QR tokens, public verify redaction, dashboard | **194 tests OK** in combined employee + Moosyl slice |
| Wallet 0022 inventory (local DB) | `manage.py wallet_reference_inventory` | **0** duplicate groups |
| **Jest full suite (172 suites)** | `npm test --runInBand` + setupTests/AdminTopNav pollution fix | **1829 passed**, **6 skipped**, **0 failed** |
| `build:web` + deploy gates | `verify-web-build.ps1` | **PASS** (Moosyl panel in bundle) |
| Pilot API (live Django, once) | `ceo@pilot.yala.test` + `YALA_UAT_LOCAL=1` | **200** on `/operations/admin/me/permissions/`, `/employees/id-cards/dashboard/`, `/employees/id-cards/ceo-signature/` |
| CEO live browser (pilot, once) | `admin-routes-auth.cjs` + local `REACT_APP_API_URL` build | **99/100** shell; **`/admin-dashboard`** bounced to `/login` (fixed in working tree; re-run blocked by login **429**) |

---

## Implemented but not functionally tested end-to-end

| Item | Notes |
|------|--------|
| Admin UI clicks (Moosyl tab, refresh) | Pilot UI smoke did not find clickable controls in headless pass (tabs not exercised); **not** counted as functional UI test |
| PDF print in browser | Backend PDF tests **PASS**; physical print **not** run |
| Moosyl **per-provider** sandbox settlement (Bankily / Masravi / Sedad) | Options list **tested**; live Moosyl simulate + webhook on staging **not** run |
| `YALA_QA_FULL_ROUTES=1` (100 routes × 4 roles) | **Executed** — see full matrix row above |
| HR / Finance / Ops live browser sweeps | Pilot functional **API** matrix designed; full UI blocked after login rate-limit |

---

## Failed

| Item | Detail |
|------|--------|
| Re-run live pilot browser QA (2026-11-07 late) | Django login **HTTP 429** after intensive QA (`cache.clear()` insufficient — time-window bucket) |

---

## Blocked (infrastructure / credentials)

| Item | Needs |
|------|--------|
| Staging deploy + rollback drill | Staging host, ops runbook |
| Moosyl sandbox E2E lifecycle on staging | Vault sandbox keys, G2 still off |
| Wallet 0022 on **sanitized prod-like** DB | DBA dump + migrate dry-run |
| Authenticated QA at scale | Spaced logins or raised limits on staging; `scripts/qa-credentials.env` |

---

## Requires your approval

| Gate | Decision |
|------|----------|
| **G1** — Production deploy | Not requested |
| **G2** — Live Moosyl settlements | Not requested |

---

## GO / NO-GO (engineering recommendation)

| Scope | Verdict |
|-------|---------|
| **Local RC quality** | **GO** to deploy **`coordinated-admin-moosyl-rc1.4`** (or branch tip) to **staging** |
| **Production** | **NO-GO** until staging matrix + backup drill + wallet prod-like inventory |
| **Live payments** | **NO-GO** until sandbox E2E on staging and **G2** |

---

## Operator commands (safe)

```powershell
# Pilot seed (synthetic only)
$env:YALA_UAT_LOCAL='1'
$env:YALA_PILOT_UAT_PASSWORD='...'
python manage.py seed_pilot_uat --riders 5 --drivers 3 --couriers 2

# Local UI must target local API
cd frontend
$env:REACT_APP_API_URL='http://127.0.0.1:8000'
npm run build:web
node qa/_serve-release.cjs build 5599

# Mock (no login limits)
node qa/admin-routes-auth-mock.cjs http://127.0.0.1:5599

# Live pilot (space login attempts; clear cache if needed)
python manage.py shell -c "from django.core.cache import cache; cache.clear()"
$env:YALA_API_URL='http://127.0.0.1:8000'
$env:YALA_PILOT_UAT_PASSWORD='...'
node qa/admin-pilot-functional.cjs http://127.0.0.1:5599
```

---

*No production financial records were modified. No live Moosyl activation.*
