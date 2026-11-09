# G1 preparation report — GO G1 PREP

**Date:** 2026-11-09  
**Production:** not modified (no migrate, no compose restart, no `.env` changes on 142.93.99.142 in this pass)  
**Website:** unchanged (`main.7516b63d.js`)

---

## Release pin

| Item | Value |
|------|--------|
| Branch | `release/coordinated-admin-moosyl-rc1` |
| **Pinned commit** | **`38b198fe5e9e9776d6ac34ca20e0f7e31168b928`** |
| Change | G1 Moosyl `create_bank_payment`, options `/configuration` parsing, unit tests |
| Remote | Pushed to `origin` |

---

## Staging test results

| Environment | Status |
|-------------|--------|
| **Local Docker** (`yala-staging`) | Postgres + Redis **Up**; Django **image rebuild failed** (Docker Desktop PyPI SSL `CERTIFICATE_VERIFY_FAILED` on this workstation) |
| **Prior isolated staging** | Moosyl 3/3 ride + delivery E2E, 84 payment Django tests — `engineering/verification-runs/payments-suite-20261108-105115.txt`, delivery E2E `moosyl-delivery-e2e-20261108-155647.txt` |
| **Webhook security** | Covered by `payments.tests_provider_security`, `moosyl-webhook-local-verify.py`, finance report webhook outcomes |

**Action for full re-run:** fix Docker SSL or use a **new DO staging droplet** per `STAGING_DEPLOY_AND_TEST_CHECKLIST.md`, then execute matrix rows 1–10.

---

## Database migration verification

| Item | Result |
|------|--------|
| Production live DB | **Not queried / not migrated** (prep policy) |
| Prod schema today | `payments` applied through **0018** on running containers |
| RC schema | Migrations **0019–0023** in repo (`0022` dedupe, `0023` `ProviderWebhookEvent`) |
| Drill script | `scripts/g1-drill-wallet-inventory.sh` — restore encrypted daily backup → ephemeral Postgres → duplicate `(wallet, reference)` count (**run on server before G1**) |

---

## Backup and restore verification

| Item | Result |
|------|--------|
| `backup-monitor.sh` | **OK** (local + offsite) — prior session |
| `backup-encrypted.sh` | Canonical prod backup (`DB_CONTAINER=yala-postgres-1`) |
| `backup.sh` | **Fixed** in repo: `DB_CONTAINER` default `yala-postgres-1`, `MEDIA_DIR` under `/opt/yala` (was `taxi-booking-postgres-1`) |
| Restore drill | Use `BACKUP_SOURCE=local\|offsite DRILL_FULL_RESTORE=1 bash backup-restore-drill.sh` on server before G1 |

Deploy updated `scripts/backup.sh` and `scripts/g1-drill-wallet-inventory.sh` to `/opt/yala/scripts/` during G1 window (no service restart).

---

## Payment security verification

| Control | Status |
|---------|--------|
| `PAYMENTS_LIVE_MODE=False` | Default in settings; must remain in prod `.env.production` at G1 |
| Cashless | `CASHLESS_POLICY_ENFORCED=True` default; options API omits cash when enforced |
| Webhook-only settlement | Documented in `moosyl_settlement` + tests |
| Prod Moosyl vault | **Not installed** on prod `.env.production` today — install via `scripts/moosyl-secure-credential-setup.md` + SSH edit **before** G1 smoke |
| Secrets in chat | **None** |

---

## Mobile / frontend compatibility

| App | G1 impact |
|-----|-----------|
| **Rider / Driver / Delivery** | Same API host; **additive** routes (`/payments/options/`, Moosyl checkout). Existing JWT flows unchanged. Store builds use prod URL — no new AAB required for API-only G1. |
| **WWW / Admin** | Static bundle still `REACT_APP_PROD_LEGACY_BACKEND=1` — Moosyl admin tab hidden until optional frontend flag deploy. |

---

## Finance verification

| Role | Status |
|------|--------|
| Engineering (sandbox) | Reconciliation report prepared |
| Finance manual dashboard | **Pending** (`MOOSYL_SANDBOX_FINANCE_SIGNOFF_REPORT.md`) |
| CEO production money | **Pending** (G2) |

---

## External blockers (require CEO / finance)

1. **Finance manual** Moosyl sandbox dashboard compare  
2. **CEO** written **G1 PRODUCTION** after drill + vault + staging re-run (if required)  
3. **Moosyl sandbox keys** on production server vault (ops SSH)  
4. Optional: **Docker SSL** fix on operator laptop or paid staging droplet for fresh staging build  

---

## Production deployment recommendation

| Verdict | **NO-GO** for G1 production cut **until** |
|---------|---------------------------------------------|
| | (1) `g1-drill-wallet-inventory.sh` **PASS** on server |
| | (2) Moosyl **sandbox** vars in prod `.env.production` (no live mode) |
| | (3) Finance sign-off row completed |
| | (4) Pre-cutover `backup-encrypted.sh` + saved docker image tags |
| | (5) CEO **G1 PRODUCTION** authorization |

When ready, execute **`engineering/G1_PRODUCTION_EXECUTION_CHECKLIST.md`** end-to-end.
