# Release B — Moosyl live payments (production activation package)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Production status (2026-11-07):** **`GET /payments/options/` → 404** on `api.yalataxi.live`; live settlement **OFF**; frontend **hides** mobile money when `REACT_APP_PROD_LEGACY_BACKEND=1`.  
**CEO authorization required:** **G1** (backend deploy + migrate) and **G2** (live settlement).

---

## 1. Completed functionality

| Area | Status |
|------|--------|
| Moosyl adapter (Bankily, Masravi, Sedad) | ✅ `payments/providers/moosyl.py` |
| Options / checkout API | ✅ `moosyl_views.py`, `GET /payments/options/` |
| Payment initiation & status handling | ✅ Create + webhook settlement path |
| Success / failed / pending / cancelled | ✅ Fail-closed; only `completed` settles |
| Webhook HMAC `sha256=` | ✅ Tests pass |
| Idempotency & duplicate prevention | ✅ `ProviderWebhookEvent`, wallet reference uniqueness |
| Commission taxi 70/30, delivery 80/20 | ✅ Tests pass |
| Moosyl 1% platform cost model | ✅ Documented + tested |
| Admin Moosyl panel | ✅ `MoosylPaymentPanel.js` (gated off prod www today) |
| Rider option filtering (legacy prod) | ✅ `backendFeatureGates.js` |

**Refunds via Moosyl API:** **Not supported** by provider — internal YALA refund flows only (`MOOSYL_INTEGRATION_STATUS.md`).

**Backend automated tests (executed 2026-11-07):**

```text
payments.tests_moosyl_options
payments.tests_moosyl_webhook
payments.tests_provider_security
→ 70 passed
```

---

## 2. Remaining blockers

| Blocker | Severity |
|---------|----------|
| **G2** — written CEO approval for live money | Critical |
| Staging sandbox E2E (all 3 apps + fail + duplicate webhook) | Critical |
| Production Moosyl credentials + provider approval | Critical |
| Production webhook URL + secret in vault | Critical |
| Backend deploy to production (`payments` URLs) | Critical |
| Wallet **`payments.0022`** on **sanitized prod-like** DB + finance sign-off | Critical |
| Finance reconciliation (Moosyl dashboard vs DB) | High |
| Ride **#91** — no-touch policy | Policy |
| Staging infrastructure | High |

---

## 3. Required database migrations (Release B)

| App | Migration | Notes |
|-----|-----------|-------|
| `payments` | **`0022_wallet_tx_reference_unique`** | Includes **non-destructive** `#dup{id}` relabel before unique constraint |
| `payments` | **`0023_...`** | Method enum / alignment (applied locally in dev) |
| Possibly | `operations.0016`, `api_gateway.0003` | If ops deploys **full** coordinated backend image |

**Release B must not run on live prod DB until:** inventory per `WALLET_MIGRATION_0022_RESOLUTION.md` on a **sanitized copy**.

---

## 4. Security verification (automated)

| Check | Result |
|-------|--------|
| Webhook signature required | ✅ |
| Sandbox settlement gated | ✅ `may_settle`, `PAYMENTS_LIVE_MODE` |
| No secrets in git | ✅ env-only |
| Idempotency | ✅ webhook + wallet reference tests |

**Not executed:** live Moosyl sandbox payment-request → simulate → webhook on staging (needs vault keys + staging host).

---

## 5. Test results (this pass)

See Release A log + Moosyl **70 OK**. Full frontend Jest **1831 passed** (with fleet timeout fix on branch).

---

## 6. Deployment procedure (Release B)

**Prerequisite:** Release A may ship first; Release B adds payments backend + migrations + UI gates.

1. Complete staging sandbox checklist (`engineering/MOOSYL_INTEGRATION_STATUS.md`).  
2. Prod DB backup → run **0022 inventory** on sanitized clone → finance approval.  
3. **G1:** Deploy backend; `migrate payments` through **0023** (and coordinated apps if single image).  
4. Register webhook `https://api.yalataxi.live/payments/webhooks/moosyl/` with Moosyl (vault secret).  
5. Keep `PAYMENTS_LIVE_MODE=False` until **G2**.  
6. Frontend: `REACT_APP_MOOSYL_UI_ENABLED=1`, remove rider mobile-money filter (or drop prod-legacy gate for payments only — **CEO-approved build recipe**).  
7. **G2:** Set `MOOSYL_ENVIRONMENT=production`, `PAYMENTS_LIVE_MODE=True`, controlled live micro-test with finance witness.  
8. Post-G2 smoke: options API lists Bankily/Masravi/Sedad; one sandbox then one live txn per runbook.

---

## 7. Backup and rollback

| Layer | Procedure |
|-------|-----------|
| Frontend | Same rollback script as Release A |
| Backend | Previous tag + container rollback |
| DB | Forward-fix preferred; no deletes of `Payment` / wallet rows |
| Moosyl | Disable webhook + `PAYMENTS_LIVE_MODE=False` immediately on incident |

---

## 8. Estimated activation time

| Milestone | Duration |
|-----------|----------|
| Staging sandbox E2E complete | **1–2 weeks** (with staging + keys) |
| Prod migrate + G1 backend | **1–2 days** after finance sign-off |
| G2 live money | **+3–5 days** after G2 + provider approval (external) |

---

## 9. GO / NO-GO recommendation

| Scope | Verdict |
|-------|---------|
| Code + unit/integration tests | **GO** for staging |
| Production live payments | **NO-GO** until staging E2E + G2 + wallet prod inventory |

**Cannot ship independently of backend deploy** — unlike Release A, Release B **requires** `payments` migrations and live API routes.
