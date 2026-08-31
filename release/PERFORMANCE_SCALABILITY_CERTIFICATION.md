# YALA Enterprise v1.0 — Performance & Scalability Certification

**Document ID:** YALA-REL-PERF-SCALE-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Release Candidate  
**Environment:** Production API `https://api.yalataxi.live`  
**Target gate:** p95 < 2000 ms (Gate B) · 0% HTTP 5xx under launch concurrency  
**Rule:** Evidence-based; no feature additions.

---

## Executive Summary

| Phase | Status | Evidence |
|-------|:------:|----------|
| 1 — API load testing | **PARTIAL** | Public endpoints benchmarked; auth/ride flows require credentials |
| 2 — Database stress | **REVIEW ONLY** | Index/migration analysis; no prod query profiling |
| 3 — WebSocket stability | **NOT EXECUTED** | Architecture reviewed; no soak test |
| 4 — Background jobs | **PARTIAL** | Celery health probe; no queue stress test |
| 5 — Resource utilization | **NOT EXECUTED** | Requires server-side `docker stats` during load |
| 6 — Certification | **COMPLETE** | This document |

### Final Recommendation

**READY WITH CONDITIONS** — approve **closed beta (≤25 supervised users)** only.

| Launch tier | Verdict |
|-------------|---------|
| Closed beta | **READY WITH CONDITIONS** |
| Public production (GA) | **NOT READY** |

**Conditions:**

1. Deploy RC3 performance fixes + DB migrations to production.
2. Re-run dashboard load test post-deploy; confirm p95 < 2000 ms.
3. Run ride/delivery authenticated load test on staging or low-traffic window.
4. Execute WebSocket soak test (100+ connections) before cohort >25.
5. Capture `docker stats` during load test for resource baseline.

---

## Tests Performed

| Test | Tool | When | Result |
|------|------|------|:------:|
| Concurrent public API load | `scripts/perf-certification-benchmark.py` | 2026-07-22 | ✅ 0% 5xx |
| Sequential health probe | PowerShell × 150 | 2026-07-22 | ✅ p95 332 ms |
| Production readiness | `GET /api/health/ready/` | 2026-07-22 | ✅ 200, DB+Redis ok |
| RC2 dashboard baseline | Historical `launch_perf_metrics` | RC2 | ❌ p95 4086 ms |
| Ride/login/payment load | — | — | ☐ Not run (auth required) |
| WebSocket storm | — | — | ☐ Not run |
| Celery queue stress | — | — | ☐ Not run |
| Server CPU/RAM during load | — | — | ☐ Not run |

**Benchmark script added:** `scripts/perf-certification-benchmark.py` (SSL fallback for Windows/Python 3.15 cert chain issues).

---

## Phase 1 — API Load Testing

### Method

- **API:** `https://api.yalataxi.live`
- **Concurrency:** 30 worker threads (`CERT_WORKERS=30`)
- **Duration:** Wall-clock ~12 s total for all suites
- **Workstation:** Validation host (geographic latency to DigitalOcean ~200–600 ms baseline)

### Results — concurrent load (2026-07-22)

| Endpoint | Samples | Success | Error rate | Avg (ms) | p50 (ms) | **p95 (ms)** | p99 (ms) | Throughput |
|----------|--------:|--------:|-----------:|---------:|---------:|-------------:|---------:|-----------:|
| `/health/` | 150 | 150 | **0%** | 690.2 | 644.6 | **1066.8** | 1181.1 | 41.1 rps |
| `/api/health/ready/` | 150 | 150 | **0%** | 618.5 | 599.6 | **876.6** | 904.2 | 45.0 rps |
| `/api/health/live/` | 50 | 50 | **0%** | 457.5 | 447.1 | **555.0** | 562.8 | 52.4 rps |
| `/cities/` (public) | 30 | 30 | **0%** | 1855.5 | 1930.5 | **2166.0** | 2167.0 | 13.6 rps |

**Gate evaluation (public endpoints):**

| Gate | Target | Measured | Status |
|------|--------|----------|:------:|
| HTTP 5xx under load | 0 | **0** | ✅ PASS |
| Health ready p95 | < 2000 ms | **876.6 ms** | ✅ PASS |
| Cities list p95 | < 2000 ms | **2166.0 ms** | ⚠ MARGINAL (+8%) |

### Results — sequential probe (comparison)

| Endpoint | Samples | p50 | p95 | p99 |
|----------|--------:|----:|----:|----:|
| `/api/health/ready/` | 150 (sequential) | 204 ms | **332 ms** | 427 ms |

Sequential p95 is much lower than concurrent p95 — expected under single-threaded vs 30-thread load.

### Endpoints NOT benchmarked (requires authenticated workflow)

| Endpoint | Reason |
|----------|--------|
| Login | Credentials not injected in certification run (use `YALA_ADMIN_EMAIL` / `LOAD_AUTH_TOKEN`) |
| Ride request / accept / complete | Requires rider + driver JWT + paired state machine |
| Delivery creation | Requires courier + customer tokens |
| Payment APIs | Requires active ride/delivery context |
| Dashboard APIs | Requires admin JWT (`/operations/center/dashboard/`, etc.) |

**Historical RC2 dashboard baseline (pre-RC3 deploy):**

| Endpoint | p50 | **p95** | Gate |
|----------|----:|--------:|------|
| `/operations/executive/dashboard/` | 926 ms | **4086 ms** | ❌ FAIL (< 2000 ms) |

Source: `launch_perf_metrics` · `release/RC3_STABILIZATION_REPORT.md`

RC3 source fixes (45s Redis cache, N+1 removal, 6 new indexes) are **not yet deployed to production** — dashboard p95 improvement is **projected, not measured**.

---

## Phase 2 — Database Stress Test

### Configuration (verified in source)

| Setting | Value | File |
|---------|-------|------|
| Connection pooling | `conn_max_age=600` | `taxi/settings.py` |
| RC3 indexes | 6 additive indexes | `payments/0020`, `drivers/0023` |
| Transaction locking | `select_for_update` on rides, wallets, withdrawals | rides/payments views |

### Index coverage

| Domain | Status |
|--------|:------:|
| Rides, deliveries, drivers, payments | ✅ Strong (RC3 stabilization) |
| Merchants, intercity, promotions, notifications | ⚠ Missing composite indexes |

### Stress test execution

| Check | Executed | Result |
|-------|:--------:|--------|
| Slow query log under load | ❌ | Requires `pg_stat_statements` on prod |
| Lock contention | ❌ | Requires concurrent ride acceptance sim |
| Connection pool saturation | ❌ | Requires pgbouncer/stats |
| Migration drift | ✅ | `makemigrations --check` → no changes |

### Optimization actions (RC3 — in source, deploy pending)

| Action | Before (RC2) | After (projected) | Evidence |
|--------|--------------|-------------------|----------|
| Ops dashboard Redis cache (45s TTL) | Cold build every poll | ~90% faster on cache hit | `operations/cache_utils.py` |
| N+1 removal (AI ops, dispatch) | 60–120 extra queries/load | Batch prefetch | RC3 report |
| Payment/driver indexes | Full scans on queues | Index scans | Migrations 0020/0023 |
| Executive dashboard p95 | **4086 ms** | **< 2000 ms (target)** | ☐ **Not measured post-deploy** |

**No database schema changes made during this certification sprint.**

---

## Phase 3 — WebSocket Stability

### Architecture (code review)

| Component | Implementation |
|-----------|----------------|
| Backend | Django Channels + Redis layer |
| Driver (prod) | `frontend/src/socket.js` — backoff, URL failover, pending message buffer |
| Rider | `frontend/src/rider/services/wsService.js` — reconnect + ride group re-join |
| Delivery | `useDeliveryCourierRealtime.js`, `deliverySocket.js` |
| Dedup | Driver: 4s window `{source}:{type}:{rideId}` |

### Stress tests

| Scenario | Status |
|----------|:------:|
| 100+ concurrent driver connections | ☐ Not executed |
| Rider update fan-out under load | ☐ Not executed |
| Delivery update fan-out | ☐ Not executed |
| Disconnect/reconnect storm | ☐ Not executed |

**Dependency:** WebSocket health inferred from Redis status (`health/views.py`). Production Redis: **ok**.

**Risk:** Channel layer capacity under 100+ simultaneous drivers not validated for closed beta scale (≤25 users ≈ ≤10 concurrent drivers estimated).

---

## Phase 4 — Background Jobs

### Celery configuration

| Setting | Value |
|---------|-------|
| Broker | Redis (`CELERY_BROKER_URL`) |
| Beat tasks | Credit expiry, delivery timeouts, academy, referrals (see `settings.py`) |
| Health probe | Inspector ping, 2s timeout |
| Queue metrics (post observability sprint) | pending/active/scheduled task counts on `/api/health/status/` |

### Stress tests

| Scenario | Status |
|----------|:------:|
| Notification job burst | ☐ Not executed |
| Report generation under load | ☐ Not executed |
| Scheduled task latency | ☐ Not executed |
| Queue backlog under API load | ☐ Not executed |

**Production Celery status:** Reported **ok** via readiness (worker count not in current prod JSON — deploy pending for queue depth fields).

---

## Phase 5 — Resource Utilization

| Resource | Measured | Source |
|----------|:--------:|--------|
| CPU under load | ❌ | Requires `docker stats` on host during benchmark |
| RAM | ❌ | Prior infra audit ~1.5 GiB headroom (static) |
| Disk I/O | ❌ | Not measured |
| Network | ❌ | Not measured |
| Redis memory | ❌ | Not measured |
| PostgreSQL memory | ❌ | Not measured |

**Recommendation:** During post-RC3 deploy load test, run on production host:

```bash
docker stats --no-stream
redis-cli INFO memory
```

---

## Performance Summary

| Metric | RC2 baseline | Today (public load) | Target | Status |
|--------|:------------:|:-------------------:|:------:|:------:|
| Health ready p95 (concurrent) | — | **876.6 ms** | < 2000 ms | ✅ |
| Health ready p95 (sequential) | 1729 ms* | **332 ms** | < 500 ms ideal | ⚠ |
| Dashboard p95 | **4086 ms** | Not re-run | < 2000 ms | ❌ |
| HTTP 5xx under load | 0 | **0** | 0 | ✅ |
| Cities list p95 | — | **2166 ms** | < 2000 ms | ⚠ |
| Throughput (health ready) | — | **45 rps** | — | ✅ |

*Earlier single-threaded session; geographic variance applies.

---

## Scalability Observations

1. **Public read endpoints** sustain 30 concurrent workers with **zero 5xx** at ~45 rps — adequate for closed beta traffic.
2. **Unpaginated public lists** (`/cities/`) show p95 **2166 ms** under modest concurrency — marginal gate failure; pagination would help at scale.
3. **Admin dashboards** were the RC2 bottleneck (p95 4086 ms); RC3 cache + query fixes address root cause but **require deploy validation**.
4. **Horizontal scaling:** `docker-compose.yml` documents 2 Django replicas; Redis-backed cache/channels support multi-instance.
5. **Closed beta scale (≤25 users):** Estimated peak ~5–10 concurrent API requests — **within measured capacity**.

---

## Bottlenecks

| ID | Bottleneck | Severity | Affected |
|----|------------|----------|----------|
| PERF-B01 | RC3 perf fixes not deployed to production | **Critical** | Dashboard APIs |
| PERF-B02 | Dashboard p95 was 4086 ms (RC2); unverified post-fix | **Critical** | Admin ops |
| PERF-B03 | `/cities/` unpaginated — p95 2166 ms under load | **Medium** | Public API |
| PERF-B04 | No WebSocket soak test | **High** | Real-time rides/delivery |
| PERF-B05 | No Celery queue stress test | **Medium** | Notifications, timeouts |
| PERF-B06 | Ride/delivery write paths not load-tested | **High** | Core transactions |
| PERF-B07 | No server resource profiling during load | **Medium** | Capacity planning |
| PERF-B08 | No staging environment for safe full load test | **High** | Certification completeness |

---

## Optimization Actions Taken

| # | Action | Type | Before → After |
|---|--------|------|----------------|
| 1 | Created `scripts/perf-certification-benchmark.py` | Tooling | No benchmark script → repeatable public load test |
| 2 | SSL cert fallback in benchmark (Windows/Python 3.15) | Tooling | 100% network errors → valid measurements |
| 3 | RC3 dashboard cache + N+1 fixes (prior sprint) | Code | p95 4086 ms → **projected** < 2000 ms (deploy pending) |
| 4 | RC3 DB indexes (prior sprint) | Migration | Full scans → index scans (deploy pending) |
| 5 | Request tracing middleware (observability sprint) | Overhead | Negligible; enables latency debugging |

**No new performance optimizations applied in this certification sprint** — measurement and documentation only.

---

## Remaining Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dashboard slow under admin polling | Ops UI unusable at scale | Deploy RC3; verify p95 |
| Write path latency unknown | Ride booking may fail under spike | Staging load test with smoke harness |
| WebSocket fan-out untested | Missed offers under load | Soak test before scale |
| Cities endpoint marginal p95 | Slow app cold start | Default pagination (v1.1) |
| No autoscaling metrics | Surprise resource exhaustion | `docker stats` baseline |

---

## Certification Checklist

| Criterion | Closed beta | Public GA |
|-----------|:-----------:|:---------:|
| 0% 5xx on public load test | ✅ | ✅ |
| Health p95 < 2000 ms | ✅ | ✅ |
| Dashboard p95 < 2000 ms | ☐ Pending deploy | ❌ |
| Ride flow load tested | ☐ | ❌ |
| WebSocket soak test | ☐ | ❌ |
| Celery stress test | ☐ | ❌ |
| Resource baseline captured | ☐ | ❌ |

---

## Post-Deploy Validation Plan

```bash
# 1. Public load (no credentials)
python scripts/perf-certification-benchmark.py

# 2. Dashboard load (requires admin token)
export LOAD_AUTH_TOKEN=<admin-jwt>
python scripts/launch-load-test-phase16.py

# 3. Full smoke (ride + delivery)
python scripts/platform-rc1-smoke.py

# 4. Server resources during step 2
docker stats --no-stream
```

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| `release/PERFORMANCE_REPORT.md` | RC3 partial report |
| `release/RC3_STABILIZATION_REPORT.md` | Optimization details |
| `release/PRODUCTION_HARDENING_REPORT.md` | DB/index audit |
| `release/OBSERVABILITY_REPORT.md` | Request tracing |
| `scripts/launch-load-test-phase16.py` | Full load test harness |
| `release/BETA_SUCCESS_METRICS.md` | Beta performance targets |

---

## Sign-Off

| Role | Status | Date |
|------|:------:|------|
| Performance certification (public load) | ✅ Complete | 2026-07-22 |
| Dashboard re-benchmark post-RC3 deploy | ☐ Pending | |
| WebSocket / Celery stress | ☐ Pending | |
| CEO sign-off | ☐ Pending | |

**Final recommendation: READY WITH CONDITIONS for closed beta. NOT READY for public production.**
