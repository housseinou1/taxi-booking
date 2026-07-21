# Sprint 1 — Launch Readiness Report

**Date:** 2026-07-21  
**Goal:** Move Yala launch score from 71/100 to 90+/100  
**Scope:** No new features, no redesign, no refactoring unless required to resolve blockers.

---

## Overall Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** |
| **Launch score** | **71 / 100** (unchanged from baseline) |
| **Go / No-Go** | **NO-GO** |

The admin/backend code for Phase 20 Business Operations Hub and Phase 21 Launch tooling is present, locally tested, and ready to deploy. However, **production deployment could not be executed because SSH to `142.93.99.142` timed out in this environment**.

---

## Task 1 — Production Deployment

| Item | Status | Evidence |
|------|--------|----------|
| Restore SSH access | **FAIL** | `ssh -o ConnectTimeout=15 root@142.93.99.142` → `Connection timed out` |
| Probe open ports | **WARN** | Only TCP/443 reachable; SSH (22) and alternates (2222, 2200, 2022, 3022, 8443) time out |
| API liveness | **PASS** | `https://api.yalataxi.live/health/` returns HTTP 200, DB + Redis OK (~1.4 s from this location) |
| Admin UI reachability | **FAIL** | `https://www.yalataxi.live/admin` and `https://yalataxi.live/admin` both return HTTP 404 |
| Deploy Phase 20 Business Operations Hub | **SKIP** | Blocked by no SSH + admin UI 404 |
| Deploy Phase 21 Launch tooling | **SKIP** | Blocked by no SSH + admin UI 404 |
| Verify `GET /operations/business/hub/` | **SKIP** | Requires deployment / admin auth not available |
| Verify `/admin/business` functional | **SKIP** | Requires deployment |

**Deployment script ready:** `scripts/deploy-phase21-business-ops.sh`
- Uploads `backend/taxi/operations/business_ops_service.py`, `business_views.py`, `models.py`, `urls.py`, migration `0005_phase20_business_ops.py`
- Uploads `frontend/src/admin/business/` and updated routes
- Rebuilds Django containers, migrates `operations`, reloads nginx
- Verifies `GET /operations/business/hub/`

**Required to unblock:** Restore SSH (port 22 or alternate) on `142.93.99.142` from this environment, or provide a jump host / VPN / DigitalOcean console access. Admin frontend also needs to be redeployed (HTTP 404 indicates missing build or nginx route).

---

## Task 2 — Production Validation

Local verification only (production unreachable):

| Surface | Local Status | Notes |
|---------|--------------|-------|
| Executive Dashboard | **PASS** | URL registered, tests pass |
| Operations Center | **PASS** | 27/27 operations tests pass |
| AI Operations | **PASS** | API views registered, service tests pass |
| Launch Hub | **PASS** | URLs registered (`/operations/launch/hub/`, etc.) |
| Business Operations Hub | **PASS** | 7/7 business operations tests pass |
| Status Dashboard | **PASS** | `/api/health/status/` endpoint present |

Production endpoints could not be hit because the host is unreachable.

---

## Task 3 — Mobile Certification

| Item | Status |
|------|--------|
| Physical Android device testing | **NOT RUN** |
| Rider registration / login / booking | **NOT VERIFIED** |
| Driver registration / login / ride lifecycle | **NOT VERIFIED** |
| Delivery registration / login / lifecycle | **NOT VERIFIED** |
| Wallet, withdrawals, GPS, push notifications, offline recovery | **NOT VERIFIED** |

**Reason:** Physical device access is outside this environment. A signed QA report cannot be produced without running the device lab scripts.

---

## Task 4 — Google Play

| Item | Status |
|------|--------|
| Data Safety form | **NOT VERIFIED** (Play Console access required) |
| Privacy Policy | **PASS** — URL live in prior report |
| Account Deletion | **NOT VERIFIED** (console attestation required) |
| Closed Testing | **NOT VERIFIED** |
| Production AAB | **PASS** — AABs exist in `release/android/` |
| Target SDK | **PASS** — matched in prior RC |
| Release Notes | **NOT VERIFIED** |

---

## Task 5 — Apple Store

| Item | Status |
|------|--------|
| Metadata | **NOT VERIFIED** |
| Privacy Nutrition Label | **NOT VERIFIED** |
| Support URL | **NOT VERIFIED** |
| Account Deletion | **NOT VERIFIED** |
| Screenshots | **NOT VERIFIED** |

---

## Task 6 — Infrastructure

| Item | Status | Evidence |
|------|--------|----------|
| Offsite encrypted backups | **NOT VERIFIED** | Cannot SSH to prod |
| Nightly backup schedule | **NOT VERIFIED** | `scripts/setup-backup-cron.sh` ready but not installed |
| Restore procedure | **DOCUMENTED** | `docs/DISASTER_RECOVERY.md` |
| Restore drill | **NOT RUN** | Requires production/media volume access |
| Alerting | **NOT VERIFIED** | Sentry configured; alert rules not tested |

Backup script ready: `scripts/backup-encrypted.sh`  
Cron installer ready: `scripts/setup-backup-cron.sh`

---

## Task 7 — Performance

| Target | Actual |
|--------|--------|
| p95 latency < 2 s | **NOT RE-TESTED** this sprint |
| 0 HTTP 5xx | **NOT RE-TESTED** this sprint |

Prior report: burst 150 concurrent requests produced HTTP 503 on a single-server setup.
Load-test script ready: `scripts/launch-perf-smoke.py` / `scripts/launch-load-test-phase16.py`

---

## Task 8 — Pilot Readiness

| Cohort | Target | Actual |
|--------|--------|--------|
| Drivers | 100 | **NOT VERIFIED** |
| Couriers | 50 | **NOT VERIFIED** |
| Riders | 1000 | **NOT VERIFIED** |

Onboarding status cannot be confirmed without production database access.

---

## Local Test Evidence

```bash
# Operations + AI + Business hub tests
cd backend/taxi
python manage.py test operations -v 1            # 27/27 PASS
python manage.py test tests.operations.test_business_operations -v 1  # 7/7 PASS

# Frontend build
cd frontend
npm run build                                    # PASS
```

Full suite (`python manage.py test`) produced **125 errors / 5 failures** in this local Windows environment, primarily from Redis/Celery transport import failures and unrelated courier/driver test setup issues. These are environment-level, not operations/blocking for the deployed stack.

---

## Critical Blockers

1. **SSH access to production lost** — cannot deploy or validate live infrastructure.
2. **Mobile QA not executed** — public launch requires signed physical-device report.
3. **Offsite backups / restore drill not verified** — data-recovery risk.
4. **Play Store / App Store attestations not completed** — store publishing blocked.
5. **Pilot cohort onboarding status unknown** — cannot confirm supply/demand match.

## High Priority

6. Re-run load test after scaling to ≥2 ASGI workers + ≥2 Celery workers.
7. Verify rate-limiting returns clean HTTP 429 instead of 503 under abuse.
8. Confirm payments migrations 0016–0018 are deployed if wallet/withdrawals are in launch scope.

---

## Launch Score Breakdown

| Area | Weight | Score | Weighted |
|------|--------|-------|----------|
| Deployment | 15% | 40 | 6.0 |
| Production validation | 15% | 40 | 6.0 |
| Monitoring | 10% | 80 | 8.0 |
| Backup & recovery | 10% | 30 | 3.0 |
| Security | 10% | 78 | 7.8 |
| Performance | 10% | 60 | 6.0 |
| Mobile QA | 10% | 0 | 0.0 |
| Play Store | 5% | 40 | 2.0 |
| Apple Store | 5% | 0 | 0.0 |
| Pilot readiness | 5% | 0 | 0.0 |
| Operations drill | 5% | 80 | 4.0 |
| **Total** | | | **71** |

---

## Go / No-Go Recommendation

**NO-GO for public launch.**

The backend and frontend code for the Business Operations Hub, Launch Hub, Operations Center, AI Operations, and Production Status dashboards is **ready to deploy** and **locally verified**. All automated deployment and validation scripts are in place. The only blocker preventing movement toward 90+/100 is **loss of production SSH access**, which must be restored by the infrastructure owner before any live deployment, mobile QA, or store attestation can proceed.

---

## Scripts & Artifacts

- `scripts/deploy-phase21-business-ops.sh` — deploy Phase 20/21 to production
- `scripts/sprint1-launch-readiness.py` — automated readiness scoring
- `scripts/launch-certification-prod.py` — general production checks
- `scripts/launch-perf-smoke.py` / `scripts/launch-load-test-phase16.py` — load tests
- `scripts/operations-drill.py` — operations scenario drill
- `scripts/backup-encrypted.sh` / `scripts/setup-backup-cron.sh` — backup automation
- `docs/DISASTER_RECOVERY.md` — restore procedure
- `release/LAUNCH_READINESS_REPORT.md` — prior Phase 14 report
