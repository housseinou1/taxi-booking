# YALA Enterprise v1.0 — Observability & Live Diagnostics Report

**Document ID:** YALA-REL-OBS-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Release Candidate  
**Scope:** Request tracing, error tracking, business metrics, admin health dashboard, alerting  
**Rule:** No user-facing features; monitoring and operational visibility only.

---

## Executive Summary

| Area | Coverage | Score |
|------|:--------:|:-----:|
| Request tracing | **IMPROVED** | 75% |
| Error tracking | Partial | 70% |
| Business metrics | Strong | 85% |
| Admin health dashboard | **IMPROVED** | 80% |
| Alerting | Partial (in-app) | 55% |
| **Overall observability** | **CONDITIONAL PASS** | **73%** |

### Recommendation

**READY WITH CONDITIONS** — adequate for **closed beta with manual ops oversight**.

| Launch tier | Verdict |
|-------------|---------|
| Closed beta (≤25 users, staffed ops) | **READY WITH CONDITIONS** |
| Unattended public launch | **NOT READY** |

**Conditions:**

1. Deploy observability sprint changes (request tracing middleware, Celery queue metrics).
2. Confirm `SENTRY_DSN` active in production.
3. Assign on-call for Launch Hub alerts (no automated paging yet).
4. Run daily health + launch KPI review per `operations/LAUNCH_MONITORING.md`.

---

## Improvements Completed (This Sprint)

| # | Improvement | File(s) | Part |
|---|-------------|---------|------|
| 1 | **Request tracing middleware** — request ID, correlation ID, user ID, latency, status in access logs; echoes `X-Request-ID` / `X-Correlation-ID` headers | `taxi/middleware/request_tracing.py`, `taxi/logging_context.py` | 1 |
| 2 | **Structured LOGGING config** for `yala.request` and `yala.celery` loggers | `taxi/settings.py` | 1, 2 |
| 3 | **Celery task tracing** — correlation IDs + start/finish/failure logs | `taxi/celery_tracing.py`, `taxi/celery.py` | 1, 2 |
| 4 | **Celery queue depth** on readiness + admin status (pending/active/scheduled tasks) | `health/views.py` | 4 |
| 5 | **Production Status UI** — displays Celery job counts | `admin/status/ProductionStatus.js` | 4 |
| 6 | **Tests** — request tracing middleware (2 tests) + existing health tests | `tests/test_request_tracing.py` | — |

---

## Part 1 — Request Tracing

### Before sprint

| Capability | Status |
|------------|:------:|
| Request ID | ❌ |
| User ID in logs | ⚠ Ad-hoc only |
| Response time | ⚠ Partner API gateway only |
| HTTP status logging | ⚠ Partner API gateway only |
| Celery correlation | ❌ |
| Response headers | ❌ |

### After sprint

| Capability | Status | Evidence |
|------------|:------:|----------|
| Request ID | ✅ | Generated UUID or honors `X-Request-ID` |
| Correlation ID | ✅ | `X-Correlation-ID` propagated; defaults to request ID |
| User ID | ✅ | Logged when authenticated |
| Response time | ✅ | `duration_ms` in `yala.request` access log |
| HTTP status | ✅ | Logged on every non-static request |
| Celery correlation | ✅ | `yala.celery` task start/finish/failure logs |
| Response headers | ✅ | `X-Request-ID`, `X-Correlation-ID` on all responses |

**Sample access log line:**

```text
INFO yala.request request_completed method=GET path=/api/health/live/ status=200 duration_ms=12.4 user_id=- request_id=... correlation_id=...
```

**Middleware order:** After `AuthenticationMiddleware` so user ID is available.

### Remaining gaps

| Gap | Priority |
|-----|:--------:|
| HTTP → Celery correlation propagation (pass request_id in task kwargs) | P1 |
| JSON log format for log aggregation (ELK/CloudWatch) | P2 |
| OpenTelemetry / distributed tracing | P2 |
| WebSocket request IDs in consumer logs | P2 |

---

## Part 2 — Error Tracking

### Current coverage

| Failure type | Mechanism | Context quality | Status |
|--------------|-----------|-----------------|:------:|
| Unhandled Django exceptions | Sentry (prod) + stdout | ⚠ No request ID before sprint; **now in access log** | ⚠ |
| API failures (4xx/5xx) | Access log + Sentry | ✅ Path, status, duration, user_id, request_id | ✅ |
| Celery failures | Sentry + `yala.celery` logger | ✅ Task name, task_id, correlation_id | ✅ |
| WebSocket failures | `consumers.py` — 25+ send-error logs | ⚠ Ride/delivery type only | ⚠ |
| Push failures | `notifications/push.py` — `logger.exception` | ✅ Token, user via caller | ✅ |
| Payment failures | Ride capture exception; webhook warning | ⚠ Settlement/delivery payment silent | ⚠ |
| GPS failures | Abuse warnings; arrive fallback warning | ⚠ HTTP 400 rejections often unlogged | ⚠ |

### Sentry configuration

| Setting | Value |
|---------|-------|
| Backend | `SENTRY_DSN` when `DEBUG=False` |
| Integrations | Django, Celery, Redis |
| Trace sample rate | 10% (`SENTRY_TRACES_SAMPLE_RATE`) |
| PII | Disabled (`send_default_pii=False`) |
| Frontend | Optional `REACT_APP_SENTRY_DSN` via `monitoring/sentry.js` |

**Gap:** Sentry prod activation **unconfirmed**. No React ErrorBoundary. No manual `capture_exception` with request context tags.

### Audit trail (non-Sentry)

| System | File |
|--------|------|
| Security audit log | `security/services/audit_service.py` |
| Partner API logs | `api_gateway/middleware.py` → `APIGatewayLog` model |
| Launch incidents | `operations/models.py` → `LaunchAlert`, `OpsIncident` |

---

## Part 3 — Business Metrics

### Operational metrics endpoints

All under `/operations/` (staff-authenticated):

| Metric | Endpoint / service | Status |
|--------|-------------------|:------:|
| Ride requests (today) | `executive_service.build_live_metrics()` | ✅ |
| Ride acceptance rate | Ops center + launch KPIs | ✅ |
| Ride completion rate | `launch_service`, beta dashboard | ✅ |
| Delivery success rate | Ops center deliveries panel | ✅ |
| Rent collection success | N/A | ❌ Real Estate not in v1.0 |
| Active drivers | `live.active_drivers` | ✅ |
| Active couriers | `live.active_couriers` | ✅ |
| Active users (riders) | `live.active_riders` | ✅ |
| Active trips / deliveries | `live.active_trips`, `live.active_deliveries` | ✅ |
| Revenue / commission | Finance dashboard | ✅ |
| Failed payments today | Launch alerts threshold | ✅ |
| Pending withdrawals | Launch alerts threshold | ✅ |

**Primary services:**

- `backend/taxi/operations/executive_service.py` — `build_live_metrics()`
- `backend/taxi/operations/operations_center_service.py` — real-time ops
- `backend/taxi/operations/launch_service.py` — launch KPIs + alerts
- `backend/taxi/operations/beta_dashboard_service.py` — beta metrics

**Admin UI surfaces:**

- Operations Command Center — `admin/operations/OperationsCenter.js`
- Launch Hub — `admin/launch/LaunchHub.js`
- Executive Dashboard — `admin/executive/ExecutiveDashboard.js`
- Beta Dashboard — `admin/beta/BetaDashboard.js`

### Missing telemetry

| Gap | Notes |
|-----|-------|
| Prometheus `/metrics` export | Not implemented |
| APM (Datadog/New Relic) | Not implemented |
| Continuous p95 latency measurement | Manual scripts only |
| Mobile crash-free rate | Not instrumented |
| Cash collection pending KPI | Partial — task reminders only |

---

## Part 4 — Admin Health Dashboard

### Verified components

| Component | Path | Status |
|-----------|------|:------:|
| Liveness | `GET /api/health/live/` | ✅ |
| Readiness | `GET /api/health/ready/` | ✅ Live 200 |
| Production status (admin) | `GET /api/health/status/` | ✅ **Enhanced** |
| Admin UI | `/admin/status` → `ProductionStatus.js` | ✅ **Enhanced** |
| Docker healthcheck | `/api/health/ready/` every 30s | ✅ |

### Production status checks (admin-only)

| Check | Source | After sprint |
|-------|--------|:------------:|
| API | Self | ✅ |
| Database | `ensure_connection()` | ✅ |
| Redis | Cache read/write probe | ✅ |
| Celery workers | Inspector ping | ✅ |
| Celery pending jobs | Inspector `reserved()` | ✅ **New** |
| Celery active jobs | Inspector `active()` | ✅ **New** |
| Celery scheduled jobs | Inspector `scheduled()` | ✅ **New** |
| WebSocket | Inferred from Redis | ⚠ Proxy only |
| Storage usage | — | ❌ Not implemented |
| Failed jobs (historical) | — | ❌ No Flower/dead-letter UI |

**Live probe (2026-07-22):** `https://api.yalataxi.live/api/health/ready/` → `status: ok`, `database: ok`, `redis: ok`

**Note:** Celery queue metrics require deploy of this sprint's `health/views.py` changes.

---

## Part 5 — Alerting

### In-app alert rules (implemented)

Source: `operations/launch_service.py` → `sync_launch_alerts()`

| Alert type | Threshold | Severity |
|------------|-----------|:--------:|
| API offline | Health check != ok | Critical |
| Database offline | DB probe error | Critical |
| Redis offline | Redis probe error | Critical |
| Celery stopped | Workers error/unknown | High |
| Large withdrawal queue | ≥ 10 pending | High |
| Failed payments | ≥ 5 today | Medium |
| Expired documents | > 0 | Medium |
| Open SOS | > 0 | Critical |
| High cancellation rate | ≥ 35% when ≥ 10 rides today | High |

**Ops center alerts:** `operations_center_service.py` — excessive wait, driver offline mid-trip, fraud flags.

**UI:** Launch Hub → Alerts tab; Operations Command Center → Alerts panel.

### Documented thresholds (manual ops)

Source: `engineering/06_MONITORING_RUNBOOK.md`, `operations/LAUNCH_MONITORING.md`

| Signal | Warning | Critical |
|--------|---------|----------|
| Health uptime | < 99.5% / 24h | Any 5xx on `/health/` |
| API 5xx rate | > 1% / 5 min | > 5% / 5 min |
| API p95 latency | > 2000 ms | > 5000 ms |
| Celery backlog | > 50 pending | Workers = 0 |
| DB unavailable | — | Readiness 503 |
| Redis unavailable | — | Readiness 503 |
| Backup age | > 26h | `backup-monitor.sh` exit 1 |
| Crash spike | — | Sentry alert (when configured) |

### Alerting gaps

| Gap | Severity |
|-----|:--------:|
| No PagerDuty / Slack / SMS integration | **Critical** for GA |
| Launch alerts are DB + UI only — not paged | High |
| `backup-monitor.sh` exits 1 but no notification hook | High |
| Sentry alerts not configured in repo | High |
| Business metric thresholds (`BETA_SUCCESS_METRICS.md`) not auto-wired | Medium |
| No Prometheus alertmanager | Medium |

---

## Missing Telemetry Summary

| ID | Gap | Impact | v1.1 action |
|----|-----|--------|-------------|
| OBS-001 | No automated paging | Ops must watch Launch Hub | PagerDuty/Slack webhook |
| OBS-002 | Sentry prod activation unconfirmed | Blind to crashes | Verify DSN + test event |
| OBS-003 | No Prometheus/APM | No continuous latency/error rates | Add `/metrics` or APM agent |
| OBS-004 | No centralized log search | SSH + docker logs only | JSON logs → CloudWatch/ELK |
| OBS-005 | HTTP→Celery trace propagation | Cannot link API call to task | Pass correlation_id in `.delay()` |
| OBS-006 | WebSocket health is Redis proxy | False positives possible | WS probe endpoint |
| OBS-007 | Storage/disk metrics absent | Disk-full surprises | Add to production_status |
| OBS-008 | Mobile crash-free sessions | No Crashlytics | Firebase Crashlytics |
| OBS-009 | Rent collection metrics | N/A v1.0 | Real Estate post-freeze |

---

## Tests Performed

| Test | Result |
|------|:------:|
| `health.tests` — live, ready, alias | ✅ 3/3 PASS |
| `tests.test_request_tracing` — ID generation + header honor | ✅ 2/2 PASS |
| Production `/api/health/ready/` probe | ✅ HTTP 200 |
| Code audit — operations metrics endpoints | ✅ Documented |
| Code audit — Sentry, Celery, WS, push logging | ✅ Documented |
| Sentry live event | ☐ Not executed (requires prod DSN) |
| Load test under monitoring | ☐ Pending post-deploy |

---

## Launch Readiness

| Criterion | Status |
|-----------|:------:|
| Health endpoints live | ✅ |
| Admin production status page | ✅ |
| Business KPI dashboards | ✅ |
| Request access logs with IDs | ✅ (after deploy) |
| Error tracking code ready | ✅ |
| Automated alerting | ❌ |
| APM / Prometheus | ❌ |
| 24/7 unattended monitoring | ❌ |

### Final recommendation

**READY WITH CONDITIONS** for closed beta.

The platform now has **request-level tracing**, **Celery task logging**, **comprehensive business metrics dashboards**, and an **admin health page with queue depth**. It lacks **automated paging**, **APM**, and **confirmed Sentry production activation** — acceptable for a supervised beta with ≤25 users and staffed ops, **not** for public GA.

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| `release/MONITORING_CERTIFICATION.md` | Prior monitoring audit (69%) |
| `release/PRODUCTION_HARDENING_REPORT.md` | API/security context |
| `engineering/06_MONITORING_RUNBOOK.md` | Ops thresholds |
| `operations/LAUNCH_MONITORING.md` | Launch day monitoring |
| `operations/PRODUCTION_RUNBOOK.md` | Incident response |
| `release/BETA_SUCCESS_METRICS.md` | Beta success criteria |

---

## Sign-Off

| Role | Status | Date |
|------|:------:|------|
| Engineering (observability sprint) | ✅ Complete | 2026-07-22 |
| Ops (Sentry + paging setup) | ☐ Pending | |
| CEO (monitoring sign-off) | ☐ Pending | |

**Deploy note:** Request tracing middleware and Celery queue metrics require backend deploy to production before they are live.
