# YALA Enterprise v1.0 — Pilot Deployment Report

**Document ID:** PILOT-DEPLOY-001  
**Date:** 2026-07-22  
**Environment:** Production pilot (`https://api.yalataxi.live` · `142.93.99.142`)  
**Pilot model:** Controlled production deployment (no separate staging — UAT-D-003)  
**LC1 tag:** Not yet applied · uncommitted LC1 fixes not deployed

---

## Executive summary

| Component | Status | Evidence |
|-----------|:------:|----------|
| Backend API | ✅ **LIVE** | Health 200; DB + Redis ok |
| Frontend (Admin SPA) | ✅ **LIVE** | `www.yalataxi.live/admin` HTTP 200 |
| PostgreSQL | ✅ **OK** | `/api/health/ready/` → `database: ok` |
| Redis | ✅ **OK** | `/api/health/ready/` → `redis: ok` |
| Celery | ⚠ **Assumed OK** | Workers not exposed in health JSON on current prod build |
| WebSockets | ⚠ **Not probed** | nginx `/ws/` configured; smoke skipped WS auth |
| HTTPS | ✅ **OK** | All probes over TLS 200 |
| Monitoring | ⚠ **Partial** | Health cron documented; Sentry unconfirmed; no auto-paging |
| LC1 code deploy | ❌ **NOT DONE** | Latest fixes in uncommitted working tree |

**Verdict:** Production stack is **operational for pilot API validation**. Full LC1 pilot deploy (commit + migrate + frontend) **pending DevOps execution**.

---

## Deployment approach

Because no staging environment exists, the pilot uses **production infrastructure with a capped user cohort** (≤25 users per `LC1_DECISION.md`). This matches the closed-beta model documented in prior release gates.

### Deploy procedure (pending execution)

```bash
# On production host 142.93.99.142
cd /opt/yala
git fetch origin
git checkout release/v1.0-rc1   # after LC1 commit + tag v1.0.0-lc1
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala run --rm django python manage.py migrate --noinput
docker compose -p yala run --rm django python manage.py collectstatic --noinput
docker compose -p yala up -d

# Frontend (from workstation or CI)
cd frontend && npm ci && npm run build
bash scripts/deploy-production-frontend.sh

# Verify
curl -fsS https://api.yalataxi.live/api/health/ready/
python scripts/platform-rc1-smoke.py
```

**SSH deploy from this workstation:** Not executed — port 22 unreachable from validation environment (documented in `INFRASTRUCTURE_CERTIFICATION_REPORT.md`).

---

## Component verification (observed 2026-07-22)

### Backend

| Check | Result | Timestamp | Method |
|-------|:------:|-----------|--------|
| `/health/` | ✅ 200 | 13:08 UTC | `platform-rc1-smoke.py` |
| `/api/health/ready/` | ✅ 200, DB+Redis ok | 13:10 UTC | Python probe |
| Auth login | ✅ 200 | 13:08 UTC | QA rider/driver/admin |
| Ride request | ✅ HTTP 201 | 13:08 UTC | Smoke TEST1 |
| Admin dashboard API | ✅ 200 | 13:09 UTC | `/payments/admin/dashboard/` |
| Launch KPIs API | ✅ 200 | 13:10 UTC | `/operations/launch/kpis/` |
| HTTP 5xx | ✅ None observed | 13:08 UTC | Smoke TEST5 |

**Stack (from `docker-compose.yml`):** 3× Daphne ASGI replicas, postgres 15, redis 7, 2× celery-worker, celery-beat, nginx.

### Frontend

| URL | HTTP | Timestamp |
|-----|:----:|-----------|
| `https://www.yalataxi.live/admin` | 200 | 2026-07-22 |
| `https://www.yalataxi.live/admin/status` | 200 | 2026-07-22 |
| `https://www.yalataxi.live/admin/executive` | 200 | 2026-07-22 |
| `https://www.yalataxi.live/admin/operations` | 200 | 2026-07-22 |

Local build artifact: `frontend/build/index.html` present (not confirmed deployed today).

### Database

| Check | Result |
|-------|:------:|
| Connectivity | ✅ `database: ok` |
| Migrations (local) | ✅ `makemigrations --check` PASS |
| Migrations (prod) | ☐ LC1 migrations not applied |

### Redis

| Check | Result |
|-------|:------:|
| Connectivity | ✅ `redis: ok` |
| AOF persistence | ✅ Configured in compose |

### Celery

| Check | Result |
|-------|:------:|
| Workers in compose | ✅ 2 workers + beat |
| Live worker ping | ☐ Requires SSH |
| RC1 monitoring claim | ≥2 workers (prior doc) |

### WebSockets

| Check | Result |
|-------|:------:|
| nginx `/ws/` proxy | ✅ Code review |
| JWT WS auth | ✅ Code review |
| Live WS connection test | ☐ Skipped in smoke |

### HTTPS

| Check | Result |
|-------|:------:|
| TLS on 443 | ✅ |
| HTTP → HTTPS redirect | ✅ nginx config |
| Cert validity | ✅ Browser/curl accept |

### Monitoring

| Check | Result |
|-------|:------:|
| Health endpoint | ✅ 200 |
| Health latency (10 samples) | avg **490 ms**, p95 **533 ms** |
| Sentry DSN active | ☐ Unconfirmed |
| Automated health cron | ✅ Documented every 15 min |
| Alert paging | ❌ Not configured |

---

## Post-deploy validation (required)

| Step | Command | Pass criteria |
|------|---------|---------------|
| Health | `curl https://api.yalataxi.live/api/health/ready/` | HTTP 200, DB+Redis ok |
| Smoke | `python scripts/platform-rc1-smoke.py` | ≥38/40 PASS |
| QA accounts | `python scripts/fix-qa-cert-accounts.py` (on server) | Phone verified, no open rides |
| Admin KPIs | Login + `/operations/launch/kpis/` | HTTP 200 |

---

## Gaps blocking full pilot deploy sign-off

| ID | Gap | Owner |
|----|-----|-------|
| PILOT-D-001 | LC1 code not committed/tagged | Engineering |
| PILOT-D-002 | LC1 backend not deployed to production | DevOps |
| PILOT-D-003 | SSH deploy not executed from audit workstation | DevOps |
| PILOT-D-004 | Offsite backups not configured | DevOps |
| PILOT-D-005 | No dedicated staging | DevOps |

---

## Related

- [LC1_RELEASE_ARTIFACTS.md](../release/LC1_RELEASE_ARTIFACTS.md)
- [PRODUCTION_INFRASTRUCTURE.md](../release/PRODUCTION_INFRASTRUCTURE.md)
- [PILOT_GO_LIVE_DECISION.md](../release/PILOT_GO_LIVE_DECISION.md)
