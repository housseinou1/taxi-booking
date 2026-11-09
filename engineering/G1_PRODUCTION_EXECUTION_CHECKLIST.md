# G1 production backend — execution checklist

**Release branch:** `release/coordinated-admin-moosyl-rc1`  
**Pinned prep commit:** `38b198fe5e9e9776d6ac34ca20e0f7e31168b928` (push before cutover; verify `git rev-parse HEAD` on server)  
**Policy:** `PAYMENTS_LIVE_MODE=False` · `CASHLESS_POLICY_ENFORCED=True` · no live Moosyl settlement (G2 separate)

**Do not** redeploy www static bundle in this window unless CEO orders Moosyl admin UI flags.

---

## A. Pre-cutover (CEO + ops)

| # | Action | Pass criterion |
|---|--------|----------------|
| A1 | Fresh encrypted backup | `bash /opt/yala/scripts/backup-encrypted.sh` → `backup-status.json` ok |
| A2 | Offsite monitor | `set -a; . /home/yala/.backup-offsite.env; set +a; bash /opt/yala/scripts/backup-monitor.sh` |
| A3 | G1 drill inventory | `bash /opt/yala/scripts/g1-drill-wallet-inventory.sh` → `duplicate_reference_groups=0` or finance review |
| A4 | Moosyl **sandbox** vault on server | Add to `/opt/yala/backend/taxi/.env.production` **via SSH vault only** (see `scripts/moosyl-secure-credential-setup.md`): `MOOSYL_SECRET_KEY`, `MOOSYL_WEBHOOK_SECRET`, `MOOSYL_ENVIRONMENT=sandbox`, `MOOSYL_ALLOW_SANDBOX_SETTLEMENT=True`, `PAYMENTS_LIVE_MODE=False` — **never** paste keys in chat |
| A5 | Finance + CEO sign-off | `engineering/MOOSYL_SANDBOX_FINANCE_SIGNOFF_REPORT.md` manual rows closed |
| A6 | Maintenance note | Apps may briefly see API restarts; Ride #91 untouched |

---

## B. Deploy code (on `142.93.99.142`)

```bash
cd /opt/yala
git fetch origin
git checkout release/coordinated-admin-moosyl-rc1
git reset --hard 38b198fe   # or newer tagged G1 SHA after prep
```

Rebuild **all** API/worker images from the same tree:

```bash
docker compose -p yala build django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat
```

Rolling restart (single wave; nginx unchanged):

```bash
docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat
```

Wait for health:

```bash
for c in yala-django-1; do
  docker inspect "$c" --format '{{.State.Health.Status}}'
done
```

---

## C. Migrations (approved scope)

```bash
docker compose -p yala exec -T django python manage.py wallet_reference_inventory
docker compose -p yala exec -T django python manage.py showmigrations payments
docker compose -p yala exec -T django python manage.py migrate payments 0019 --noinput
docker compose -p yala exec -T django python manage.py migrate payments 0020 --noinput
docker compose -p yala exec -T django python manage.py migrate payments 0021 --noinput
docker compose -p yala exec -T django python manage.py migrate payments 0022 --noinput
docker compose -p yala exec -T django python manage.py migrate payments 0023 --noinput
docker compose -p yala exec -T django python manage.py migrate --noinput
docker compose -p yala exec -T django python manage.py check --deploy
```

If `0022` aborts on duplicates, **stop** — do not force; restore from backup.

---

## D. Smoke (production)

| Check | Command / expectation |
|-------|---------------------|
| Health | `curl -fsS https://api.yalataxi.live/health/` |
| Options (authed) | `GET /payments/options/` → **200**, cash unavailable, moosyl methods, commission 30/70 |
| Webhook reject unsigned | `POST /payments/webhooks/moosyl/` without signature → **4xx** |
| Admin permissions | `GET /operations/admin/me/permissions/` anonymous → **401** |
| Legacy ride APIs | Rider/Driver/Delivery smoke (existing JWT flows) |
| Workers | `docker compose -p yala ps` — celery up |

Record bundle hash for mobile apps: unchanged API host `api.yalataxi.live` — no app store release required for G1 API-only.

---

## E. Rollback

1. **Code:** `docker tag` saved pre-deploy images (`yala-predeploy-<stamp>` pattern) or `git reset` + rebuild previous SHA.  
2. **DB:** restore latest `yala_db_*.sql.gz.gpg` from `/home/yala/backups/daily/` (decrypt + `pg_restore` drill validated).  
3. **Frontend:** not required for API rollback; www remains on current static bundle.

```bash
# Example image rollback (adjust tag from pre-deploy save):
# docker tag yala-predeploy-YYYYMMDD:yala-django-1_ yala-django:latest
# docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat
```

---

## F. Out of scope (G1)

- `PAYMENTS_LIVE_MODE=True` / production Moosyl merchant (G2)  
- Play Store production publish  
- Frontend `REACT_APP_MOOSYL_UI_ENABLED=1` (optional follow-up deploy)
