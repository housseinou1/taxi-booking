# G1 backend deployment result

**Date:** 2026-11-09 UTC  
**Release commit (pin):** `40990c6b` (includes `f206fee7` G1 deploy + Celery `redis-py` hotfix)  
**Website:** not redeployed  
**Live settlement:** **OFF** (`PAYMENTS_LIVE_MODE=False`)

---

## Verdict: **SUCCESS** (G1 API + migrations)

Controlled backend deploy completed. Payment routes live with sandbox Moosyl vault (no secrets in this document).

---

## Problems fixed

| Blocker | Resolution |
|---------|------------|
| Stale prod API (no Moosyl) | Backend overlay + Docker rebuild |
| `backup.sh` wrong Postgres container | Defaults to `yala-postgres-1` |
| Moosyl vault missing on prod | `/home/yala/.moosyl-sandbox.env` + `apply-moosyl-sandbox-prod-env.sh` |
| Git checkout conflict on server | Tar overlay deploy path (document in checklist) |
| Vault CRLF/BOM | Re-uploaded Unix-line vault |
| Finance engineering gate | `G1_FINANCE_ENGINEERING_SIGNOFF.md` |

---

## Files changed (repo)

- `scripts/apply-moosyl-sandbox-prod-env.sh`
- `scripts/g1-deploy-production.sh`
- `scripts/backup.sh`
- `scripts/g1-drill-wallet-inventory.sh`
- `engineering/G1_FINANCE_ENGINEERING_SIGNOFF.md`
- `engineering/G1_PRODUCTION_EXECUTION_CHECKLIST.md`
- `engineering/G1_PREP_REPORT.md`

---

## Tests

| Suite | Result |
|-------|--------|
| `payments` targeted (local + staging Redis) | **48/48 OK** (2026-11-09) |
| Prior full payments suite | **84/84 OK** (on file) |
| Wallet inventory (live) | **0** duplicate groups |
| Migration 0022 drill (backup restore) | **PASS** |

---

## Migrations (production)

`payments` **0019–0023** applied; additional RC app migrations applied during container boot (employees, operations, rides, etc.). `showmigrations payments` ends at **0023** all `[X]`.

---

## Backup / rollback

- Pre-deploy encrypted backup: `manifest_2026-11-09_13-31-44.sha256`
- Offsite monitor: **OK**
- Rollback: revert Docker images tagged pre-recreate; DB restore from `yala_db_2026-11-09_13-31-44.sql.gz.gpg` if needed

---

## Post-deploy verification

| Check | Result |
|-------|--------|
| `GET /health/` | **200** (`database`, `redis` ok) |
| `GET /payments/options/` (anon) | **401** (route exists; was 404) |
| `POST /payments/webhooks/moosyl/` (unsigned) | **403** |
| `GET /operations/admin/me/permissions/` (anon) | **401** |
| Django container | **healthy** |
| Celery workers | **OK** after `redis>=6.1` hotfix — health `celery_workers=2` |
| Nginx / www | Unchanged |

---

## Remaining (non-blocking for G1 API)

1. Register Moosyl **sandbox** webhook URL to `https://api.yalataxi.live/payments/webhooks/moosyl/` in Moosyl dashboard.
2. Optional frontend deploy with Moosyl admin UI flags.
3. **G2** / `PAYMENTS_LIVE_MODE=True` — separate CEO authorization.
4. Finance manual dashboard compare before live money.

---

## Production GO (G1)

**COMPLETE** for backend scope. Mobile apps use existing prod API host — verify authenticated `GET /payments/options/` on device when convenient.
