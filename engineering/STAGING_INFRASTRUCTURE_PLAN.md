# YALA — Isolated staging infrastructure plan

**Status:** Staging **does not exist** today (`staging.yalataxi.live` — no DNS).  
**Production reference (do not reuse):** `142.93.99.142` (`marketplace-s-1vcpu-2gb-fra1`, FRA1).  
**Authoritative deploy shape (prod):** `docker-compose.yml` — nginx, **3×** Daphne (`django` + 2 replicas), Postgres `yala_db`, Redis AOF, **2×** Celery workers + beat, Let’s Encrypt, SPA at `/opt/yala/frontend/build`.  
**Staging stack (repo):** `docker-compose.staging.yml`, `nginx/nginx.staging.conf`, `backend/taxi/env.staging.template`, `scripts/staging-first-boot.md`, `scripts/deploy-staging-coordinated.ps1` (mandatory `-Remote`, blocks prod IP).

---

## 1. Release alignment (no tag overwrites)

| Tag | Commit | Purpose |
|-----|--------|---------|
| `coordinated-admin-moosyl-rc1` | `23de3a2a` | Admin shell baseline |
| `coordinated-admin-moosyl-rc1.1` | `52f8f7a5` | Pilot functional QA |
| `coordinated-admin-moosyl-rc1.2` | `f37d8b41` | Security/growth RBAC |
| `coordinated-admin-moosyl-rc1.3` | `dd471e26` | **CEO-requested RC1.3** (frozen) |
| `coordinated-admin-moosyl-rc1.4` | `3af1b7d1` | `events.py` nested atomic / seed fix |
| `coordinated-admin-moosyl-rc1.5` | `69be7f60` | Jest green + QA harness |

**Staging deploy commit (recommended):** branch tip `release/coordinated-admin-moosyl-rc1` @ **`76126ab3`** (includes verification docs; same code as `rc1.5` + status hash).

**Do not** retag or move any row above.

---

## 2. Target architecture (isolated)

```
Internet
   │
   ▼
┌─────────────────────────────────────────────┐
│  Staging droplet (NEW IP — not 142.93.99.142) │
│  ┌─────────┐   ┌──────────┐  ┌───────────┐ │
│  │  nginx  │──▶│  django  │  │  replica  │ │
│  │  :443   │   │  :8000   │  │  (opt.)   │ │
│  └─────────┘   └────┬─────┘  └───────────┘ │
│                     │                        │
│        ┌────────────┼────────────┐         │
│        ▼            ▼            ▼         │
│   postgres:5432  redis:6379  celery+beat   │
│   (staging DB)   (db 1)      (same broker)   │
└─────────────────────────────────────────────┘
```

| Component | Staging rule |
|-----------|----------------|
| **Postgres** | New database `yala_staging` / new volume — **never** prod `DATABASE_URL |
| **Redis** | Dedicated instance or **Redis DB index ≥ 1** — never prod index `0` |
| **Static SPA** | `frontend/build` from `npm run build:web` with staging API URL baked at build time |
| **HTTPS** | Let's Encrypt via certbot (same pattern as prod compose mounts) |
| **DNS** | `staging.yalataxi.live` → SPA; `api-staging.yalataxi.live` → API (or path-based on one host) |
| **Backups** | `pg_dump` + tarball of `build` backup pattern (`rollback-admin-redesign.sh`) to **staging-only** Spaces prefix |
| **Secrets** | `/opt/yala/.env.staging` on server vault — **never** git |

---

## 3. Droplet recommendation & monthly cost (DigitalOcean, FRA1)

Production runs a **heavy** stack (3 Daphne + 2 Celery workers). Staging uses **1 Daphne + 1 worker** (`docker-compose.staging.yml`).

| Option | Spec | Fits | ~USD/mo | Verdict |
|--------|------|------|---------|---------|
| **Minimum viable** | 1 vCPU / 2 GB / 50 GB SSD (same class as prod) | Tight under load tests | **~$12** | OK for smoke QA only |
| **Recommended (smallest suitable)** | 2 vCPU / 4 GB / 80 GB SSD | Admin + Rider/Driver/Delivery + Celery + Moosyl drills | **~$24** | **CEO approval default** |

Additional (optional):

| Add-on | ~USD/mo |
|--------|---------|
| Spaces (staging backups, separate prefix) | **~$5** |
| Floating IP | **~$4** |
| Managed Postgres (if not in-compose) | **~$15** |

| **Recommended total (all-in-one compose on 4 GB droplet)** | **~$24–29/mo** |

No droplet purchased from engineering; no production server changes.

---

## 4. Environment variables (staging template)

Copy from `backend/taxi/.env.production.template` into vault-only `.env.staging`:

| Variable | Staging value |
|----------|----------------|
| `DEBUG` | `0` |
| `SECRET_KEY` | **new random** (rotate from prod) |
| `ALLOWED_HOSTS` | `staging.yalataxi.live,api-staging.yalataxi.live` |
| `DATABASE_URL` | `postgresql://…@postgres:5432/yala_staging` (compose) |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` |
| `REDIS_URL` | `redis://redis:6379/1` |
| `PAYMENTS_LIVE_MODE` | **`False`** |
| `MOOSYL_ENVIRONMENT` | **`sandbox`** |
| `MOOSYL_ALLOW_SANDBOX_SETTLEMENT` | `True` only during sandbox drills |
| `MOOSYL_API_BASE_URL` | Moosyl **sandbox** base (from dashboard) |
| `MOOSYL_SECRET_KEY` | vault |
| `MOOSYL_PUBLISHABLE_KEY` | vault |
| `MOOSYL_WEBHOOK_SECRET` | vault |
| `YALA_UAT_LOCAL` | `0` (real Celery on staging) |
| `YALA_PILOT_UAT_PASSWORD` | vault — for `seed_pilot_uat` |

**Build-time (CI or laptop):** `REACT_APP_API_URL=https://api-staging.yalataxi.live` (or same-origin if nginx proxies `/api`).

---

## 5. Moosyl sandbox (credentials — names only)

Obtain from **Moosyl merchant sandbox dashboard** (not git):

| Need | Used for |
|------|-----------|
| `MOOSYL_SECRET_KEY` | Server-side payment-request / adapter auth |
| `MOOSYL_PUBLISHABLE_KEY` | Client/config if required by checkout |
| `MOOSYL_WEBHOOK_SECRET` | HMAC verification of `sha256=` signatures |
| `MOOSYL_API_BASE_URL` | Sandbox API host |
| Webhook URL registration | `https://api-staging.yalataxi.live/payments/webhooks/moosyl/` (exact path per `urls.py`) |

**Bankily / Masravi / Sedad** are enabled through Moosyl’s aggregator (`MOOSYL_BANK_APPS`); no separate bank API keys in repo. Sandbox drill: create `YALA-RIDE-*` / `YALA-DELIVERY-*` requests, simulate transfer per Moosyl docs, replay webhook, confirm idempotency.

---

## 6. Access & credentials required from CEO / ops

| Item | Holder |
|------|--------|
| DigitalOcean team/API token (create droplet, DNS) | CEO / DevOps |
| Domain DNS (A/AAAA for staging hosts) | CEO |
| Moosyl sandbox keys + webhook signing secret | Finance / CEO |
| `STAGING_SSH` user + key (not `root@142.93.99.142` for staging) | DevOps |
| Sanitized DB dump for wallet **0022** drill | DBA (read-only export) |
| `scripts/qa-credentials.env` filled for staging pilot accounts | Ops laptop only |

---

## 7. Steps to begin staging deployment (first cut)

1. **Create** FRA1 droplet (2 vCPU / 4 GB); firewall: 22, 80, 443 only.  
2. **DNS** `staging.yalataxi.live` + `api-staging.yalataxi.live` → new IP.  
3. **Clone** `release/coordinated-admin-moosyl-rc1` @ `76126ab3`; **checkout tag optional** `coordinated-admin-moosyl-rc1.5`.  
4. **Place** `.env.staging`; `docker compose` with **staging** env file (duplicate compose override `docker-compose.staging.yml` if needed).  
5. `migrate` + `collectstatic`; start **worker + beat**.  
6. **Build** on operator machine: `REACT_APP_API_URL=… npm run build:web`; `verify-web-build.ps1`; rsync `build/` to staging nginx root.  
7. **Certbot** / HTTPS smoke `GET /api/health/ready/`.  
8. `seed_pilot_uat` with vault password; run `frontend/qa/admin-routes-auth-roles-mock.cjs` against staging URL (or live `admin-routes-auth.cjs` with spaced logins).  
9. Moosyl checklist in `MOOSYL_INTEGRATION_STATUS.md`.  
10. **Backup** staging DB + static; run rollback drill; fill `STAGING_EVIDENCE_TEMPLATE.md`.

---

*No production deploy. No G1/G2. No prod financial mutations.*
