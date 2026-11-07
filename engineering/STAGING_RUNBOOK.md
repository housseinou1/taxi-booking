# YALA — Staging runbook (coordinated Admin + Moosyl RC)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Baseline commits:** `d30842bc` (coordinated implementation) · `a9eb6141` (docs follow-up) · HEAD includes later QA fixes  
**Production:** **DO NOT DEPLOY** (G1) · **Live Moosyl:** **OFF** (G2)  
**Final RC git tag:** create **only after** staging sign-off (CEO)

---

## 0. Preconditions

| Check | Requirement |
|-------|----------------|
| Staging isolated | Separate host/DB from production; no prod API URL in staging `.env` |
| Secrets | Moosyl sandbox keys, DB, SSH — **vault only** (never git) |
| `PAYMENTS_LIVE_MODE` | **false** / unset on staging until explicit G2 on prod |
| Ride #91 / prod wallet | **No** prod financial writes; wallet 0022 drill on **sanitized copy** only |

---

## 1. Checkout and verify

```bash
git fetch origin
git checkout release/coordinated-admin-moosyl-rc1
git log -1 --oneline
# Expect ancestor of: d30842bc4e3a2add8360af9a8e9b6a7aff379315
git merge-base --is-ancestor d30842bc4e3a2add8360af9a8e9b6a7aff379315 HEAD && echo OK
```

Local verification before staging cut:

```powershell
.\scripts\run-coordinated-verification.ps1
cd frontend
npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build
```

---

## 2. Backend deployment (staging)

**Path:** `backend/taxi` on staging app server (Docker or venv per your stack).

1. **Backup staging DB** (snapshot or `pg_dump`) — record path and SHA256.
2. Deploy code from release branch (rsync/git pull on staging only).
3. **Environment** (staging vault):
   - `YALA_UAT_LOCAL=0` (real Celery/redis on staging if used)
   - `MOOSYL_*` = **sandbox** credentials only
   - `PAYMENTS_LIVE_MODE=0` (confirm)
   - `DEBUG=False` for staging-like prod parity (optional `STAGING=1` if you use it)
4. **Migrations** (staging DB only):

```bash
cd backend/taxi
python manage.py migrate --plan    # review
python manage.py migrate           # includes payments 0022 when approved for staging
python manage.py check --deploy
```

5. **Wallet 0022 pre-flight** (sanitized prod-like DB copy, not live prod):

```bash
python manage.py wallet_reference_inventory > wallet-inventory-staging.json
# Review engineering/WALLET_MIGRATION_0022_RESOLUTION.md
```

6. **Static/collectstatic** if Django serves admin assets on staging (optional).
7. **Restart** Django/gunicorn/uvicorn + **Celery worker** + **Celery beat** (if scheduled tasks required for smoke).

---

## 3. Celery and workers

| Step | Action |
|------|--------|
| Broker | Staging Redis/Rabbit — not production broker |
| Workers | `celery -A taxi worker -l info` (exact app path per your compose) |
| Beat | Start only if staging tests need scheduled jobs |
| Smoke | Trigger one harmless task or health check; confirm worker logs |

---

## 4. Frontend (`build:web`)

On build host (CI or ops laptop):

```powershell
cd frontend
cp .env.production.example .env.production   # set STAGING API URL, not prod unless intended
$env:REACT_APP_API_URL='https://staging-api.example'  # your staging API
npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build
```

Upload to **staging** static root only (adapt paths from prod scripts):

- Reference: `scripts/deploy-coordinated-frontend.ps1` / `deploy-admin-redesign.ps1`
- **Do not** run production `Remote=root@142.93.99.142` without changing `-Remote` to staging

Staging nginx: SPA fallback to `index.html`; API reverse-proxy to staging backend.

---

## 5. Admin Dashboard verification (staging)

| Step | Tool |
|------|------|
| Pilot seed (staging only) | `YALA_PILOT_UAT_PASSWORD` from vault · `python manage.py seed_pilot_uat` |
| Mock parity (optional) | `node qa/admin-routes-auth-mock.cjs https://staging-www/...` |
| Live 4-role auth | Load `scripts/qa-credentials.env` from vault · `admin-routes-auth.cjs` per role |
| Critical workflows | CEO: exec home, fleet, payments (Moosyl tab **read-only**); HR: employees/id-cards; Finance: approvals; Ops: delivery directory |
| RBAC | Confirm 403 on denied modules (not silent empty screens) |

Rate limits: space login attempts; `python manage.py shell -c "from django.core.cache import cache; cache.clear()"` on staging if needed.

---

## 6. Moosyl sandbox (G2 still OFF globally)

Use checklist in [`MOOSYL_INTEGRATION_STATUS.md`](MOOSYL_INTEGRATION_STATUS.md).

Per provider (**Bankily**, **Masravi**, **Sedad**):

1. Rider/delivery checkout shows methods when `MOOSYL_*` sandbox configured.
2. Create payment request → simulate transfer (Moosyl dashboard).
3. Deliver signed webhook to staging URL (HMAC secret from vault).
4. Confirm **single** settlement; replay webhook → duplicate/idempotent outcome.
5. Taxi **70/30**, delivery **80/20**, Moosyl **1%** on YALA — compare `Payment` rows to API docs.
6. Failed/cancelled webhook → **no** wallet credit.
7. Admin Moosyl panel: readiness UI, **no** secrets in responses.

---

## 7. Rider, Driver, Delivery regression

| App | Smoke |
|-----|--------|
| Rider | Login → book/history (staging test account) |
| Driver | Login → availability/history |
| Delivery | Customer + courier paths on staging build |

Operational routes unchanged: `/rider`, `/driver`, `/delivery/courier` (marketing remains `/website/*`).

---

## 8. Backup and rollback

**Before staging deploy**

- DB snapshot ID: `________________`
- Frontend backup dir: e.g. `/home/yala/pre-website-deploy-<stamp>` (adapt for staging)

**Frontend rollback** (prod script pattern — use staging paths):

```bash
scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-<STAMP>
```

**Backend rollback**

- Redeploy previous staging image/commit + restore DB snapshot if migrate was destructive.

**Record in** `engineering/staging-evidence/YYYYMMDD.md` (create per run; **no secrets**).

---

## 9. Staging sign-off → RC tag (CEO)

After all sections PASS:

```bash
git tag -a coordinated-admin-moosyl-rc-final -m "Staging verified YYYY-MM-DD"
git push origin coordinated-admin-moosyl-rc-final
```

Until then: **do not** tag final RC for production G1.

---

## 10. Evidence template (fill after execution)

| Area | Result | Artifact |
|------|--------|----------|
| Release commit on staging | | `git rev-parse HEAD` |
| `migrate --plan` | | log excerpt |
| `wallet_reference_inventory` | | JSON file path |
| `verify-web-build` | | bundle hash |
| Admin CEO/HR/Finance/Ops QA | | report JSON path (no passwords) |
| Moosyl Bankily/Masrvi/Sedad | | pass/fail per provider |
| Rider/Driver/Delivery | | pass/fail |
| Backup + rollback drill | | backup dir + rollback timestamp |

---

## Related docs

- [`STAGING_VERIFICATION_CHECKLIST.md`](STAGING_VERIFICATION_CHECKLIST.md)
- [`FINAL_RELEASE_READINESS_REPORT.md`](FINAL_RELEASE_READINESS_REPORT.md)
- [`WALLET_MIGRATION_0022_RESOLUTION.md`](WALLET_MIGRATION_0022_RESOLUTION.md)
- [`scripts/qa-credentials.env.example`](../scripts/qa-credentials.env.example)
