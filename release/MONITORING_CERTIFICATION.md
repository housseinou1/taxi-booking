# YALA Enterprise v1.0 — Monitoring Certification

**Document ID:** PROD-MON-CERT-001  
**Date:** 2026-07-22  
**Scope:** Error logging, health endpoints, crash reporting, performance, alerting  
**Method:** Code review + live health probes + monitoring docs review  
**Related:** [`PRODUCTION_MONITORING_RC1.md`](./PRODUCTION_MONITORING_RC1.md) · [`engineering/06_MONITORING_RUNBOOK.md`](../engineering/06_MONITORING_RUNBOOK.md)

---

## Executive summary

| Capability | Status | Score |
|------------|:------:|:-----:|
| Error logging | ⚠ CONDITIONAL | 70% |
| Health endpoints | ✅ PASS | 95% |
| Crash reporting | ⚠ CONDITIONAL | 65% |
| Performance monitoring | ⚠ CONDITIONAL | 60% |
| Alerting | ⚠ CONDITIONAL | 55% |
| **Overall monitoring** | **CONDITIONAL PASS** | **69%** |

**Verdict:** Monitoring is **ADEQUATE FOR CLOSED BETA** with manual ops oversight. **NOT CERTIFIED** for unattended public launch — no paging integration, no APM, p95 exceeds target.

---

## Validation evidence (2026-07-22)

### Live health probes

| Endpoint | HTTP | Payload |
|----------|:----:|---------|
| `/health/` | 200 | `status: ok`, `database: ok`, `redis: ok` |
| `/api/health/ready/` | 200 | Same |
| `/api/health/live/` | 200 | `status: ok`, `service: yala-api` |

### Smoke — TEST5-STABILITY

| Test | Result |
|------|:------:|
| Health no 5xx | ✅ PASS |
| API timeouts < 60s | ✅ PASS |
| UI blank screens | ☐ Not exercised (device QA) |
| Console errors | ☐ Not exercised (device QA) |

---

## 1. Error logging

| Source | Mechanism | Status |
|--------|-----------|:------:|
| Django exceptions | stdout → Docker logs | ✅ |
| Sentry (optional) | `SENTRY_DSN` in settings | ⚠ Code ready; prod activation unconfirmed |
| Celery task failures | Worker logs + Sentry integration | ⚠ |
| nginx errors | `/var/log/nginx/error.log` | ✅ Configured |
| Admin incident log | Launch Hub / OpsIncident | ✅ |
| Structured Django LOGGING | Not configured | ❌ P2 gap |

**Sentry configuration (when DSN set):**
- Django, Celery, Redis integrations
- 10% trace sample rate
- PII scrubbing enabled
- Environment tag via `SENTRY_ENVIRONMENT`

**Gap:** No centralized log search (ELK/CloudWatch) in repo. Ops relies on SSH + `docker compose logs`.

---

## 2. Health endpoints

| Endpoint | Auth | Checks | Status |
|----------|------|--------|:------:|
| `/health/` | Public | DB + Redis | ✅ Live 200 |
| `/api/health/live/` | Public | Process liveness | ✅ Live 200 |
| `/api/health/ready/` | Public | DB + Redis (+ Celery in code) | ✅ Live 200 |
| `/api/health/status/` | Admin | Full production snapshot | ✅ Code + tests |

**Implementation:** `backend/taxi/health/views.py`  
**Tests:** `backend/taxi/health/tests/test_health.py`  
**Docker healthcheck:** Uses `/api/health/ready/` every 30s

**Admin dashboards:**

| Surface | URL |
|---------|-----|
| Production Status | https://www.yalataxi.live/admin/status |
| Launch Hub | https://www.yalataxi.live/admin/launch |
| Operations Center | https://www.yalataxi.live/admin/operations |
| Executive Dashboard | https://www.yalataxi.live/admin/executive |

---

## 3. Crash reporting

| Platform | Mechanism | Status |
|----------|-----------|:------:|
| Backend | Sentry (optional) | ⚠ Unconfirmed |
| Android Rider/Driver/Delivery | No Firebase Crashlytics in repo | ❌ P1 gap |
| Web admin | Browser console + Sentry (if frontend wired) | ⚠ |

**RC1 monitoring doc claim:** 0% 5xx at 335 concurrent requests — API stability acceptable; mobile crash reporting not instrumented.

**Recommendation:** Enable Sentry DSN on production; add Crashlytics before GA.

---

## 4. Performance monitoring

| Metric | Target | Recorded | Status |
|--------|--------|----------|:------:|
| API p95 latency | < 2000 ms | 4086 ms (pre-RC3 deploy) | ❌ UAT-D-013 |
| HTTP 5xx rate | < 0.5% | 0% @ 335 concurrent (RC1 doc) | ✅ |
| CPU / memory | Warning 75/80% | ☐ Requires SSH | ☐ |
| PG connections | Warning 180/250 | ☐ Requires SSH | ☐ |
| Celery queue depth | Warning > 100 | ☐ No Flower | ☐ |

**Gap:** No Prometheus, Grafana, or APM in repository. Performance baselines documented but not continuously measured.

**Post-RC1 deploy action:** Re-run performance smoke after UAT-D-006 deploy.

---

## 5. Alerting

| Alert type | Threshold | Routing | Status |
|------------|-----------|---------|:------:|
| `/health/` uptime | < 99% / 15m | Manual cron | ⚠ |
| HTTP 5xx | > 2% / 5m | Documented | ☐ No auto-page |
| API p95 | > 8000 ms | Documented | ☐ |
| Celery workers | 0 active | Documented | ☐ |
| Backup age | > 48h | `backup-monitor.sh` | ⚠ Script only |
| Disk | > 90% | Documented | ☐ |

### Notification procedures (documented)

| Severity | Response time | Examples |
|:--------:|:-------------:|----------|
| S1 (page immediately) | 15 min | API down > 2 min, DB unreachable, 0 Celery workers |
| S2 | 1 hour | p95 > 8s, disk > 85%, backup stale > 26h |
| S3 | Next business day | Single 429 burst |

**Gap:** No PagerDuty, Slack webhook, or SMS integration configured in repo. Alerting is **procedural**, not automated.

---

## Automated checks schedule

| Schedule | Action | Verified |
|----------|--------|:--------:|
| Every 15 min | `curl -f https://api.yalataxi.live/health/` | ✅ Live 200 today |
| 02:00 UTC | `backup-encrypted.sh` | ☐ |
| 08:00 UTC | `backup-monitor.sh` | ☐ |
| Daily | `launch-certification-prod.py` | ☐ |

---

## Gaps and recommendations

| ID | Gap | Severity | Action |
|----|-----|:--------:|--------|
| MON-001 | Sentry DSN not confirmed on prod | P1 | Verify `.env.production` |
| MON-002 | No mobile crash reporting | P1 | Crashlytics before GA |
| MON-003 | p95 exceeds target | P1 | Deploy RC3; re-benchmark |
| MON-004 | No automated paging | P1 | Slack/PagerDuty webhook |
| MON-005 | No APM / Prometheus | P2 | Post-beta roadmap |
| MON-006 | No log rotation config | P2 | Docker log limits on host |

---

## Certification statement

**Monitoring is CONDITIONALLY CERTIFIED** for closed beta with:
- Active 15-minute health cron
- Admin production status dashboards
- Documented severity procedures
- Manual ops on-call during beta hours

**NOT CERTIFIED** for unattended public launch until MON-001 through MON-004 addressed.

| Role | Status | Date |
|------|:------:|------|
| Operations | ⚠ Procedures documented | 2026-07-22 |
| Engineering | ✅ Health endpoints verified | 2026-07-22 |
| QA | ⚠ Perf re-measure pending | 2026-07-22 |

**Related:** [`PRODUCTION_CERTIFICATE.md`](./PRODUCTION_CERTIFICATE.md)
