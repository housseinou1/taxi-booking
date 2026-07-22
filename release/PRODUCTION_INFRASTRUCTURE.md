# YALA Enterprise v1.0 — Production Infrastructure Certification

**Document ID:** PROD-INFRA-CERT-001  
**Date:** 2026-07-22  
**Environment:** Production (`142.93.99.142` · DigitalOcean)  
**API:** https://api.yalataxi.live  
**Admin:** https://www.yalataxi.live/admin  
**Method:** Live HTTPS probes + compose/nginx code review + prior infra audit

---

## Executive summary

| Category | Score | Status |
|----------|:-----:|:------:|
| Production server configuration | 85% | **CONDITIONAL PASS** |
| HTTPS / SSL / domain routing | 90% | **PASS** |
| Reverse proxy (nginx) | 88% | **PASS** |
| Application server (Daphne ASGI) | 85% | **PASS** |
| PostgreSQL | 80% | **CONDITIONAL PASS** |
| Redis | 85% | **PASS** |
| Celery worker / beat | 75% | **CONDITIONAL PASS** |
| WebSocket service | 82% | **CONDITIONAL PASS** |
| Scheduled jobs | 70% | **CONDITIONAL PASS** |
| **Overall infrastructure** | **78%** | **CONDITIONAL PASS** |

**Verdict:** Infrastructure supports **closed beta (≤25 users)**. **Full production GA** requires SSH verification, offsite backups, staging, and container resource limits.

---

## Validation evidence (2026-07-22)

### Live HTTPS probes

| URL | HTTP | Result |
|-----|:----:|--------|
| `https://api.yalataxi.live/health/` | 200 | PASS |
| `https://api.yalataxi.live/api/health/ready/` | 200 | `database: ok`, `redis: ok` |
| `https://api.yalataxi.live/api/health/live/` | 200 | PASS |
| `https://yalataxi.live` | 200 | PASS |
| `https://www.yalataxi.live/admin` | 200 | PASS |
| `https://api.yalataxi.live/api/health/` | 404 | Expected — health routed at `/health/` and `/api/health/ready/` |

**Prior smoke (2026-07-22 12:50 UTC):** Health returned `database: ok`, `redis: ok` — [`device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md`](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md)

---

## 1. Production server configuration

| Check | Status | Evidence |
|-------|:------:|----------|
| Docker Compose stack defined | ✅ | `docker-compose.yml` — nginx, 3× Django, postgres, redis, 2× celery-worker, celery-beat |
| `restart: always` on all services | ✅ | All production services |
| Production env template | ✅ | `backend/taxi/.env.production.template` |
| Secrets not in repo | ✅ | `.env.production` gitignored; template uses placeholders |
| 3 Django replicas (horizontal scale) | ✅ | `django`, `django-replica`, `django-replica-2` |
| Live `docker compose ps` | ☐ | SSH to `142.93.99.142` blocked from audit workstation |
| Container CPU/memory limits | ❌ | No `deploy.resources` in compose — **P1 risk** |
| Staging environment | ❌ | UAT-D-003 — not provisioned |

**Evidence source:** Code review + public health probes. Deep server audit blocked — see [`INFRASTRUCTURE_CERTIFICATION_REPORT.md`](./INFRASTRUCTURE_CERTIFICATION_REPORT.md) (2026-07-21).

---

## 2. HTTPS / SSL

| Check | Status | Evidence |
|-------|:------:|----------|
| TLS on port 443 | ✅ | All probed URLs return HTTPS 200 |
| HTTP → HTTPS redirect | ✅ | `nginx/nginx.conf` — `return 301 https://$host$request_uri` |
| Let's Encrypt cert paths | ✅ | `/etc/letsencrypt/live/api.yalataxi.live/` mounted in compose |
| TLS 1.2+ only | ✅ | `ssl_protocols TLSv1.2 TLSv1.3` in nginx |
| HSTS | ✅ | `Strict-Transport-Security` in nginx (admin + API hosts) |
| Cert expiry / auto-renewal | ☐ | Cannot run `certbot certificates` without SSH |

**Live probe:** All production URLs served over HTTPS with valid certificates (browser/curl accepted).

---

## 3. Domain routing

| Domain | Role | Status |
|--------|------|:------:|
| `api.yalataxi.live` | REST API + WebSocket | ✅ 200 |
| `yalataxi.live` | Marketing / redirect | ✅ 200 |
| `www.yalataxi.live` | Admin SPA + static | ✅ 200 (admin) |
| `staging.yalataxi.live` | Pre-prod | ❌ Not configured |

**nginx upstream:** `least_conn` load balancing across 3 Daphne replicas — `nginx/nginx.conf` lines 31–37.

---

## 4. Nginx

| Check | Status | Evidence |
|-------|:------:|----------|
| Active config mounted | ✅ | `./nginx/nginx.conf:/etc/nginx/nginx.conf` |
| API reverse proxy | ✅ | `/auth/`, `/rides/`, `/api/`, etc. → Django upstream |
| Static / media serving | ✅ | `/static/admin/`, `/media/` aliases |
| WebSocket upgrade | ✅ | `/ws/` with `Upgrade` / `Connection` headers, 86400s timeout |
| Rate limiting | ✅ | Auth 10 req/min; API 3000 req/min |
| Security headers | ✅ | X-Frame-Options, CSP (admin), Referrer-Policy, Permissions-Policy |
| `/health/` exempt from rate limit | ✅ | Dedicated location block |
| Live `nginx -t` | ☐ | Requires SSH |

---

## 5. Gunicorn / Uvicorn / Daphne

| Item | Finding |
|------|---------|
| **Production runtime** | **Daphne ASGI** — `daphne -b 0.0.0.0 -p 8000 taxi.asgi:application` |
| Dockerfile CMD | `backend/taxi/Dockerfile` |
| HTTP + WebSocket | Single ASGI app via Django Channels |
| Gunicorn / Uvicorn | Listed in requirements but **not used** in production compose |

**Assessment:** Daphne is appropriate for Channels/WebSocket. No separate Gunicorn layer required.

**Docker healthcheck:** Hits `http://127.0.0.1:8000/api/health/ready/` every 30s.

---

## 6. Database connectivity

| Check | Status | Evidence |
|-------|:------:|----------|
| PostgreSQL 15 in compose | ✅ | `postgres:15-alpine` |
| Health check | ✅ | `pg_isready -U yala_user -d yala_db` |
| `max_connections=250` | ✅ | Compose command |
| Live connectivity | ✅ | `/api/health/ready/` → `database: ok` |
| Connection pooling (PgBouncer) | ❌ | Not configured — **P2 recommendation** |
| Replication / failover | ❌ | Single-node Postgres |
| Live PG stats | ☐ | Requires SSH |

---

## 7. Redis

| Check | Status | Evidence |
|-------|:------:|----------|
| Redis 7 in compose | ✅ | `redis:7-alpine` |
| AOF persistence | ✅ | `redis-server --appendonly yes` |
| Health check | ✅ | `redis-cli ping` |
| Live connectivity | ✅ | `/api/health/ready/` → `redis: ok` |
| Used for cache, Celery, Channels, rate limits | ✅ | `settings.py`, compose env |
| Live memory / eviction stats | ☐ | Requires SSH |

---

## 8. Celery worker

| Check | Status | Evidence |
|-------|:------:|----------|
| Workers configured | ✅ | `celery-worker` + `celery-worker-2`, concurrency 4 each |
| Worker healthcheck | ✅ | `celery inspect ping` in compose |
| Redis broker + result backend | ✅ | `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` |
| Live worker count | ⚠ | RC1 monitoring doc claims ≥2 workers; readiness endpoint on prod did not expose `celery_workers` field (may be older deploy) |
| Queue depth monitoring | ☐ | No Flower; no public queue-depth endpoint |

---

## 9. Celery Beat

| Check | Status | Evidence |
|-------|:------:|----------|
| Beat service in compose | ✅ | `celery-beat` with `DatabaseScheduler` |
| `django_celery_beat` installed | ✅ | `settings.py` INSTALLED_APPS |
| Live beat process | ☐ | Requires SSH |
| Scheduled task registry | ⚠ | Tasks defined in app code; periodic entries managed via DB scheduler — not enumerated without server access |

---

## 10. WebSocket service

| Check | Status | Evidence |
|-------|:------:|----------|
| ASGI routing | ✅ | `taxi/asgi.py` — HTTP + WebSocket |
| nginx `/ws/` proxy | ✅ | Upgrade headers, long timeout |
| Redis channel layer | ✅ | Django Channels + Redis |
| JWT auth on WS connect | ✅ | Code review — `asgi.py` |
| Live WS smoke | ☐ | Skipped in API smoke (no websocket-client) |

---

## 11. Scheduled jobs

| Job | Schedule | Script / mechanism | Verified |
|-----|----------|-------------------|:--------:|
| Encrypted backup | 02:00 UTC | `scripts/setup-backup-cron.sh` → `backup-encrypted.sh` | ☐ Script only |
| Backup monitor | 08:00 UTC | `backup-monitor.sh` | ☐ Script only |
| Health probe | Every 15 min | `curl -f https://api.yalataxi.live/health/` | ✅ Doc + live 200 |
| Launch certification | Daily | `scripts/launch-certification-prod.py` | ☐ Not run from dev |
| Celery periodic tasks | DB-driven | `django_celery_beat` | ☐ Requires SSH |

---

## Gaps and recommendations

| ID | Gap | Severity | Action |
|----|-----|:--------:|--------|
| INFRA-001 | SSH blocked — cannot verify live container state | P1 | Restore DevOps SSH access; run `docker compose ps` |
| INFRA-002 | No container resource limits | P1 | Add `mem_limit` / `cpus` to compose |
| INFRA-003 | No staging environment | P0 | Provision `staging.yalataxi.live` |
| INFRA-004 | No PgBouncer | P2 | Evaluate before GA scale |
| INFRA-005 | Celery queue monitoring absent | P1 | Add Flower or `/api/health/ready/` celery fields on prod |
| INFRA-006 | RC1 backend not deployed | P0 | UAT-D-006 — deploy latest migrations |

---

## Certification statement

**Infrastructure is CONDITIONALLY CERTIFIED** for closed beta deployment with active monitoring. **NOT CERTIFIED** for full public launch until INFRA-003, INFRA-006, offsite backups (see [`DATA_PROTECTION_CERTIFICATION.md`](./DATA_PROTECTION_CERTIFICATION.md)), and SSH-based verification complete.

**Signed by:** Engineering (code review + live probes) · Operations (pending SSH verification)

**Related:** [`INFRASTRUCTURE_CERTIFICATION_REPORT.md`](./INFRASTRUCTURE_CERTIFICATION_REPORT.md) · [`PRODUCTION_CERTIFICATE.md`](./PRODUCTION_CERTIFICATE.md)
