# YALA Enterprise v1.0 — RC3 Performance Report

**Document ID:** RC3-PERF-001  
**Date:** 2026-07-22  
**Environment:** Production API (partial) + RC3 source analysis  
**Target:** p95 < 2000 ms (Gate B)  
**Status:** **PARTIAL — full load test pending credentials + RC3 deploy**

---

## Executive summary

| Metric | Baseline (RC2) | Measured today | Target | Status |
|--------|:--------------:|:--------------:|:------:|:------:|
| Health endpoint p95 | — | **1729 ms** | < 500 ms | ⚠ |
| Health endpoint avg | — | **349 ms** | — | ✅ |
| Admin dashboard p95 | **4086 ms** | Not re-run | < 2000 ms | ☐ Pending |
| HTTP 5xx under load | 0 | 0 (health probe) | 0 | ✅ |
| WebSocket stability | — | Not measured | Stable | ☐ Pending |

**Verdict:** RC3 optimizations are in source but **not deployed to production**. Full certification requires post-deploy `launch-perf-smoke.py` run.

---

## 1. API latency

### 1.1 Health readiness probe (production)

**Method:** 20 sequential `GET /api/health/ready/` requests from validation workstation.

| Statistic | Value |
|-----------|------:|
| Samples | 20 |
| Errors | 0 |
| Min | 159 ms |
| Average | 349 ms |
| **p95** | **1729 ms** |
| Max | 1729 ms |

**Note:** Single-threaded probe; not comparable to concurrent load test. High p95 likely cold-path + geographic latency.

### 1.2 Admin dashboard load (RC2 baseline)

Source: `launch_perf_metrics` / [RC3_STABILIZATION_REPORT.md](./RC3_STABILIZATION_REPORT.md)

| Percentile | RC2 recorded | RC3 target |
|------------|:------------:|:----------:|
| p50 | 926 ms | — |
| **p95** | **4086 ms** | **< 2000 ms** |
| p99 | — | — |

### 1.3 RC3 fixes (source — deploy pending)

| Fix | Expected impact |
|-----|-----------------|
| 45s Redis cache on ops dashboards | ~90% faster on cache hit |
| N+1 removal (AI ops, dispatch, charts) | 60–120 fewer queries per dashboard load |
| DB indexes (`payments/0020`, `drivers/0023`) | Faster finance/fleet queue scans |

**Deploy command:**
```bash
python manage.py migrate payments 0020
python manage.py migrate drivers 0023
# + all Phase 29–39 migrations
```

### 1.4 Full load test (pending)

```bash
export YALA_ADMIN_EMAIL=...
export YALA_ADMIN_PASSWORD=...
python scripts/launch-perf-smoke.py
```

150 concurrent requests (100× `/health/`, 50× `/operations/executive/dashboard/`). Requires admin credentials and post-RC3 deploy.

---

## 2. Database response

| Check | Status | Notes |
|-------|:------:|-------|
| Production DB reachable | ✅ | Via health endpoint `database: ok` |
| Query profiling on staging | ☐ | Blocked — no staging |
| RC3 indexes applied (prod) | ☐ | Migrations pending |
| Connection pool (PgBouncer) | ❌ | P2 — not in v1.0 |

---

## 3. Page load times (frontend)

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Success (2026-07-22) |
| Production CDN/nginx | ☐ Not measured this session |
| Admin dashboard TTI | ☐ Requires browser profiling post-deploy |

**Build output:** Standard CRA chunks; largest route bundles unchanged from prior builds.

---

## 4. Memory & CPU

| Resource | Measured | Source |
|----------|:--------:|--------|
| Server RAM headroom | ~1.5 GiB | Prior infra audit (P2) |
| CPU under load | ☐ | Requires `launch-load-test-phase16.py` on server |
| Celery worker memory | ☐ | Requires Flower or `docker stats` on prod |
| Django replica count | 2 | docker-compose.yml |

**Recommendation:** Run `docker stats` during perf smoke on production host after RC3 deploy.

---

## 5. WebSocket stability

| Check | Status |
|-------|:------:|
| Redis channels backend | ✅ Prod health shows redis ok |
| WS connect/disconnect soak test | ☐ Not run |
| Ride broadcast under load | ☐ Not run |

WebSocket depends on Redis; production Redis reported healthy. Formal soak test deferred to staging QA.

---

## 6. Release blockers

| ID | Severity | Issue | Resolution |
|----|:--------:|-------|------------|
| RB-P0-008 | **P0** | p95 not re-measured post-RC3 | Deploy RC3; run perf smoke |
| RB-P0-002 | **P0** | RC3 perf fixes not in prod | Deploy backend |
| RB-P0-004 | **P0** | No staging for safe load test | Provision staging first |

---

## 7. Recommendations

1. Deploy RC3 backend + migrations to staging
2. Run `launch-perf-smoke.py` on staging; confirm p95 < 2000 ms
3. Repeat on production during low-traffic window
4. Update `launch_perf_metrics` PlatformSetting with new values
5. Monitor Celery queue depth during load test

---

## Sign-off

| Role | Status | Date |
|------|:------:|------|
| Performance validation | ⚠ Partial | 2026-07-22 |
| QA sign-off | ☐ Pending | |
