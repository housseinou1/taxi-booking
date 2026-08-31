# YALA Enterprise v1.0 — Production Operations Report

**Document ID:** PROD-OPS-REPORT-001  
**Date:** 2026-07-22  
**Environment:** Production (`https://api.yalataxi.live`)  
**Golden commit:** `f6ffdcb4` — `release: YALA Enterprise v1.0.0 golden release candidate`  
**Method:** Live HTTPS probes, latency measurement, production smoke, compose/code review  
**Validation workstation:** External (no SSH to `142.93.99.142`)

---

## Final decision

# READY WITH CONDITIONS

| Readiness level | Decision |
|-----------------|----------|
| **Closed beta (≤25 users)** | ✅ **READY WITH CONDITIONS** |
| **Continuous production (GA)** | ❌ **NOT READY** |
| **24/7 unattended operations** | ❌ **NOT READY** |

**Conditions for closed beta:** Deploy golden commit `f6ffdcb4` (or tag `v1.0.0-rc-final`), verify offsite backup or CEO DR waiver, complete device QA, fix delivery prod E2E.

---

## Executive summary

Production infrastructure is **live and responding**. Database and Redis report healthy on every probe. API latency is acceptable for pilot scale (health p95 **512 ms**). Operational gaps remain in **observability** (no global request IDs, no structured logging), **backup certification** (offsite), and **failure simulation** (requires SSH). Platform smoke: **34/40 PASS**.

---

## Phase 1 — Background services

### Live verification (2026-07-22)

| Service | Status | Evidence |
|---------|:------:|----------|
| **Django (Daphne)** | ✅ OK | `/health/` 200; `/api/health/ready/` 200 |
| **PostgreSQL** | ✅ OK | `database: ok` on every readiness probe |
| **Redis** | ✅ OK | `redis: ok` on every readiness probe |
| **Celery Worker** | ⚠ Unverified live | Compose: 2 workers + healthcheck; prod health JSON omits celery (prior deploy) |
| **Celery Beat** | ⚠ Unverified live | Compose service defined; requires SSH `docker compose ps` |
| **WebSocket** | ⚠ Not probed | nginx `/ws/` configured; smoke skipped WS auth |
| **nginx** | ✅ OK | HTTPS 200; HTTP 301 redirect |
| **SSL / TLS** | ✅ OK | Valid certs; HSTS headers on redirect probe |

### Latency snapshot

| Endpoint | HTTP | Latency |
|----------|:----:|--------:|
| `/health/` | 200 | 1206 ms (cold) |
| `/api/health/ready/` | 200 | 142–533 ms (15 samples: avg **449 ms**, p95 **512 ms**) |
| `/api/health/live/` | 200 | 142 ms |
| `/admin/status` | 200 | 692 ms |
| `yalataxi.live` | 200 | 537 ms |

### Service config evidence

- **Compose:** `docker-compose.yml` — 3× Django replicas, `restart: always`, healthchecks on django/postgres/redis/celery-worker
- **SSL:** Let's Encrypt mounted at `/etc/letsencrypt`; certbot ACME path in nginx
- **SSH deep inspection:** ❌ Not available — container CPU/RAM, live Celery ping unconfirmed

---

## Phase 2 — Failure recovery

### Simulation status

| Scenario | Simulated live? | Expected recovery | Evidence |
|----------|:---------------:|-------------------|----------|
| Redis restart | ❌ No SSH | Auto via Docker; AOF persistence | `redis-server --appendonly yes` |
| Celery restart | ❌ No SSH | Worker healthcheck + `restart: always` | compose healthcheck |
| Backend restart | ❌ No SSH | Rolling 3-replica restart | compose config |
| Database reconnect | ⚠ Partial | Django `ensure_connection()` on health | readiness probe PASS after requests |
| Network interruption | ⚠ Partial | Client retry; no outage observed during 15-probe burst | latency stable |

**Assessment:** Recovery **architecture is sound** (Docker restart policies, health probes, PG volume persistence, Redis AOF). **Live fault injection not executed** — requires DevOps SSH access.

**Data corruption risk:** **Low** for single-service restarts per [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) §7.

---

## Phase 3 — Observability

| Capability | Status | Evidence |
|------------|:------:|----------|
| Health endpoints | ✅ | `/health/`, `/api/health/ready/`, `/api/health/live/`, `/api/health/status/` (admin) |
| Structured logging | ❌ | No `LOGGING` dict in `settings.py` — stdout only |
| Error logging | ⚠ | Docker logs + optional Sentry (`SENTRY_DSN` unconfirmed on prod) |
| Request IDs | ❌ | No global request-ID middleware found |
| Slow request logging | ⚠ Partial | `APIGatewayLogMiddleware` — partner API routes only (`/api-gateway/v1/partner/`) |
| Background job logging | ⚠ | Celery stdout via Docker; no centralized job dashboard |
| Admin monitoring UI | ✅ | `/admin/status`, `/admin/launch`, `/admin/operations-command` |
| Automated health cron | ✅ Documented | Every 15 min `curl /health/` |
| Alert paging | ❌ | Thresholds documented; no PagerDuty/Slack webhook in repo |

### Missing operational visibility (prioritized)

| ID | Gap | Severity | Recommendation |
|----|-----|:--------:|----------------|
| OPS-O-001 | No global request correlation ID | High | Add middleware (ops improvement — not done in this task) |
| OPS-O-002 | No Django structured LOGGING | High | JSON logging to stdout for log aggregation |
| OPS-O-003 | Sentry activation unconfirmed | Medium | Verify `SENTRY_DSN` in prod `.env.production` |
| OPS-O-004 | No slow-request logging on core API | Medium | Log requests > 2000 ms |
| OPS-O-005 | Celery queue depth not exposed publicly | Medium | Add to `/api/health/ready/` (code exists in branch; prod deploy pending) |
| OPS-O-006 | No automated alert routing | High | Configure Slack webhook for health cron failures |

---

## Phase 4 — Performance check

### API response times (measured 2026-07-22)

| Endpoint | Samples | Min | Avg | p95 | Max | Target |
|----------|:-------:|----:|----:|----:|----:|:------:|
| `/api/health/ready/` | 15 | 368 ms | 449 ms | **512 ms** | 533 ms | < 2000 ms ✅ |
| `/health/` | 15 | 377 ms | 426 ms | 499 ms | 547 ms | < 2000 ms ✅ |

### Other metrics

| Metric | Status | Evidence |
|--------|:------:|----------|
| Database query performance | ⚠ Not profiled | Requires SSH + `pg_stat_statements` |
| Queue processing latency | ⚠ Not measured | Requires Celery Flower or inspect |
| Memory usage | ⚠ Not measured | Requires SSH `docker stats` |
| CPU usage | ⚠ Not measured | Requires SSH |
| Admin dashboard p95 (historical) | 🔴 4086 ms | `PERFORMANCE_REPORT.md` — pre-golden deploy |
| HTTP 5xx under load | ✅ 0% | Smoke TEST5; RC1 monitoring doc |

### Stability recommendations (production stability only)

| ID | Recommendation | Blocks beta? | Rationale |
|----|----------------|:------------:|-----------|
| OPS-P-001 | Deploy golden commit to apply RC3 caching/index fixes | Yes | Reduces admin p95 |
| OPS-P-002 | Add container memory limits in compose | No | Prevents OOM cascade |
| OPS-P-003 | Enable Sentry on production | No | Faster error detection |
| OPS-P-004 | Re-measure admin p95 post-deploy | Yes | Confirm < 2000 ms target |

**No code changes applied in this validation task** — recommendations documented only.

---

## Phase 5 — Operational runbook

Created: [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md)

Includes: service restarts, backup verification, incident escalation, daily/weekly maintenance, emergency rollback, failure recovery matrix.

---

## Phase 6 — Production smoke (workflow validation)

**Run:** `platform-rc1-smoke.py` — 2026-07-22

| Result | Count |
|--------|------:|
| PASS | 34 |
| FAIL | 6 |
| Critical issues | 1 (delivery request) |

| Workflow | Result |
|----------|:------:|
| Authentication | ✅ |
| Ride book/accept | ✅ |
| Ride complete (API) | ❌ Geofence (smoke harness) |
| Delivery request | ❌ HTTP 400 |
| Admin / Finance | ✅ |
| Security | ✅ |

---

## Remaining operational blockers

### Critical — block GA and delay closed beta expansion

| ID | Blocker | Evidence | Owner | Resolution |
|----|---------|----------|-------|------------|
| OPS-B-001 | Offsite encrypted backups not certified | `DATA_PROTECTION_CERTIFICATION.md` | DevOps | Configure `BACKUP_OFFSITE_REMOTE` |
| OPS-B-002 | Golden commit not deployed to production | Health response lacks celery fields from latest code | DevOps | Deploy `f6ffdcb4` |
| OPS-B-003 | Live failure recovery not simulated | SSH blocked | DevOps | Execute runbook §7 drills on server |
| OPS-B-004 | No automated alert paging | `MONITORING_CERTIFICATION.md` | DevOps | Slack/PagerDuty webhook |

### High — block GA; acceptable for closed beta with monitoring

| ID | Blocker | Evidence | Owner |
|----|---------|----------|-------|
| OPS-B-005 | Delivery prod E2E HTTP 400 | Smoke TEST2 | Engineering |
| OPS-B-006 | No global request ID / structured logs | Code review | Engineering |
| OPS-B-007 | Device QA unsigned | `PILOT_DEVICE_TESTING.md` | QA |
| OPS-B-008 | Admin p95 not re-measured post-deploy | 4086 ms baseline | QA |
| OPS-B-009 | Sentry activation unconfirmed | Settings code only | DevOps |

### Medium — monitor during beta

| ID | Blocker | Evidence |
|----|---------|----------|
| OPS-B-010 | Celery/Beat live status unverified | SSH required |
| OPS-B-011 | WebSocket live probe not run | Smoke skip |
| OPS-B-012 | SSL cert expiry not verified on server | certbot not run from workstation |
| OPS-B-013 | No staging environment | UAT-D-003 |

---

## Decision matrix

| Criterion | Closed beta | Production GA |
|-----------|:-----------:|:-------------:|
| API health 200 | ✅ | ✅ |
| DB + Redis ok | ✅ | ✅ |
| Core tests passing | ✅ 256/256 | ✅ |
| Smoke ≥38/40 | ❌ 34/40 | ❌ |
| Offsite backup | ❌ | ❌ |
| Observability complete | ❌ | ❌ |
| Failure drills executed | ❌ | ❌ |
| Device QA signed | ❌ | ❌ |
| Alert paging | ❌ | ❌ |

---

## Sign-off

| Role | Closed beta | Production GA | Date |
|------|:-----------:|:---------------:|------|
| DevOps | ⚠ Conditional | ❌ Not ready | 2026-07-22 |
| Engineering | ⚠ Conditional | ❌ Not ready | 2026-07-22 |
| Operations | ⚠ Conditional | ❌ Not ready | 2026-07-22 |
| CEO | Pending | Pending | — |

---

## Evidence index

| Document | Content |
|----------|---------|
| [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) | Phase 5 runbook |
| [PRODUCTION_INFRASTRUCTURE.md](../release/PRODUCTION_INFRASTRUCTURE.md) | Infra cert |
| [MONITORING_CERTIFICATION.md](../release/MONITORING_CERTIFICATION.md) | Observability cert |
| [DATA_PROTECTION_CERTIFICATION.md](../release/DATA_PROTECTION_CERTIFICATION.md) | Backup cert |
| [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](../release/device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md) | Smoke results |
| [GOLDEN_RELEASE_REPORT.md](../release/GOLDEN_RELEASE_REPORT.md) | Golden artifacts |

**Report issued:** 2026-07-22  
**Next validation:** After golden deploy + SSH access restored
