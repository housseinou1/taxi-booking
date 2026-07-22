# YALA Enterprise v1.0 — Pilot Metrics

**Document ID:** PILOT-METRICS-001  
**Date:** 2026-07-22  
**Period:** Platform lifetime + pilot validation day  
**Source:** Production API (`/operations/launch/kpis/`, smoke tests, health probes)  
**Note:** Metrics include QA/smoke activity — isolate pilot cohort data after real users onboard

---

## Collection method

| Metric | Source | Collected |
|--------|--------|:---------:|
| Ride/delivery counts | `GET /operations/launch/kpis/` | ✅ 2026-07-22 13:10 UTC |
| API uptime | Health probes + smoke | ✅ |
| Response time | 10× `/api/health/ready/` samples | ✅ |
| Failed transactions | `/payments/admin/dashboard/` | ✅ |
| Crash-free sessions | — | ❌ Not instrumented |
| Push delivery rate | — | ❌ Not measured |

---

## Platform KPIs (production — observed)

**Snapshot:** `generated_at: 2026-07-22T13:10:24Z`

### User activity

| Metric | Value |
|--------|------:|
| DAU | 1 |
| WAU | 6 |
| MAU | 6 |

### Ride metrics

| Metric | Value | Beta target | Status |
|--------|------:|:-----------:|:------:|
| Ride requests (history sample) | 46 total in admin history | — | — |
| Completed rides (history sample) | 17 | — | — |
| **Completion rate (platform)** | **37.0%** | >95% | 🔴 |
| **Cancellation rate** | **60.9%** | <20% | 🔴 |
| Acceptance rate (admin) | 91.0% | ≥70% | 🟢 |
| Average trip value | 420.18 MRU | — | — |

**Context:** High cancellation rate driven by QA smoke tests leaving rides in `driver_arriving` and automated cleanup. **Not representative of real user behavior.** Re-measure after pilot cohort onboarded with QA accounts excluded.

### Delivery metrics

| Metric | Value | Beta target | Status |
|--------|------:|:-----------:|:------:|
| Deliveries in history sample | 16 | — | — |
| Delivered (sample) | 10 | — | — |
| Delivery completion (sample) | 62.5% | >95% | 🔴 |
| Average delivery value | 179.65 MRU | — | — |
| Delivery request (smoke today) | **FAIL** HTTP 400 | — | 🔴 |

### Daily activity (14-day growth chart)

| Date | Completed rides | Completed deliveries | Active users |
|------|:---------------:|:--------------------:|:------------:|
| 2026-07-09 | 0 | 1 | 1 |
| 2026-07-10 | 1 | 2 | 1 |
| 2026-07-13 | 6 | 0 | 1 |
| 2026-07-21 | 3 | 1 | 6 |
| 2026-07-22 | 0 | 0 | 1 |

---

## Pilot validation day (2026-07-22)

| Event | Count |
|-------|------:|
| Smoke ride requests | 1 (ride 114) |
| Smoke ride accepts | 1 |
| Smoke ride completes | 0 |
| Smoke delivery requests | 0 (failed) |
| Smoke API checks | 40 (34 PASS) |

---

## Infrastructure metrics

### API uptime

| Probe | Result | Time |
|-------|:------:|------|
| `/health/` | 200 OK | 13:08 UTC |
| `/api/health/ready/` | 200 OK, DB+Redis ok | 13:08–13:10 UTC |
| Smoke stability | 0× HTTP 5xx | 13:08 UTC |

**Uptime during validation window:** **100%** (limited sample — ~30 min active testing)

### Average response time

| Endpoint | Samples | Min | Avg | p95 |
|----------|:-------:|----:|----:|----:|
| `/api/health/ready/` | 10 | 426 ms | **490 ms** | **533 ms** |

**Target:** p95 < 2000 ms for admin dashboards (not measured today); health p95 within acceptable range for pilot.

---

## Finance metrics (production)

| Metric | Value (MRU) |
|--------|------------:|
| Gross revenue | 1,219.86 |
| Platform commission | 243.98 |
| Driver earnings | 4,790.20 |
| Courier earnings | 975.88 |
| Wallet balance (platform) | 1,151.12 |
| Failed payments | **0** |
| Refund requests | **0** |
| Pending payouts | 0 |

---

## Crash-free sessions

| Metric | Value |
|--------|-------|
| Crash reporting | ❌ Not configured |
| Crash-free rate | **Unknown** |
| Sessions tracked | 0 (no analytics SDK) |

**Action:** Enable Crashlytics or Sentry mobile before pilot scale (PILOT-015).

---

## Push notification delivery

| Metric | Value |
|--------|-------|
| Messages sent (pilot period) | Not measured |
| Delivery rate | **Unknown** |
| FCM token registration | Wired in app; not validated |

---

## Failed transactions

| Type | Count | Source |
|------|------:|--------|
| Failed payments | 0 | `/payments/admin/dashboard/` |
| Smoke delivery payment | N/A | Request failed before payment |
| Smoke ride payment | 0 failures | Status: authorized |

---

## Metrics vs beta targets (`BETA_SUCCESS_METRICS.md`)

| Metric | Target | Observed | Status |
|--------|:------:|:--------:|:------:|
| Driver acceptance | ≥70% | 91.0% | 🟢 |
| Ride completion | >95% | 37.0%* | 🔴 |
| Delivery completion | >95% | 62.5%* | 🔴 |
| Cancellation rate | <20% | 60.9%* | 🔴 |
| API uptime | >99% | 100%† | 🟢 |
| Failed payments | 0 | 0 | 🟢 |
| p95 latency (health) | <2000 ms | 533 ms | 🟢 |

\*Inflated by QA/smoke activity — re-measure with pilot cohort  
†Short validation window only

---

## Next collection cadence

| Schedule | Action |
|----------|--------|
| Daily | Export `/operations/launch/kpis/` |
| Daily | `scripts/soft-launch-daily-reports.sh` |
| Post-smoke | Cancel stale QA rides before metrics pull |
| Weekly | Pilot review against `BETA_SUCCESS_METRICS.md` |

---

## Related

- [PILOT_GO_LIVE_DECISION.md](./PILOT_GO_LIVE_DECISION.md)
- [BETA_SUCCESS_METRICS.md](./BETA_SUCCESS_METRICS.md)
- [PILOT_ISSUES.md](./PILOT_ISSUES.md)
