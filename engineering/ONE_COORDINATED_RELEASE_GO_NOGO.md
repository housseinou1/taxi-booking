# YALA Technologies — One Coordinated Release (Admin + Moosyl)

**Date:** 2026-11-07  
**Assessment type:** Pre-deployment readiness (no production changes performed)  
**Release policy:** Single cut — Admin Dashboard + backend + Moosyl **together**; **live Moosyl activation only after explicit CEO approval (G2)**.

---

## Recommendation

### 🔴 **NO-GO** — deploy neither Admin nor Moosyl to production yet

**2026-11-07 engineering update:** Unregistered admin URLs fixed; mock CEO shell **93/100**; Moosyl Django tests **70 OK**; wallet `0022` dedupe in migration; deploy scripts no longer block Moosyl admin panel. Live staging auth + sandbox still required.

**Reason:** Engineering quality is strong on automated tests and architecture, but **release gates G0–G4 are incomplete**: no pinned release commit, no staging sign-off with live credentials, no verified production backup/rollback drill, no sandbox end-to-end payment matrix, and **large uncommitted work** on `feature/admin-enterprise-top-nav`.

After clearing the blockers in §9, the expected path is **🟡 CONDITIONAL GO** (Admin + backend on staging/prod with **Moosyl settlement still disabled**) → then **🟢 GO** for live payments after G2.

---

## 1. Admin Dashboard

| Requirement | Status | Evidence |
|-------------|--------|----------|
| 100 routes inventoried | ✅ | `frontend/qa/admin-route-inventory.cjs` |
| Mount failures (`/admin/deliveries`, `/admin/payments`) | ✅ Fixed in working tree | `App.js` canonical redirects + payments app-level guard aligned |
| Unauthenticated mount sweep | ✅ 100/100 | `frontend/qa/admin-routes-browser-report.json` |
| Authenticated browser (live roles) | ❌ Not executed | `frontend/qa/admin-routes-auth.cjs` ready; needs local/staging creds |
| Mock CEO shell sweep | ⚠️ 86/100 `.admin-shell` | `frontend/qa/admin-routes-auth-mock-report.json` — growth/legacy URLs differ |
| Every button/dropdown/form clicked | ❌ | Control counts only in mock report |
| CEO / HR / Finance / Ops RBAC live | ❌ | Jest + `adminRouteAccess` only |
| Employee ID cards | ✅ Automated | Django + Jest; ❌ live HR/CEO browser sign-off |
| Mauritanian theme / top nav | ✅ Core shell | ⚠️ some legacy/growth pages |
| Critical admin APIs | ⚠️ | Code + partial Django tests; staging matrix missing |

**Jest (frontend):** **1829 passed** (full suite, `--runInBand`); occasional flaky suites when parallelized — use CI in-band.

---

## 2. Moosyl payment integration

| Area | Status | Notes |
|------|--------|------|
| Moosyl adapter (Bankily / Masravi / Sedad via aggregator) | ✅ Implemented | `payments/providers/moosyl.py` |
| Legacy method spellings (masrvi / seddad) | ✅ Mapped | checkout + withdrawal normalization |
| Taxi commission **70 / 30** | ✅ | Webhook + cash accounting tests |
| Delivery commission **80 / 20** | ✅ | `delivery_commission_policy`, `CommissionConfig:delivery` |
| Moosyl **1%** platform cost (not deducted from driver) | ✅ Documented + tested | `moosyl_settlement.py`, fee tests |
| Rider / driver wallets & payouts | ✅ Existing flows | Moosyl pays **Yala IBAN only**; driver payout via Yala withdrawal |
| Refunds / failed payments | ✅ Fail-closed | Only `completed` settles; failed/cancelled ignored |
| Webhook HMAC + delivery idempotency | ✅ | `tests_moosyl_webhook` (incl. 7 retries) |
| Sandbox settlement gate | ✅ | `may_settle` false unless live mode or explicit sandbox flag |
| Admin Finance / Moosyl panel | ✅ UI + tests | `MoosylPaymentPanel.js` — **conflicts with old deploy gate** (see §8) |
| Live sandbox API exercises on staging | ❌ | Requires CEO-provided sandbox keys in env only |
| Production credentials & webhook URLs | ❌ Not in repo | G2 |

**Moosyl Django tests (this session):** **`payments.tests_moosyl_options` + `tests_moosyl_webhook` + `tests_provider_security` — 70 tests OK.**

**Commission options API:** `/payments/options/` now reports delivery **20/80** with source `CommissionConfig:delivery` (test updated).

---

## 3. Moosyl security & backend verification

| # | Check | Status |
|---|--------|--------|
| 1 | API configuration model | ✅ Env-only (`MOOSYL_*` in `settings.py`) |
| 2 | Sandbox transactions | ⚠️ Code + simulate-transfer path; **not run against live Moosyl sandbox in this pass** |
| 3 | Webhook authentication | ✅ HMAC `sha256=` required; tests pass |
| 4 | Idempotency / duplicate protection | ✅ `ProviderWebhookEvent.delivery_id` + settlement guards |
| 5 | Payment status updates | ✅ pending/failed ignored; completed only |
| 6 | Wallet balances & commissions | ✅ Unit/integration tests; ❌ finance reconciliation on staging |
| 7 | Failed tx cannot settle | ✅ Tests |
| 8 | Financial audit logs | ✅ Provider webhook events + payment rows |
| 9 | Pending migrations | ✅ **Local:** `payments.0022` (with **safe dedupe**), `0023` applied |
| 10 | Prod credentials | ❌ Operator / vault only — never git |

### Wallet duplicate references (CEO policy)

- **Migration `0022`** now includes **`RunPython` dedupe**: duplicate `(wallet, reference)` rows get `reference` → `{original}#dup{id}` — **no deletes, no amount changes**, then unique constraint applies.
- **Production:** run duplicate inventory on a **DB backup** first (`engineering/WALLET_MIGRATION_0022_RESOLUTION.md`); finance sign-off before prod migrate.
- **Ride #91 / existing financial rows:** **not modified** in this work.

---

## 4. Rider, Driver, Delivery compatibility

| Check | Status |
|-------|--------|
| Shared web bundle discipline | ✅ `npm run build:web` → `REACT_APP_TYPE=web` |
| Admin-only bundle must not ship to www | ✅ `deploy-admin-redesign.*` refuses `REACT_APP_TYPE:"admin"` |
| Jest regression | ✅ 1829 passed (full) |
| Static smoke | ✅ `frontend/qa/_regress-smoke.cjs` (0 JS errors, prod hosts blocked) |
| Staging E2E ride/delivery/courier | ❌ Required before G1 |

**Do not** deploy `build:admin` artifact to `www.yalataxi.live`.

---

## 5. Coordinated deployment package

Single release must include:

| Component | In branch (uncommitted) | Prod-ready |
|-----------|-------------------------|------------|
| A. Admin Dashboard UI | ✅ | ⚠️ after commit + staging QA |
| B. Backend APIs | ✅ | ⚠️ |
| C. Employee ID cards | ✅ | ⚠️ live sign-off |
| D. Cities / operating metros | ✅ | ⚠️ seed 13 cities on staging |
| E. Moosyl integration | ✅ | ⚠️ **settlement OFF** until G2 |
| F. DB migrations | ✅ payments 0022–0023, employees 0010, operations 0016, api_gateway 0003 | ⚠️ prod backup + migrate plan |
| G. Rider/Driver/Delivery fixes | ✅ in same SPA | verify on staging |

### Safe deployment order (after G1)

1. **Freeze** release commit; tag `vYALA-admin-moosyl-RC1`.
2. **DB backup** (verified checksum) — G3.
3. **Backend** deploy → `migrate` (payments 0022 dedupe runs automatically) → health `/api/health/ready/`.
4. **Celery / workers** restart if needed.
5. **Frontend** `npm run build:web` → upload via `scripts/deploy-admin-redesign.ps1` (overlay, no `--delete`).
6. **Moosyl:** register webhook URL on staging first; **production webhook only after G2**.
7. **Payment activation:** keep `PAYMENTS_LIVE_MODE=False` and `MOOSYL_ALLOW_SANDBOX_SETTLEMENT=False` on prod until G2 written approval.
8. **Post-deploy smoke:** auth, `/admin`, one ride path, delivery scope, **sandbox** webhook replay (not live money).

### Rollback

- **Frontend:** `scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-<STAMP>`
- **Backend:** `release/ROLLBACK_PLAN.md` — checkout previous tag, rebuild containers
- **DB:** forward-fix preferred; restore only if schema corruption (P0)

---

## 6. Git & artifact state (critical)

| Item | Value |
|------|--------|
| Branch | `feature/admin-enterprise-top-nav` |
| Last commit on branch | `a6d1ff37` — *feat(admin): enterprise top nav…* |
| **Release commit for prod** | **Does not exist yet** — extensive **uncommitted** changes (Admin fixes, Moosyl test/migration, ID cards, cities, QA tooling) |
| Required before deploy | One reviewed commit (or squash) + tag; **never deploy dirty working tree |

---

## 7. Test results summary (this assessment)

| Suite | Result |
|-------|--------|
| Frontend Jest (full, in-band) | **1829 passed**, 6 skipped |
| `build:admin` / `build:web` | **PASS** (prior session) |
| Moosyl + provider security (Django) | **70 passed** |
| Admin route mount | **100/100** |
| Mock CEO admin routes | **86/100** shell |
| Live multi-role admin auth | **Not run** |
| Moosyl sandbox on staging | **Not run** |
| Production backup verification | **Not run** |

---

## 8. Deploy-script conflict (must resolve before GO)

`scripts/deploy-admin-redesign.ps1` currently **aborts** if bundle contains `moosyl-panel`. The Admin Finance **`MoosylPaymentPanel`** is part of this coordinated release.

**Action before deploy:** Update release gates to allow the panel **or** gate on readiness endpoint (e.g. only block if `PAYMENTS_LIVE_MODE` UI exposes live activation without G2). Do not ship with contradictory gates.

---

## 9. Remaining blockers (must clear for 🟡/🟢)

1. **Commit + tag** entire coordinated change set; CI green on release tag.
2. **Staging:** full admin auth route matrix (`admin-routes-auth.cjs`) for CEO/HR/Finance/Ops.
3. **Staging:** Moosyl sandbox — create payment-request, simulate-transfer, webhook replay, reconcile one taxi + one delivery payment.
4. **Staging:** Rider book → complete; driver accept; courier delivery; wallet read-only checks.
5. **Production backup + rollback drill** — record `BACKUP_DIR`.
6. **Operating cities:** 13 metros present in prod DB (seed if needed).
7. **CEO G1** — written authorization for application deploy.
8. **CEO G2** — separate written authorization for **live Moosyl settlement** (`PAYMENTS_LIVE_MODE` + prod keys).
9. **Finance:** prod duplicate-wallet inventory before `0022` on production (dedupe is non-destructive but must be reviewed).
10. **Update deploy script** Moosyl gate (§8).

---

## 10. What was completed in this pass (development only)

- Wallet migration **0022** safe dedupe (`#dup{id}`) before unique constraint — applied locally.
- Moosyl **options** tests aligned with **80/20 delivery** and isolated from dev env keys.
- Admin route mount fixes documented and implemented in `App.js`.
- Coordinated release documentation (this file).

**Not done:** production deploy, prod data changes, Moosyl live activation, Ride #91 touch.

---

## CEO decision record

| Gate | Status |
|------|--------|
| G0 Tests green on release tag | ❌ (no tag yet; tests green on working tree) |
| G1 Deploy application code | ❌ Awaiting written approval |
| G2 Live Moosyl / payments | ❌ Awaiting separate approval |
| G3 Backup + rollback | ❌ |
| G4 Post-deploy smoke sign-off | ❌ |

---

*When blockers §9 are closed and staging evidence is attached, request a re-assessment for 🟡 CONDITIONAL GO (Admin live, payments disabled) or 🟢 GO (full stack including G2).*
