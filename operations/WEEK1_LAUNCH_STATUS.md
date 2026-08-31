# YALA Enterprise v1.0 — Week 1 Launch Operations Status

**Document ID:** YALA-OPS-WEEK1-001  
**Date:** 2026-07-22  
**Sprint:** Launch Operations (Mobility live operations)  
**Environment:** Production `https://api.yalataxi.live` · Admin `https://www.yalataxi.live`  
**Rule:** Evidence-based; no new features; operational defects only.

---

## Executive Summary

| Item | Status |
|------|--------|
| **Operational readiness score** | **72 / 100** |
| **GO / HOLD recommendation** | **GO — closed beta only** |
| **Public commercial release** | **HOLD** |

YALA Mobility core ride platform is **functionally ready for supervised daily commercial operation** at closed-beta scale (≤25 users, ≤20 drivers). Critical ride, dispatch, cancellation, earnings, and support intake flows are implemented and tested. Gaps remain in admin tooling (refund approval UI, lost-property queue), monitoring automation (no paging, Sentry unconfirmed), and production deployment of RC3 performance fixes.

**One operational defect fixed this sprint:** admin driver rejection now sends the required rejection reason to the API (`frontend/src/admin/DriverVerification.js`).

---

## Production Snapshot (2026-07-22)

| Probe | Result | Evidence |
|-------|--------|----------|
| `GET /api/health/ready/` | **200 OK** | `database: ok`, `redis: ok`, latency **846 ms** (single request) |
| Concurrent public load (30 workers) | **0% 5xx** | `scripts/perf-certification-benchmark.py` — health ready p95 **877 ms** |
| Automated cert script (Windows) | SSL verify fail | `launch-certification-prod.py` — Python 3.15 cert chain; use PowerShell or SSL fallback script |
| Admin authenticated probes | Skipped | `YALA_ADMIN_EMAIL` / `LOAD_AUTH_TOKEN` not set in cert run |

---

## Module 1 — Driver Operations

| Capability | Status | Evidence |
|------------|:------:|----------|
| Driver onboarding (register → phone → docs) | ✅ | `DriverSignup.js`, `DriverDocuments.js`, `views_documents.py`, `document_service.py` |
| Admin approval workflow | ⚠ | `approve_driver` / `reject_driver` in `drivers/views.py`; **reject UI fixed** this sprint |
| Suspension / reactivation | ⚠ | Fragmented: fleet suspend, executive action, reject/reintegrate — no unified `suspended` status |
| Document expiry notifications | ✅ | Celery beat daily `notify_expiring_driver_documents_task`; push dedup via `NotificationHistory` |
| Online/offline reliability | ⚠ | `toggle_availability` gates docs/legal/approval; no stale-online cleanup on crash |
| Earnings accuracy | ✅ | `earnings_service.py`, `calculate_payment_amounts`, withdrawal OTP flow — 234+ payment tests |

### Tests

| Area | Coverage |
|------|----------|
| Documents | `test_document_views.py`, `test_document_service.py` |
| Availability | `test_availability.py`, `test_smart_dispatch.py` |
| Earnings / withdrawals | `test_earnings_service.py`, `test_driver_withdrawal_production.py` |
| Fleet suspend | `test_fleet_performance.py` |

### Open issues (driver ops)

| ID | Issue | Severity |
|----|-------|----------|
| DRV-01 | Dual onboarding paths (legacy `register_driver` vs Document Center) | Medium |
| DRV-02 | `account_under_review` drivers can go online but receive no rides | High |
| DRV-03 | Document expiry push-only — no email fallback | Medium |
| DRV-04 | No stale-online Celery sweep after app crash | Medium |
| DRV-05 | Beta cap (20 drivers) is dashboard-only, not enforced at approve | Low |

**Module score: 74 / 100**

---

## Module 2 — Ride Operations

| Capability | Status | Evidence |
|------------|:------:|----------|
| Ride assignment (smart dispatch) | ✅ | `ride_assignment_service.py` — expanding radius, 30s offer timeout |
| No duplicate assignments | ✅ | `select_for_update` on accept; `test_only_one_driver_can_accept` |
| Ride cancellation (rider/driver/admin) | ✅ | `cancel_ride`, no-show gates, fee rules — `test_no_show_cancel.py` |
| GPS accuracy / validation | ⚠ | Geofence on arrive/no-show; implausible movement filter; fallback coords risk |
| ETA calculation | ⚠ | OSRM pre-book; dispatch uses 28 km/h; live ETA client-side only |
| Completed ride reconciliation | ⚠ | `complete_ride` + `capture_ride_payment`; capture failure tolerated |

### Tests

| Area | Coverage |
|------|----------|
| Dispatch | `test_smart_dispatch.py`, `test_ride_timeout.py` |
| Cancellation | `test_no_show_cancel.py`, `test_step2_driver_cancellation_performance.py` |
| Completion | `rides/tests.py`, `test_waiting_fee.py`, `test_arrived.py` |

### Open issues (ride ops)

| ID | Issue | Severity |
|----|-------|----------|
| RIDE-01 | No idempotency keys on request/accept/complete POSTs | High |
| RIDE-02 | `cancel_ride` / `complete_ride` lack `select_for_update` | Medium |
| RIDE-03 | No server-persisted live ETA on `Ride` model | Medium |
| RIDE-04 | GPS fallback default coords can pollute dispatch | Medium |
| RIDE-05 | Payment capture errors swallowed on complete | Medium |

**Module score: 78 / 100**

---

## Module 3 — Customer Support

Per sprint rules: **no new features built** — audit of existing tooling only.

| Tool | Status | Where |
|------|:------:|-------|
| Cancelled rides | ⚠ Partial | Admin force-cancel (`AdminDashboard.js`, `OperationsCenter.js`); no support-case workflow |
| Lost property | ⚠ Partial | Rider/driver intake (`SupportCenter.js`); backend `LostItem` API; **no admin UI** |
| Refund requests | ⚠ Partial | Backend `RefundRequest` + approve/reject API; metrics in Executive/CEO; **no admin approve UI** |
| Driver/rider complaints | ✅ | `BetaFeedbackCenter.js` (`/admin/support`), `SupportReportForm.js`, Trust & Safety profiles |
| Fraud reports | ⚠ Partial | `SecurityAdminPanel.js` fraud tab; not in main admin nav; metrics in Executive/CEO |

### Support routing (ops reference)

| Case type | Primary tool | Escalation |
|-----------|--------------|------------|
| Ride complaint | `/admin/support` → BetaFeedbackCenter | Trust & Safety `/admin/trust-safety` |
| Payment dispute | Support queue + Finance `/admin/finance` | Manual refund via Django admin or API |
| Lost item | Support form (category `other`) | Manual follow-up — no dedicated queue |
| Fraud flag | SecurityAdminPanel (delivery context) | Executive dashboard fraud panel |
| Force cancel | Operations Center Trips tab | — |

**Module score: 65 / 100** — support intake exists; resolution workflows incomplete for refunds and lost property.

---

## Module 4 — Daily Operations Dashboards

| Metric | Available | Primary dashboard |
|--------|:---------:|-------------------|
| Today's rides | ✅ (inconsistent: total vs completed) | Executive, Launch Hub, Beta, CEO Master |
| Active drivers | ✅ | Executive (`live.active_drivers`), CEO Master |
| Online drivers | ✅ | Operations Center Fleet tab, Launch Hub, Beta |
| Cancelled rides | ⚠ Rate only | Analytics (30d), Beta (7d); **no today-count on core daily views** |
| Revenue | ✅ | Executive, Launch Hub, Beta, CEO Master, Finance |
| Peak hours | ⚠ Partial | Analytics/BI only — not on live ops dashboards |
| Failed trips | ❌ Missing | Proxy: failed **payments** in Launch Hub / Command Center |

### Recommended daily ops routine

| Time | Action | Tool |
|------|--------|------|
| 08:00 | System health check | `/admin/status` · `GET /api/health/ready/` |
| 08:15 | Review overnight alerts | Launch Hub `/admin/launch` |
| 09:00 | Fleet snapshot | Operations Center `/admin/operations` |
| Ongoing | Support queue triage | Beta Feedback `/admin/support` |
| 18:00 | Day summary | Executive `/admin/executive` or CEO Master `/admin/ceo-master` |

**Module score: 73 / 100**

---

## Module 5 — Production Monitoring

| Component | Status | Evidence |
|-----------|:------:|----------|
| API uptime | ✅ | `/health/`, `/api/health/live/`, `/api/health/ready/` — DB + Redis probed |
| Database health | ✅ | Readiness returns `database: ok` (2026-07-22) |
| Redis | ✅ | Readiness returns `redis: ok` |
| Celery | ⚠ | Worker ping + queue counts on `/api/health/status/` (admin); no Flower |
| WebSockets | ⚠ | Health inferred from Redis — no WS handshake probe |
| Request tracing | ✅ | `RequestTracingMiddleware` — `X-Request-ID`, latency logs |
| Error logs | ⚠ | Console stdout; optional Sentry (`SENTRY_DSN`) — **prod activation unconfirmed** |
| Crash logs (mobile) | ❌ | No Crashlytics; manual beta feedback only |
| Backups | ⚠ | Local encrypted daily; **offsite not configured** (P0-002) |
| Alerts | ⚠ | Launch Hub in-app alerts; **no PagerDuty/Slack/SMS** |

### Monitoring tools

| Surface | URL |
|---------|-----|
| Production Status | `https://www.yalataxi.live/admin/status` |
| Launch Hub | `https://www.yalataxi.live/admin/launch` |
| Operations Center | `https://www.yalataxi.live/admin/operations` |
| Daily cert script | `python scripts/launch-certification-prod.py` |
| E2E smoke | `python scripts/platform-rc1-smoke.py` |

**Module score: 68 / 100**

---

## Operational Readiness Score

| Module | Weight | Score | Weighted |
|--------|:------:|:-----:|:--------:|
| Driver operations | 20% | 74 | 14.8 |
| Ride operations | 25% | 78 | 19.5 |
| Customer support | 15% | 65 | 9.8 |
| Daily ops dashboards | 15% | 73 | 11.0 |
| Production monitoring | 25% | 68 | 17.0 |
| **Total** | **100%** | | **72.1 → 72** |

---

## Completed Work (This Sprint)

| # | Item | Type |
|---|------|------|
| 1 | Operational audit across 5 modules | Assessment |
| 2 | Production health probe — DB + Redis OK | Evidence |
| 3 | Fixed admin driver reject workflow (reason required by API) | **Defect fix** |
| 4 | Documented support routing and daily ops routine | Operations |
| 5 | Cross-referenced known issues register | Governance |

---

## Open Blockers

### Critical / High (from `release/KNOWN_ISSUES_v1.0.0.md`)

| ID | Issue | Launch impact | Status |
|----|-------|---------------|:------:|
| P0-001 | Physical device QA not signed off | Blocks public launch | Open |
| P0-002 | Offsite backups not configured | Blocks public launch | Open |
| P1-001 | Dashboard API p95 4086 ms (RC2) | Ops UI slow | Open — RC3 not deployed |
| P1-005 | Delivery prod E2E not certified | Delivery ops | Open |
| P1-006 | RC3 fixes not deployed to production | Perf + mobile fixes | Open |

### Operational (identified this sprint)

| ID | Issue | Severity |
|----|-------|----------|
| OPS-01 | No admin refund approve/reject UI | High |
| OPS-02 | No lost-property admin queue | Medium |
| OPS-03 | Fraud panel not in main admin nav | Medium |
| OPS-04 | No automated paging on health failure | High |
| OPS-05 | Stale driver online state after crash | Medium |
| OPS-06 | Ride POST endpoints lack idempotency keys | High |

---

## Critical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| RC3 not deployed — slow admin under load | High | High | Deploy golden RC; re-benchmark dashboard p95 |
| Support team cannot approve refunds in UI | Medium | High | Use Django admin or API until UI wired |
| Driver shows online but gets no rides (`account_under_review`) | Medium | Medium | Ops manual check in Fleet Center |
| No offsite backup — data loss on host failure | Low | Critical | Configure DO Spaces before scale |
| WebSocket delivery under load untested | Medium | High | Limit beta cohort; monitor Launch Hub alerts |
| Pilot cohort under-recruited (~2 drivers) | High | Medium | Active recruitment per ops manual |

---

## Recommendations

### Immediate (Week 1)

1. **Deploy RC3** to production — performance fixes, observability middleware, mobile bundle fixes.
2. **Run daily** `launch-certification-prod.py` (with SSL fallback on Windows) + manual PowerShell health check.
3. **Use `/admin/support`** as primary complaint triage; escalate fraud via Executive dashboard.
4. **Recruit drivers** toward beta cap (20) per `operations/05_DRIVER_OPERATIONS_MANUAL.md`.
5. **Configure offsite backup** credentials — resolves P0-002.

### Before cohort > 25

1. Re-benchmark dashboard APIs post-RC3 deploy (target p95 < 2000 ms).
2. WebSocket soak test (100+ connections).
3. Physical device QA sign-off (P0-001).
4. Wire refund approval into admin support center (operational gap, not v2 feature).

### Do NOT do (sprint rules)

- No new product features
- No UI redesign
- No Version 2 functionality

---

## GO / HOLD Decision

| Scenario | Decision | Rationale |
|----------|:--------:|-----------|
| **Supervised closed beta (≤25 users, Nouakchott)** | **GO** | Core ride loop tested; health OK; support intake live; earnings/withdrawals certified |
| **Expanded beta (>25 users)** | **HOLD** | WebSocket soak, dashboard perf, and device QA incomplete |
| **Public commercial release** | **HOLD** | P0 blockers open (device QA, offsite backup); RC3 not deployed; monitoring gaps |

### Final recommendation

> **GO for closed beta daily commercial operations under supervision.**  
> **HOLD public release until P0 blockers closed and RC3 deployed.**

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `operations/05_DRIVER_OPERATIONS_MANUAL.md` | Driver lifecycle SOP |
| `operations/SUPPORT_PLAYBOOK.md` | Support procedures |
| `operations/LAUNCH_MONITORING.md` | Monitoring SOP |
| `operations/INCIDENT_PLAYBOOK.md` | Incident response |
| `release/BETA_SUCCESS_METRICS.md` | 12 beta KPIs |
| `release/KNOWN_ISSUES_v1.0.0.md` | Issue register |
| `release/PERFORMANCE_SCALABILITY_CERTIFICATION.md` | Load test evidence |
| `release/OBSERVABILITY_REPORT.md` | Tracing and logging |

---

## Sign-Off

| Role | Status | Date |
|------|:------:|------|
| Launch Operations audit | ✅ Complete | 2026-07-22 |
| Admin reject defect fix | ✅ Complete | 2026-07-22 |
| RC3 production deploy | ☐ Pending | |
| CEO GO/HOLD sign-off | ☐ Pending | |

---

*YALA Enterprise v1.0 · Launch Operations Sprint · Feature freeze active*
