# Yala — Phase 14 Launch Readiness Report

**Date:** 2026-07-21  
**Commit deployed:** `a88c3544` (Operations Center, AI Operations, Production Status)  
**Certifier:** Automated + production SSH verification  

---

## Overall Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** (conditional — admin platform ready; launch blockers remain) |
| **Launch score** | **72 / 100** |
| **Go / No-Go** | **NO-GO** until backup automation and mobile re-certification are resolved |

---

## Production URLs

| Surface | URL | Status |
|---------|-----|--------|
| API | https://api.yalataxi.live | LIVE |
| Health | https://api.yalataxi.live/health/ | OK |
| Admin home | https://www.yalataxi.live/admin | OK |
| Executive dashboard | https://www.yalataxi.live/admin/executive | OK |
| Operations center | https://www.yalataxi.live/admin/operations | OK |
| AI operations | https://www.yalataxi.live/admin/ai-operations | OK |
| Production status | https://www.yalataxi.live/admin/status | OK |
| Privacy policy | https://www.yalataxi.live/privacy | OK |

---

## 1. Production Deployment — PASS

### Deployment log

```
2026-07-21 13:54 UTC  git push origin main (a88c3544)
2026-07-21 13:54 UTC  prod: git pull --ff-only 3fcd1036..a88c3544
2026-07-21 13:54 UTC  docker compose -p yala build django
2026-07-21 13:54 UTC  docker compose -p yala up -d django celery-worker celery-beat
2026-07-21 13:54 UTC  django health: healthy
2026-07-21 13:54 UTC  migrate operations — 0003_airecommendation already applied
2026-07-21 13:54 UTC  nginx reload (yala-nginx-1)
2026-07-21 13:55 UTC  frontend build uploaded (main.0ac8a662.js)
2026-07-21 13:56 UTC  launch-certification-prod.py — 13/13 PASS, score 100
2026-07-21 13:56 UTC  verify-executive-dashboard-prod.py — all endpoints PASS
```

### Verified admin routes

- `/admin/executive` — HTTP 200, all 11 executive API endpoints PASS  
- `/admin/operations` — HTTP 200, `/operations/center/dashboard/` HTTP 200 (371 ms)  
- `/admin/ai-operations` — HTTP 200, `/operations/ai/dashboard/` HTTP 200 (275 ms)  
- `/admin/status` — HTTP 200, `/api/health/status/` overall **ok** (DB, Redis, Celery, WebSocket)

---

## 2. Monitoring — PASS

| Check | Result | Detail |
|-------|--------|--------|
| API health (`/health/`) | PASS | 56 ms, `database: ok`, `redis: ok` |
| Liveness (`/api/health/live/`) | PASS | 37 ms |
| Readiness (`/api/health/ready/`) | PASS | 46 ms |
| Production status page | PASS | Staff-only aggregate at `/api/health/status/` |
| Database | PASS | Connected |
| Redis | PASS | Connected |
| Celery | PASS | 1 worker online (`celery inspect ping`) |
| WebSocket | PASS | Channels healthy (Redis-backed) |
| Error logging | PARTIAL | Sentry configured in settings; no live error injection test |
| Response times | PASS | Health ~50 ms; executive ~235 ms; ops center ~371 ms |

**Production Status UI:** https://www.yalataxi.live/admin/status (15 s auto-refresh)

---

## 3. Backup & Recovery — FAIL

| Check | Result | Detail |
|-------|--------|--------|
| Automated DB backup | **FAIL** | No root cron job; `backup-encrypted.sh` not scheduled |
| Media backup | **FAIL** | No recent media archive in `/home/yala/backups/` |
| Backup retention | **FAIL** | Only one archive present |
| Restore procedure | PARTIAL | Documented in `docs/DISASTER_RECOVERY.md`; not executed |
| Recovery test | **FAIL** | Last backup **2026-07-02** (19 days stale); no decrypt/restore drill |

**Latest backup:** `/home/yala/backups/backend-taxi-20260702-161442.tgz` (499 KB)

---

## 4. Security Audit — PARTIAL PASS

| Check | Result | Detail |
|-------|--------|--------|
| HTTPS everywhere | PASS | API and admin served over TLS; HTTP redirects |
| Security headers | PASS | `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |
| JWT expiration | PASS | Access 15 min, refresh 7 days (settings) |
| Refresh token rotation | PASS | `ROTATE_REFRESH_TOKENS: True` |
| Device binding | PASS | Configured in settings (`DEVICE_SESSION_LIMIT`) |
| OTP | PARTIAL | Implemented; prod E2E not re-run in this phase |
| Admin 2FA | PARTIAL | `ADMIN_2FA_ENABLED=true`; CEO account enrollment not verified |
| Rate limiting | PARTIAL | Password-reset returns 429; login abuse returned **503** under load (not clean 429) |
| CORS | PASS | Restricted origins in production (not allow-all) |
| Secret management | PASS | Secrets in `.env.production` on server, not in git |
| Audit logs | PARTIAL | AI recommendation actions logged; full audit trail not exhaustively verified |

---

## 5. Performance Testing — PARTIAL PASS

### Baseline latency (production, 2026-07-21)

| Endpoint | Latency |
|----------|---------|
| `/health/` | 37–56 ms |
| `/operations/executive/dashboard/` | 235 ms |
| `/operations/center/dashboard/` | 371 ms |
| `/operations/ai/dashboard/` | 275 ms |
| `/api/health/status/` | 2.2 s (includes Celery inspect) |

### Load test

| Scenario | Result |
|----------|--------|
| 150 concurrent requests (100 health + 50 executive, 80 workers) | **FAIL** — HTTP 503 under burst |
| Target: 100 riders + 50 drivers + 20 ops + 10 exec | **NOT FULLY TESTED** — single-server burst only |

### Infrastructure snapshot

| Resource | Value |
|----------|-------|
| RAM | 3.8 GiB total, ~2.2 GiB available |
| Disk | 28 GB / 78 GB used (36%) |
| Celery workers | 1 (`yala-celery-worker-1`) |
| DB queries under load | Not profiled |

**Note:** Dual Docker stacks (`yala-*` and `app-*`) run on the same host — resource contention risk under peak load.

---

## 6. Mobile QA — FAIL (not re-certified)

Prior RC4 certification (2026-07-07) was **FAIL** across Rider, Driver, Delivery. Phase 14 did not execute full device QA regression.

| App | Latest build | Gradle match | Prod E2E this phase |
|-----|--------------|--------------|---------------------|
| Rider | 1.2.7 / 19 | YES | Not run |
| Driver | 1.2.23 / 38 | YES | Not run |
| Delivery | 1.0.4 / 6 | Stale vs current work | Not run |

**Flows not re-verified on device:** registration, trip lifecycle, delivery lifecycle, wallet, withdrawals, notifications, offline recovery.

---

## 7. Play Store Readiness — PARTIAL PASS

| Check | Result |
|-------|--------|
| Version codes | PASS — Rider 19, Driver 38 match `build.gradle` |
| Signing | PASS — Release AABs in `release/android/` (2026-07-20) |
| Privacy policy | PASS — https://www.yalataxi.live/privacy |
| Account deletion | PARTIAL — flow exists; Play Console attestation not verified |
| Data Safety form | PARTIAL — not verified in Play Console this phase |
| Release notes | PARTIAL — not attached to store listings |
| Production AABs | PASS — `yala-rider-1.2.7-19-*.aab`, `yala-driver-1.2.23-38-*.aab` |

---

## 8. Operations Drill — PARTIAL PASS

API surfaces verified live; full human-in-the-loop drills not executed in this session.

| Scenario | API ready | Live drill |
|----------|-----------|------------|
| Ride request | YES | Not run |
| Delivery request | YES | Not run |
| SOS | YES | Not run |
| Driver suspension | YES | Not run |
| Withdrawal approval | YES (payments app) | Not run — payments migrations 0016–0018 not on prod |
| Refund | YES | Not run |
| Broadcast | YES (ops center) | Not run |
| Maintenance mode | YES | PASS — CEO toggle verified in executive QA |

---

## Issue Summary

### Critical blockers

1. **Automated backups not running** — last backup 2026-07-02; no cron; RPO target (24 h) violated  
2. **No recovery test** — restore procedure never validated on current data  
3. **Mobile QA not re-certified** — RC4 FAIL still applies; no device regression for launch  

### High priority

4. **Performance under burst load** — 503 errors at ~150 concurrent requests  
5. **Single Celery worker** — no redundancy for background jobs  
6. **Payments migrations 0016–0018 not deployed** — withdrawal/idempotency features incomplete on prod  
7. **Dual Docker stacks on one host** — `yala-*` and `app-*` may compete for resources  

### Medium priority

8. Admin 2FA enrollment not verified for all staff  
9. Login rate limit returns 503 instead of 429 under abuse  
10. Production status Celery check adds ~2 s latency  
11. Play Store Data Safety and account-deletion attestation pending  

### Low priority

12. Sentry alert rules not verified  
13. WebSocket load test skipped (`websocket-client` not installed on server)  
14. `makemigrations` warning for authapp/notifications/security drift  

---

## Launch Score Breakdown

| Area | Weight | Score | Weighted |
|------|--------|-------|----------|
| Deployment | 15% | 95 | 14.3 |
| Monitoring | 15% | 90 | 13.5 |
| Backup & recovery | 15% | 25 | 3.8 |
| Security | 15% | 78 | 11.7 |
| Performance | 10% | 60 | 6.0 |
| Mobile QA | 15% | 45 | 6.8 |
| Play Store | 10% | 72 | 7.2 |
| Operations drill | 5% | 55 | 2.8 |
| **Total** | | | **72.1 → 72** |

---

## Go / No-Go Recommendation

**NO-GO for public launch.**

Admin platform (Executive, Operations Center, AI Operations, Production Status) is **production-ready and deployed**. Public launch should wait until:

1. Enable daily encrypted backups + run one restore drill  
2. Re-run mobile device QA (Rider, Driver, Delivery) against current AABs  
3. Load-test at target concurrency with ≥2 Celery workers or autoscaling plan  
4. Deploy pending payments migrations if wallet/withdrawals are in launch scope  

**Conditional GO** for **internal/admin-only** use of Phase 12–13 dashboards by operations staff.

---

## Return Summary

```
PASS / FAIL:     FAIL (public launch) / PASS (admin Phase 12–13 deploy)

Production URLs: api.yalataxi.live | www.yalataxi.live/admin/{executive,operations,ai-operations,status}

Deployment log:  See §1 above — commit a88c3544, migrate 0003 applied, services healthy

Performance:     Health p50 ~50 ms; burst 150 req → 503; 1 Celery worker; 3.8 GiB RAM

Security:        HTTPS + HSTS + frame deny + nosniff; JWT 15m/7d rotation; CORS restricted

Remaining blockers: Backups, recovery test, mobile QA, burst performance, payments migrations

Launch score:    72 / 100
```

---

## Scripts used

- `scripts/launch-certification-prod.py` — 13 automated checks  
- `scripts/verify-executive-dashboard-prod.py` — executive endpoint suite  
- `scripts/launch-perf-smoke.py` — concurrent load smoke (added Phase 14)  
- `scripts/operations-drill.py` — end-to-end operations scenario drill  
- `scripts/setup-backup-cron.sh` — installs daily encrypted backup cron job  
- `scripts/backup-encrypted.sh` — DB + media encrypted backup with restore test

---

## Appendix: Phase 14 follow-up changes

Added to close launch-readiness gaps:

- `scripts/operations-drill.py`
  - Automates the operations drill scenarios: ride/delivery request, SOS center, driver pause, withdrawal/refund list, broadcast, maintenance mode.
  - Returns JSON report with pass/fail per scenario and latency.
- `scripts/setup-backup-cron.sh`
  - Idempotently installs the daily 02:00 UTC encrypted backup cron.
  - Verifies the backup script and key file are present before installing.

Local verification run:

- `python manage.py test operations` → 27/27 PASS
- `npm run build` in `frontend/` → PASS
- `operations-drill.py` and `setup-backup-cron.sh` are ready for production; they were not executed here because this environment does not have the production host or credentials.
